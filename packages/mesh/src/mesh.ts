import { appError } from '@sahoda/shared'
import type { MeshContext, MeshTaskDef, ModelTier, RunTask } from '@sahoda/shared'
import { keyClassForTier, loadMeshConfig, type KeyClass } from './config'
import type { FetchLike, Provider, ProviderUsage } from './providers/types'
import { createOpenRouterProvider } from './providers/openrouter'
import { createOpenAIProvider } from './providers/openai'
import { createPostgrestLogSink } from './telemetry'
import { createPostgrestBrandContext } from './brand-context'
import { createMeshRunner, type Attempt, type MeshResult, type MeshTaskSpec } from './engine'
import { TIER_ROUTES } from './routing'
import { brandGuidelinesTask } from './tasks/brand-guidelines'
import { captionRewriteTask } from './tasks/caption-rewrite'
import { contentVariantsTask } from './tasks/content-variants'
import { planWeekTask } from './tasks/plan-week'
import { siteGenerateTask } from './tasks/site-generate'

/** Rough $/1M-token estimate for ai_provider_logs margin telemetry (not billing). */
function estimateCostUsd(u: ProviderUsage): number {
  const model = u.model.toLowerCase()
  const [inRate, outRate] = model.includes('haiku')
    ? [1, 5]
    : model.includes('opus')
      ? [5, 25]
      : [3, 15] // sonnet / gpt-4o default
  return (u.tokensIn * inRate + u.tokensOut * outRate) / 1_000_000
}

export interface CreateMeshOptions {
  env?: Record<string, string | undefined>
  /** Injectable transport for provider + telemetry calls (tests). Defaults to global fetch. */
  fetchImpl?: FetchLike
}

export interface Mesh {
  runTask: RunTask
}

/** A task's run bound to its concrete input/output types, with the generics erased at the boundary. */
type BoundRun = (input: unknown, ctx: MeshContext) => Promise<MeshResult<unknown>>

/**
 * Composition root: env → provider clients (3 cost-isolated OpenRouter keys +
 * OpenAI) → tier router → telemetry sink → the runTask engine. Server-only.
 */
export function createMesh(opts: CreateMeshOptions = {}): Mesh {
  const cfg = loadMeshConfig(opts.env ?? process.env)

  const openRouterByClass: Record<KeyClass, Provider> = {
    research: createOpenRouterProvider(cfg.openRouterKeys.research, opts.fetchImpl),
    text: createOpenRouterProvider(cfg.openRouterKeys.text, opts.fetchImpl),
    image: createOpenRouterProvider(cfg.openRouterKeys.image, opts.fetchImpl),
  }
  const openai = createOpenAIProvider(cfg.openaiKey, opts.fetchImpl)

  const planAttempts = (tier: ModelTier): Attempt[] => {
    const route = TIER_ROUTES[tier]
    return [
      { provider: openRouterByClass[keyClassForTier(tier)], model: route.openRouter },
      { provider: openai, model: route.openai },
    ]
  }

  const logSink = createPostgrestLogSink({
    supabaseUrl: cfg.supabaseUrl,
    serviceKey: cfg.supabaseServiceKey,
    fetchImpl: opts.fetchImpl,
  })

  // Brand grounding for cachePrefix tasks — fetched via the service-role key,
  // cached by Brain version. Server-only, like the log sink.
  const brandContext = createPostgrestBrandContext({
    supabaseUrl: cfg.supabaseUrl,
    serviceKey: cfg.supabaseServiceKey,
    fetchImpl: opts.fetchImpl,
  })

  const runner = createMeshRunner({
    planAttempts,
    logSink,
    now: () => Date.now(),
    price: estimateCostUsd,
    brandContext,
  })

  // Bind each wired task's run with its concrete generics captured here, then
  // erase to BoundRun so the dispatch map can hold them together.
  const dispatch = new Map<string, BoundRun>()
  const register = <I, O>(spec: MeshTaskSpec<I, O>): void => {
    dispatch.set(spec.def.name, (input, ctx) => runner.run(spec, input as I, ctx))
  }
  register(brandGuidelinesTask)
  register(captionRewriteTask)
  register(contentVariantsTask)
  register(planWeekTask)
  register(siteGenerateTask)

  async function runTask<I, O>(
    def: MeshTaskDef<I, O>,
    input: I,
    ctx: MeshContext,
  ): Promise<MeshResult<O>> {
    const run = dispatch.get(def.name)
    if (!run) {
      return {
        ok: false,
        error: appError('VALIDATION_ERROR', `unknown mesh task: ${def.name}`, ctx.traceId),
      }
    }
    return (await run(input, ctx)) as MeshResult<O>
  }

  return { runTask }
}
