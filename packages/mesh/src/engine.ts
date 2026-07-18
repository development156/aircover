import type { ZodType } from 'zod'
import type { AiLogStatus, MeshContext, MeshTaskDef, MeshUsage, ModelTier } from '@sahoda/shared'
import { appError } from '@sahoda/shared'
import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  Provider,
  ProviderUsage,
} from './providers/types'
import { ProviderCallError } from './providers/types'
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
}

export type MeshResult<O> = (
  { ok: true; data: O; fallback?: true } | { ok: false; error: ReturnType<typeof appError> }
) & {
  usage?: MeshUsage
}

const REPAIR_CODE = 'JSON_REPAIR_FAILED'

function buildRequest(model: string, messages: ChatMessage[], maxTokens: number): ChatRequest {
  return { model, messages, maxTokens, jsonMode: true }
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

  async function run<I, O>(
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
    const attempts = deps.planAttempts(def.tier)

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
      await writeLog(toLogRow(def, ctx, undefined, 'error', 'PROVIDER_UNAVAILABLE'))
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

    if (!parsed.ok) {
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

    if (parsed.ok) {
      const status: AiLogStatus = isFallbackProvider ? 'fallback' : 'ok'
      await writeLog(toLogRow(def, ctx, usage, status, null))
      return { ok: true, data: parsed.value, usage }
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

  return { run }
}
