import type { ZodType } from 'zod'
import type { AiLogStatus, MeshContext, MeshTaskDef, MeshUsage, ModelTier } from '@sahoda/shared'
import { appError } from '@sahoda/shared'
import type {
  ChatMessage,
  ChatRequest,
  FileAnnotation,
  ChatResponse,
  ImageRequest,
  Provider,
  ProviderUsage,
} from './providers/types'
import { ProviderCallError } from './providers/types'
import { FREE_PDF_ENGINE } from './providers/openrouter'
import type { LogSink, ProviderLogRow } from './telemetry'
import type { BrandContextProvider } from './brand-context'

/** One ordered provider+model to try for a task (primary OpenRouter, then OpenAI). */
export interface Attempt {
  provider: Provider
  model: string
}

/**
 * A mesh-internal task: the frozen `MeshTaskDef` plus the prompt builder and the
 * optional demo-fallback payload. `buildMessages` puts the cache-controlled Brand
 * prefix first (marked `cache:true`) and the user payload last.
 */
export interface MeshTaskSpec<I, O> {
  def: MeshTaskDef<I, O>
  /**
   * System contract first, the (optional) cache-controlled Brand Brain block next,
   * user payload last. `brand` is supplied by the runner only for tasks whose def
   * declares `cachePrefix: 'brand_context'`; brand-less tasks ignore it.
   */
  buildMessages: (input: I, ctx: MeshContext, brand?: ChatMessage) => ChatMessage[]
  /** brand_guidelines only — served (flagged) on a double JSON failure. */
  fallbackPayload?: (input: I) => O
}

/**
 * A first attempt that failed its schema and had to be repaired.
 *
 * A repair is a DEFECT, not a success: it doubles the call (the retry resends
 * every original message), and until now nothing recorded that it happened —
 * a repaired call and a clean one both logged `status: 'ok'`. This is the seam
 * that makes the first-attempt error visible at all.
 */
export interface RepairEvent {
  task: string
  traceId: string
  /** zod's own message for the FIRST attempt. The diagnosis lives here. */
  reason: string
  /** Truncated raw first-attempt text. Diagnostic only — never written to the DB. */
  sample: string
  /** Did the one retry succeed, or did the call fail outright? */
  recovered: boolean
}

export interface MeshRunnerDeps {
  /** Ordered providers for a tier: [OpenRouter primary, OpenAI fallback]. */
  planAttempts: (tier: ModelTier) => Attempt[]
  logSink: LogSink
  /** Monotonic clock (ms) — injected for latency + testability. */
  now: () => number
  /** USD cost from raw token usage — injected so pricing stays swappable. */
  price: (usage: ProviderUsage) => number
  /** Resolves the Brand Brain prefix for `cachePrefix: 'brand_context'` tasks (best-effort). */
  brandContext?: BrandContextProvider
  /**
   * Called whenever a first attempt fails its schema. Best-effort observability
   * — it must never break the user's action, so it is wrapped in a try.
   */
  onRepair?: (event: RepairEvent) => void
  /**
   * The one image-capable provider and the model to ask. Undefined when the rail
   * is not configured, and `runImage` then fails honestly rather than reaching for
   * a text model that would return a paragraph describing a picture.
   */
  planImage?: (tier: ModelTier) => { provider: Provider; model: string } | undefined
}

export type MeshResult<O> = (
  | { ok: true; data: O; fallback?: true; annotations?: FileAnnotation[] }
  | { ok: false; error: ReturnType<typeof appError> }
) & {
  usage?: MeshUsage
}

const REPAIR_CODE = 'JSON_REPAIR_FAILED'
/** First attempt failed its schema, the one retry rescued it. Cost: two calls. */
const REPAIRED_CODE = 'JSON_REPAIRED'

function buildRequest(model: string, messages: ChatMessage[], maxTokens: number): ChatRequest {
  const carriesFile = messages.some((m) => (m.files?.length ?? 0) > 0)
  // Spelled out on every file-bearing call. See ChatRequest.pdfEngine: the
  // provider default is not free.
  return {
    model,
    messages,
    maxTokens,
    jsonMode: true,
    ...(carriesFile ? { pdfEngine: FREE_PDF_ENGINE } : {}),
  }
}

/** Strip a ```json … ``` fence if present, then trim. */
function extractJson(text: string): string {
  const trimmed = text.trim()
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)
  return fence ? fence[1]!.trim() : trimmed
}

type ParseResult<O> = { ok: true; value: O } | { ok: false; error: string }

function safeParseOutput<O>(schema: ZodType<O>, text: string): ParseResult<O> {
  let obj: unknown
  try {
    obj = JSON.parse(extractJson(text))
  } catch {
    return { ok: false, error: 'response was not valid JSON' }
  }
  const parsed = schema.safeParse(obj)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, error: parsed.error.message }
}

function buildRepairMessages(
  messages: ChatMessage[],
  previous: string,
  error: string,
): ChatMessage[] {
  return [
    ...messages,
    { role: 'assistant', content: previous },
    {
      role: 'user',
      content: `Your previous response did not match the required JSON schema (${error}). Respond with ONLY valid minified JSON matching the schema — no markdown, no prose.`,
    },
  ]
}

function sumUsage(a: ProviderUsage, b: ProviderUsage): ProviderUsage {
  return {
    provider: a.provider,
    model: a.model,
    tokensIn: a.tokensIn + b.tokensIn,
    tokensOut: a.tokensOut + b.tokensOut,
    cachedTokens: a.cachedTokens + b.cachedTokens,
  }
}

export function createMeshRunner(deps: MeshRunnerDeps) {
  function toLogRow(
    def: MeshTaskDef<unknown, unknown>,
    ctx: MeshContext,
    usage: MeshUsage | undefined,
    status: AiLogStatus,
    errorCode: string | null,
  ): ProviderLogRow {
    return {
      workspace_id: ctx.workspaceId,
      task: def.name,
      tier: def.tier,
      provider: usage?.provider ?? null,
      model: usage?.model ?? null,
      tokens_in: usage?.tokensIn ?? null,
      tokens_out: usage?.tokensOut ?? null,
      cached_tokens: usage?.cachedTokens ?? null,
      cost_usd: usage?.costUsd ?? null,
      latency_ms: usage?.latencyMs ?? null,
      credits_charged: ctx.creditsCharged ?? null,
      status,
      error_code: errorCode,
      trace_id: ctx.traceId,
    }
  }

  /** Best-effort — a telemetry write must never break the user's model action. */
  async function writeLog(row: ProviderLogRow): Promise<void> {
    try {
      await deps.logSink.write(row)
    } catch {
      /* swallow: telemetry is not on the critical path */
    }
  }

  async function execute<I, O>(
    spec: MeshTaskSpec<I, O>,
    input: I,
    ctx: MeshContext,
  ): Promise<MeshResult<O>> {
    const { def } = spec

    // Brand grounding: fetch the cache-controlled Brand Brain prefix for tasks that
    // ask for it. Best-effort — a brand-fetch hiccup must never fail the action (the
    // model still returns real output, just less grounded).
    let brand: ChatMessage | undefined
    if (def.cachePrefix === 'brand_context' && deps.brandContext) {
      try {
        brand = (await deps.brandContext.get(ctx.workspaceId))?.message
      } catch {
        /* proceed brand-less */
      }
    }

    const messages = spec.buildMessages(input, ctx, brand)

    // A file may only go to a provider that can honour an explicit PDF engine.
    // The chain is [OpenRouter, OpenAI] and only the first has the file-parser
    // plugin, so an unfiltered fallback would hand the same brand book to a
    // provider that parses it as native input tokens — a charge nobody chose,
    // on the failure path, where no happy-path test looks. Filtering here means
    // a PDF call with no capable provider fails honestly instead.
    const carriesFile = messages.some((m) => (m.files?.length ?? 0) > 0)
    const attempts = deps
      .planAttempts(def.tier)
      .filter((a) => !carriesFile || a.provider.supportsFiles === true)

    // 1) Fallback chain: try each provider until one responds.
    let responded: { attempt: Attempt; chat: ChatResponse; latencyMs: number } | undefined
    let lastProviderError: ProviderCallError | undefined
    for (const attempt of attempts) {
      const started = deps.now()
      try {
        const chat = await attempt.provider.chat(
          buildRequest(attempt.model, messages, def.maxTokens),
        )
        responded = { attempt, chat, latencyMs: deps.now() - started }
        break
      } catch (e) {
        if (e instanceof ProviderCallError) {
          lastProviderError = e
          continue
        }
        throw e
      }
    }

    if (!responded) {
      const code =
        carriesFile && attempts.length === 0 ? 'NO_FILE_PROVIDER' : 'PROVIDER_UNAVAILABLE'
      await writeLog(toLogRow(def, ctx, undefined, 'error', code))
      return {
        ok: false,
        error: appError('PROVIDER_ERROR', 'all providers failed to respond', ctx.traceId, {
          lastStatus: lastProviderError?.status ?? null,
        }),
      }
    }

    // 2) zod-parse the output, with exactly one repair retry on the responding provider.
    const isFallbackProvider = responded.attempt !== attempts[0]
    let combined = responded.chat.usage
    let latencyMs = responded.latencyMs
    let parsed = safeParseOutput(def.outputSchema, responded.chat.text)

    // Non-null iff the first attempt failed its schema. Carried to the log row
    // so a repair stops being invisible, and to onRepair so it can be diagnosed.
    let firstAttemptError: string | null = null

    if (!parsed.ok) {
      firstAttemptError = parsed.error
      const repairMessages = buildRepairMessages(messages, responded.chat.text, parsed.error)
      const started = deps.now()
      try {
        const repair = await responded.attempt.provider.chat(
          buildRequest(responded.attempt.model, repairMessages, def.maxTokens),
        )
        latencyMs += deps.now() - started
        combined = sumUsage(combined, repair.usage)
        parsed = safeParseOutput(def.outputSchema, repair.text)
      } catch (e) {
        if (!(e instanceof ProviderCallError)) throw e
        /* repair call failed at transport — `parsed` stays not-ok */
      }
    }

    const usage: MeshUsage = {
      provider: combined.provider,
      model: combined.model,
      tokensIn: combined.tokensIn,
      tokensOut: combined.tokensOut,
      cachedTokens: combined.cachedTokens,
      costUsd: deps.price(combined),
      latencyMs,
    }

    if (firstAttemptError !== null) {
      try {
        deps.onRepair?.({
          task: def.name,
          traceId: ctx.traceId,
          reason: firstAttemptError,
          sample: responded.chat.text.slice(0, 2000),
          recovered: parsed.ok,
        })
      } catch {
        /* observability must never break the action */
      }
    }

    if (parsed.ok) {
      const status: AiLogStatus = isFallbackProvider ? 'fallback' : 'ok'
      // `status` cannot say "repaired" — it carries a DB CHECK constraint of
      // ('ok','error','fallback') and widening it is a migration, which is
      // wt-db's lane. `error_code` is free text and null on every clean call,
      // so a non-null error_code beside status 'ok' is an unambiguous and
      // queryable "recovered from a defect". Requested properly in
      // packages/mesh/REQUESTS.md.
      await writeLog(toLogRow(def, ctx, usage, status, firstAttemptError ? REPAIRED_CODE : null))
      // Annotations ride out so the caller can replay the parse and not pay for
      // it twice. Kept off the frozen Result<O> shape, like `fallback`.
      return responded.chat.annotations
        ? { ok: true, data: parsed.value, usage, annotations: responded.chat.annotations }
        : { ok: true, data: parsed.value, usage }
    }

    // 3) Double JSON failure: demo-fallback (brand_guidelines) or typed PROVIDER_ERROR.
    if (spec.fallbackPayload) {
      const data = spec.fallbackPayload(input)
      await writeLog(toLogRow(def, ctx, usage, 'fallback', REPAIR_CODE))
      return { ok: true, data, fallback: true, usage }
    }

    await writeLog(toLogRow(def, ctx, usage, 'error', REPAIR_CODE))
    return {
      ok: false,
      error: appError('PROVIDER_ERROR', 'model returned unparseable output', ctx.traceId),
      usage,
    }
  }

  /**
   * Public entry. `execute` already writes a row + returns a typed error for the
   * known failure modes (no provider responded, unparseable output). This outer
   * catch is the backstop for an UNEXPECTED throw — a bug in buildMessages /
   * planAttempts / price, or a provider that threw something other than a
   * ProviderCallError — so that path still yields exactly one ai_provider_logs row
   * and a typed PROVIDER_ERROR, never a raw promise rejection. Keeps the frozen
   * runner guarantees ('typed error' + 'a row on every path') true on all paths.
   */
  async function run<I, O>(
    spec: MeshTaskSpec<I, O>,
    input: I,
    ctx: MeshContext,
  ): Promise<MeshResult<O>> {
    try {
      return await execute(spec, input, ctx)
    } catch {
      await writeLog(toLogRow(spec.def, ctx, undefined, 'error', 'UNEXPECTED_ERROR'))
      return {
        ok: false,
        error: appError('PROVIDER_ERROR', 'mesh task failed unexpectedly', ctx.traceId),
      }
    }
  }

  /**
   * Generate one image.
   *
   * Deliberately NOT `execute` with a flag. That function's body is entirely about
   * text: it builds a message list, asks for JSON mode, parses and repairs the
   * answer against a zod schema, and can serve a fallback payload. An image call
   * shares none of it, and threading a branch through all four stages would put
   * image concerns in the path every text task takes. What the two DO share is
   * telemetry, and that is shared here.
   *
   * There is no fallback chain. One provider; if it fails, the task fails and the
   * caller releases its credit hold. See IMAGE_ROUTES for why falling back to a
   * text model — which would return a paragraph DESCRIBING a picture — is worse
   * than an honest failure.
   */
  async function runImage(
    def: MeshTaskDef<unknown, unknown>,
    req: Omit<ImageRequest, 'model'>,
    ctx: MeshContext,
  ): Promise<MeshResult<{ base64: string; mime: string }>> {
    const planned = deps.planImage?.(def.tier)
    if (!planned?.provider.image) {
      await writeLog(toLogRow(def, ctx, undefined, 'error', 'NO_IMAGE_PROVIDER'))
      return {
        ok: false,
        error: appError('PROVIDER_ERROR', 'no image-capable provider is configured', ctx.traceId),
      }
    }

    const started = deps.now()
    try {
      const result = await planned.provider.image({ ...req, model: planned.model })
      const usage: MeshUsage = {
        ...result.usage,
        costUsd: deps.price(result.usage),
        latencyMs: deps.now() - started,
      }
      await writeLog(toLogRow(def, ctx, usage, 'ok', null))
      return { ok: true, data: { base64: result.base64, mime: result.mime }, usage }
    } catch (e) {
      const status = e instanceof ProviderCallError ? e.status : null
      await writeLog(
        toLogRow(def, ctx, undefined, 'error', status === null ? 'NETWORK' : `HTTP_${status}`),
      )
      // Our own message — a provider error can echo the prompt back.
      return {
        ok: false,
        error: appError('PROVIDER_ERROR', 'image generation failed', ctx.traceId),
      }
    }
  }

  return { run, runImage }
}
