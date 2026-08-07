import type { ZodType } from 'zod'
import type { ModelTier } from '../enums'
import type { Result } from '../errors'

/** Context threaded through a mesh call. `actionType`/`creditsCharged` come from withCredits for telemetry. */
export interface MeshContext {
  workspaceId: string
  traceId: string
  userId?: string
  actionType?: string
  creditsCharged?: number
}

/** Per-call cost/latency telemetry, written to ai_provider_logs. */
export interface MeshUsage {
  provider: string
  model: string
  tokensIn: number
  tokensOut: number
  cachedTokens: number
  costUsd: number
  latencyMs: number
}

/**
 * A model task definition. `maxTokens` is always explicit; the Brand Brain context
 * block rides as the cache-controlled prefix when `cachePrefix` is set.
 */
export interface MeshTaskDef<I, O> {
  name: string
  tier: ModelTier
  inputSchema: ZodType<I>
  outputSchema: ZodType<O>
  maxTokens: number
  cachePrefix?: 'brand_context'
}

/**
 * The single entry point for every model call (packages/mesh implements it,
 * server-side only). Guarantees: output zod-parsed with exactly one repair retry;
 * fallback chain primary → alternate → typed PROVIDER_ERROR (never a silent mock);
 * every call writes an ai_provider_logs row.
 */
export type RunTask = <I, O>(
  def: MeshTaskDef<I, O>,
  input: I,
  ctx: MeshContext,
) => Promise<Result<O> & { usage?: MeshUsage }>
