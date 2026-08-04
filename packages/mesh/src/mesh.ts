import { appError } from '@sahoda/shared'
import type {
  ImageGenerateInput,
  ImageGenerateOutput,
  MeshContext,
  MeshTaskDef,
  ModelTier,
  RunTask,
} from '@sahoda/shared'
import { IMAGE_SIZES, ImageGenerateInputSchema } from '@sahoda/shared'
import { keyClassForTier, loadMeshConfig, type KeyClass } from './config'
import { imageGenerateDef } from './tasks/image-generate'
import type { FetchLike, Provider, ProviderUsage } from './providers/types'
import { createOpenRouterProvider } from './providers/openrouter'
import { createOpenAIProvider } from './providers/openai'
import { createPostgrestLogSink } from './telemetry'
import { createPostgrestBrandContext } from './brand-context'
import { createMeshRunner, type Attempt, type MeshResult, type MeshTaskSpec } from './engine'
import { TIER_ROUTES, imageModelForTier } from './routing'
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
  /**
   * Generate an image. Separate from `runTask` because the answer is bytes, not a
   * zod-parsed object — see the note on the runner's `runImage`.
   */
  runImage(
    input: ImageGenerateInput,
    ctx: MeshContext,
  ): Promise<MeshResult<ImageGenerateOutput>>
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

  /**
   * The image plan: the IMAGE key class, not the tier's.
   *
   * `keyClassForTier` sends every non-research tier to TEXT, which is right for
   * chat and wrong here — OPENROUTER_API_KEY_IMAGE exists precisely so image spend
   * is cost-isolated from text spend (TSD §4), and routing images through the text
   * key would merge the two budgets the split was created to keep apart.
   *
   * Undefined when the tier has no image model, which is how `runImage` learns to
   * refuse rather than guess.
   */
  const planImage = (tier: ModelTier): { provider: Provider; model: string } | undefined => {
    const model = imageModelForTier(tier)
    return model === undefined ? undefined : { provider: openRouterByClass.image, model }
  }

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
    planImage,
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

  async function runImage(
    input: ImageGenerateInput,
    ctx: MeshContext,
  ): Promise<MeshResult<ImageGenerateOutput>> {
    const parsed = ImageGenerateInputSchema.safeParse(input)
    if (!parsed.success) {
      return {
        ok: false,
        error: appError('VALIDATION_ERROR', 'invalid image prompt', ctx.traceId),
      }
    }
    const size = IMAGE_SIZES[parsed.data.size]
    return runner.runImage(
      imageGenerateDef,
      // The size rides in the prompt as well as the structured field: not every
      // image model on OpenRouter honours the hint, and a 1024×1280 request that
      // silently returns 512×512 fails instagram's minimum dimensions later, far
      // from here.
      {
        prompt: `${parsed.data.prompt}\n\nRender at ${size.width}x${size.height} pixels.`,
        width: size.width,
        height: size.height,
      },
      ctx,
    )
  }

  return { runTask, runImage }
}
