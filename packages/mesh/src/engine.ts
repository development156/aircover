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
import type { KnowledgeContextProvider } from './knowledge-context'
import type { MarketContextProvider } from './market-context'

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
  buildMessages: (
    input: I,
    ctx: MeshContext,
    brand?: ChatMessage,
    knowledge?: ChatMessage,
    market?: ChatMessage,
  ) => ChatMessage[]
  /**
   * The text to retrieve library passages against — the brief the model is about
   * to write from, in the task's own words.
   *
   * Present ONLY on tasks that should read the knowledge library. It lives here
   * and not on `MeshTaskDef` because a def is a frozen shared contract and this
   * is a function over the task's own input; and it is a second flag rather than
   * a second meaning for `cachePrefix` because brand and knowledge have opposite
   * cache behaviour (one block per workspace vs. one per request) and must not
   * share a switch.
   */
  knowledgeQuery?: (input: I) => string
  /**
   * Whether this task should be told what the Marketing Brain has measured.
   *
   * A boolean and not a function, unlike `knowledgeQuery`, because there is
   * nothing to select on: a workspace has a handful of observations and every
   * one of them bears on what to write. A third flag rather than a third meaning
   * for either of the two above, for the reason the knowledge one gives — these
   * three blocks have three different lifetimes (per brand version, per request,
   * per week) and must not share a switch.
   */
  wantsMarketContext?: boolean
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
  /** Retrieves library passages for tasks declaring `knowledgeQuery` (best-effort). */
  knowledgeContext?: KnowledgeContextProvider
  /** Retrieves observations for tasks declaring `wantsMarketContext` (best-effort). */
  marketContext?: MarketContextProvider
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
  planImage?: (
    tier: ModelTier,
    requested?: string,
  ) => { provider: Provider; model: string } | undefined
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
/** The answer was cut off at max_tokens. A ceiling problem, not a model problem. */
const TRUNCATED_CODE = 'OUTPUT_TRUNCATED'

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
  /**
   * `repaired` is a REQUIRED parameter, not an optional one defaulting to false.
   *
   * ProviderLogRow derives from the frozen shared row schema, where `repaired` is
   * required — so every call site below has to answer the question rather than
   * inherit a silent `false`. That is the point: the column exists because a
   * repaired call and a clean call were indistinguishable, and a defaulted
   * parameter would have rebuilt that blindness one layer up.
   */
  function toLogRow(
    def: MeshTaskDef<unknown, unknown>,
    ctx: MeshContext,
    usage: MeshUsage | undefined,
    status: AiLogStatus,
    errorCode: string | null,
    repaired: boolean,
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
      repaired,
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

    // Grounding: the cache-controlled Brand Brain prefix for tasks that ask for it,
    // and library passages for tasks that declare a query. BOTH are best-effort —
    // a fetch hiccup must never fail a paid action; the model still returns real
    // output, just less grounded. Concurrent because they are two independent
    // reads and a user is waiting on the sum of them.
    const [brand, knowledge, market] = await Promise.all([
      (async (): Promise<ChatMessage | undefined> => {
        if (def.cachePrefix !== 'brand_context' || !deps.brandContext) return undefined
        try {
          return (await deps.brandContext.get(ctx.workspaceId))?.message
        } catch {
          return undefined /* proceed brand-less */
        }
      })(),
      (async (): Promise<ChatMessage | undefined> => {
        if (!spec.knowledgeQuery || !deps.knowledgeContext) return undefined
        try {
          const brief = spec.knowledgeQuery(input)
          return (await deps.knowledgeContext.get(ctx.workspaceId, brief)) ?? undefined
        } catch {
          return undefined /* proceed without passages */
        }
      })(),
      (async (): Promise<ChatMessage | undefined> => {
        if (!spec.wantsMarketContext || !deps.marketContext) return undefined
        try {
          return (await deps.marketContext.get(ctx.workspaceId)) ?? undefined
        } catch {
          return undefined /* proceed without observations */
        }
      })(),
    ])

    const messages = spec.buildMessages(input, ctx, brand, knowledge, market)

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
      // No provider answered at all, so there was no output to fail a schema and
      // no repair to spend.
      await writeLog(toLogRow(def, ctx, undefined, 'error', code, false))
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

    // TRUNCATION IS NOT REPAIRABLE — do not spend a second call proving it.
    //
    // A repair replays the same request under the SAME budget, so a response cut
    // off at max_tokens is cut off again. Worse than wasteful: `plan_week`
    // requires exactly 5 briefs and three arrays are pinned at exactly 3, so a
    // truncated-then-repaired answer can PASS the schema while silently holding
    // less than the caller asked for. Fail loudly and name the ceiling, so the
    // fix is a number someone can change rather than a mystery to re-diagnose.
    if (responded.chat.truncated === true) {
      const usageNow: MeshUsage = {
        provider: combined.provider,
        model: combined.model,
        tokensIn: combined.tokensIn,
        tokensOut: combined.tokensOut,
        cachedTokens: combined.cachedTokens,
        costUsd: deps.price(combined),
        latencyMs,
      }
      // FALSE, and this is the one place it needs saying: truncation returns
      // BEFORE the repair block precisely because a repair cannot fix a ceiling.
      // No second call was made, so the call did not bill twice.
      await writeLog(toLogRow(def, ctx, usageNow, 'error', TRUNCATED_CODE, false))
      return {
        ok: false,
        error: appError(
          'PROVIDER_ERROR',
          `model output hit the ${def.maxTokens}-token ceiling for ${def.name} and was cut off`,
          ctx.traceId,
          { task: def.name, maxTokens: def.maxTokens },
        ),
        usage: usageNow,
      }
    }

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

    /**
     * THE VALUE THAT GOES TO THE DB, for all three outcomes below.
     *
     * Derived from `firstAttemptError`, not restated as a literal at each write:
     * the two failure paths are only reachable when the first parse failed, so a
     * hand-written `true` would be correct today and a lie the moment someone
     * makes them reachable another way. It is deliberately NOT `parsed.ok` — a
     * repair that failed still cost the second call, and `status` already carries
     * the success/failure axis.
     */
    const repaired = firstAttemptError !== null

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
      await writeLog(
        toLogRow(def, ctx, usage, status, firstAttemptError ? REPAIRED_CODE : null, repaired),
      )
      // Annotations ride out so the caller can replay the parse and not pay for
      // it twice. Kept off the frozen Result<O> shape, like `fallback`.
      return responded.chat.annotations
        ? { ok: true, data: parsed.value, usage, annotations: responded.chat.annotations }
        : { ok: true, data: parsed.value, usage }
    }

    // 3) Double JSON failure: demo-fallback (brand_guidelines) or typed PROVIDER_ERROR.
    if (spec.fallbackPayload) {
      const data = spec.fallbackPayload(input)
      await writeLog(toLogRow(def, ctx, usage, 'fallback', REPAIR_CODE, repaired))
      return { ok: true, data, fallback: true, usage }
    }

    await writeLog(toLogRow(def, ctx, usage, 'error', REPAIR_CODE, repaired))
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
      // An unexpected throw: `repaired` lives inside `execute` and is gone with
      // its frame. FALSE understates rather than invents — see the column
      // comment, where false already means "no repair recorded", not "ran clean".
      await writeLog(toLogRow(spec.def, ctx, undefined, 'error', 'UNEXPECTED_ERROR', false))
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
  ): Promise<MeshResult<{ base64: string; mime: string; providerCostUsd?: number }>> {
    const planned = deps.planImage?.(def.tier, req.modelId)
    if (!planned?.provider.image) {
      await writeLog(toLogRow(def, ctx, undefined, 'error', 'NO_IMAGE_PROVIDER', false))
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
        // THE PROVIDER'S OWN FIGURE WINS. `deps.price` applies CHAT token rates,
        // and an image model billed per image produces a number nobody quoted
        // (docs/43 §1). The estimate stays as the fallback for a provider that
        // reports nothing, because a rough figure beats a blank telemetry row,
        // but it is never preferred over a real one.
        costUsd: result.costUsd ?? deps.price(result.usage),
        latencyMs: deps.now() - started,
      }
      // Images are bytes, never zod-parsed, so this path has no repair to record
      // and never will. FALSE here is permanent, not a placeholder.
      await writeLog(toLogRow(def, ctx, usage, 'ok', null, false))
      return {
        ok: true,
        // Handed back SEPARATELY from `usage.costUsd`, and undefined when the
        // provider said nothing. A caller storing a cost for a customer to read
        // must be able to tell a reported figure from an estimate, and one field
        // holding either cannot say which it is.
        data: { base64: result.base64, mime: result.mime, providerCostUsd: result.costUsd },
        usage,
      }
    } catch (e) {
      const status = e instanceof ProviderCallError ? e.status : null
      await writeLog(
        toLogRow(
          def,
          ctx,
          undefined,
          'error',
          status === null ? 'NETWORK' : `HTTP_${status}`,
          false,
        ),
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
