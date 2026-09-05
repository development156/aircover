import type { MeshTaskName, ModelTier } from '@sahoda/shared'

/**
 * The per-tier model chain: an OpenRouter primary (Anthropic model) and a direct
 * OpenAI fallback. Slugs are tuned/validated against the real provider by the live
 * smoke test — the frozen unit tests assert structure, not exact strings.
 *
 * NOTE: this typed config is the Alpha stand-in for the `ai_model_routes` table
 * referenced by the sahoda-mesh skill. Phase A froze routing to code (MeshTaskDef.tier
 * is the source); the DB table stays out of scope for wt-mesh.
 */
export interface TierRoute {
  /** OpenRouter model slug for the primary attempt. */
  openRouter: string
  /** OpenAI model for the direct fallback. */
  openai: string
}

export const TIER_ROUTES: Record<ModelTier, TierRoute> = {
  nano: { openRouter: 'anthropic/claude-haiku-4.5', openai: 'gpt-4o-mini' },
  economy: { openRouter: 'anthropic/claude-haiku-4.5', openai: 'gpt-4o-mini' },
  standard: { openRouter: 'anthropic/claude-sonnet-5', openai: 'gpt-4o' },
  premium: { openRouter: 'anthropic/claude-opus-4-8', openai: 'gpt-4o' },
  research: { openRouter: 'anthropic/claude-sonnet-5', openai: 'gpt-4o' },
}

/**
 * MeshTaskName → tier (sahoda-mesh tier guide): captions/variants = economy;
 * plans/brand_guidelines = standard; site generation = premium (budgeted).
 */
export const TASK_TIER: Record<MeshTaskName, ModelTier> = {
  /**
   * ECONOMY (claude-haiku-4.5), moved off `standard` 2026-08-12 ON MEASUREMENT.
   *
   * Bake-off, n=3, same intake, strict schema — all five candidates passed the
   * schema 3/3, so the test was the RED LINES, which is where a generic Brain
   * shows itself:
   *
   *   sonnet-5     4 red lines, specific   $0.0227   24.6s   (incumbent)
   *   haiku-4.5    4 red lines, specific   $0.0040    9.3s   <-- this
   *   gpt-5-mini   3 red lines, specific   $0.0040   27.2s
   *   gemini-pro   2 red lines, thin       $0.0225   21.0s
   *   gemini-flash 2 red lines, VERBATIM ECHO of the intake  $0.0015  4.0s
   *
   * gemini-flash is the fastest and cheapest and is disqualified on the text:
   * it handed back "health benefit claims" — the input, parroted. haiku-4.5
   * wrote "Never use 'artisanal' or 'craft' as a marketing crutch", which is a
   * rule the founder did not supply and a competitor could not reuse.
   *
   * 5.7x cheaper and 2.6x faster than the incumbent at the same specificity.
   *
   * ONE THING TO WATCH: haiku returned signal_lock 'strong' on all three runs
   * where sonnet said 'moderate'. On this intake either is arguable, but
   * signal_lock is a claim about certainty and a model that always says strong
   * would be worthless. Worth re-measuring on a THIN intake before trusting it.
   *
   * ACCEPTED COST: economy's OpenAI fallback is gpt-4o-mini rather than gpt-4o.
   * That path fires only when OpenRouter is unreachable, and brand_guidelines
   * is the one task with a demo-fallback safety net underneath it.
   *
   * ── IT DID NOT TAKE EFFECT FOR THREE WEEKS, AND NOW IT HAS ──────────────────
   * MEASURED 2026-09-03: the bake-off's conclusion was written HERE, and this
   * table is read by nothing at runtime. `MeshTaskDef.tier` is the source (this
   * file's own header says so), and `tasks/brand-guidelines.ts` said `standard`
   * from the day it was created — `git log -L48,48` on it showed one commit, the
   * creating one. So brand_guidelines ran on sonnet-5 the whole time and the 5.7x
   * saving was never taken.
   *
   * APPLIED 2026-09-04, founder's decision. The task definition now says
   * `economy` and this table says the same, and `agrees with every task
   * definition` below asserts the two per task — it caught this very change when
   * only one side had moved, which is the drift that hid the problem in the first
   * place.
   *
   * THE CAVEAT REMAINS UNDISCHARGED, so it stays written down rather than being
   * quietly dropped now that the decision went the other way: haiku returned
   * signal_lock 'strong' on all three runs where sonnet said 'moderate', and a
   * model that always says strong would make that field worthless. Re-measure on
   * a THIN intake.
   */
  brand_guidelines: 'economy',
  // Standard, not economy: this one reads adversarial customer-supplied text and
  // has to keep telling instruction from evidence over several pages. It is also
  // the cheapest place in the product to be wrong — a bad extraction becomes the
  // Brain, and the Brain grounds every caption after it.
  brand_extract: 'standard',
  content_variants: 'economy',
  caption_rewrite: 'economy',
  plan_week: 'standard',
  site_generate: 'premium',
  // The refusal gate's classifier. Standard rather than economy because it is
  // the last thing between a draft and a public account, and because the
  // purpose-built guardrail route doc 18 §10 calls for does not exist — see
  // tasks/gate-classify.ts. Economy here would trade a held clinic post for
  // fractions of a cent.
  gate_classify: 'standard',
  // Images do not use TIER_ROUTES at all — those are chat models. The tier is
  // recorded because MeshTaskDef requires one and telemetry reads it; the model
  // comes from IMAGE_ROUTES below.
  image_generate: 'standard',
}

export function routeForTier(tier: ModelTier): TierRoute {
  return TIER_ROUTES[tier]
}

/**
 * Image models, keyed by tier.
 *
 * ── WHY THIS IS A SEPARATE MAP FROM TIER_ROUTES ──────────────────────────────
 * TIER_ROUTES pairs an OpenRouter chat model with a direct OpenAI chat model, and
 * neither half means anything for images: the fallback is a different API shape,
 * not a different slug. Adding an `image` field to TierRoute would have put a
 * field on every tier that only one task ever reads, and would have implied a
 * fallback that does not exist.
 *
 * ── WHY THERE IS NO FALLBACK CHAIN ───────────────────────────────────────────
 * One provider, and if it fails the task fails. The alternative is falling back
 * to a text model, which would return a paragraph DESCRIBING a picture — and the
 * caller, having asked for an image and been charged for one, would receive prose
 * it cannot attach to a post. An honest failure costs the customer nothing,
 * because the credit hold is released.
 */
export const IMAGE_ROUTES: Partial<Record<ModelTier, string>> = {
  standard: 'google/gemini-2.5-flash-image',
  premium: 'openai/gpt-image-1',
}

/**
 * EVERY IMAGE MODEL THIS PRODUCT WILL ADDRESS.
 *
 * ── WHY AN ALLOW-LIST AND NOT JUST A DEFAULT ────────────────────────────────
 * The Studio lets a person choose which model draws their picture, so a model id
 * now arrives from a REQUEST. Passing that string through to the provider would
 * let anybody bill this account against any model on OpenRouter, including ones
 * far dearer than anything we price, and would put an unpriced id in the
 * `model_id` column as though we had chosen it.
 *
 * So the id is checked against this list and a stranger is refused. The list is
 * the contract: adding a model here is the deliberate act, and everything else
 * (the picker, the price, the rules) reads from it.
 *
 * ── PAGE-VERIFIED IS NOT GENERATION-VERIFIED ────────────────────────────────
 * The three ids added on 2026-08-31 had their FIGURES read off each model's own
 * OpenRouter page and compared against docs/43 §3. That is a check on the price
 * and reference bounds, NOT a check that the model draws: every press against
 * them has returned HTTP_400 from `/api/v1/images` (production `ai_provider_logs`,
 * 2 and 4 September, zero successes). The allow-list is a SPENDING boundary, so
 * they stay on it — an id off the list would fall back to the tier default and
 * spend silently against the wrong model. Whether a listed id actually draws is
 * the picker's `routed` flag in `apps/web/src/lib/studio/models.ts`, not this
 * list.
 *
 *   google/gemini-2.5-flash-image     the one id MEASURED drawing (6 ok rows, 2026-08-30)
 *   google/gemini-3-pro-image         page: $2/M in, $120/M image out, 14 references
 *   openai/gpt-image-1                page: $5/M text in, $40/M out, 10 per request, 16 references
 *   bytedance-seed/seedream-5-0-lite  page: $0.035 flat per image, 4 per request, 14 references
 */
export const ALLOWED_IMAGE_MODELS: readonly string[] = [
  'google/gemini-2.5-flash-image',
  'google/gemini-3-pro-image',
  'openai/gpt-image-1',
  'bytedance-seed/seedream-5-0-lite',
]

/** True only for an id this product has deliberately priced and listed. */
export function isAllowedImageModel(id: string): boolean {
  return ALLOWED_IMAGE_MODELS.includes(id)
}

export function imageModelForTier(tier: ModelTier): string | undefined {
  return IMAGE_ROUTES[tier]
}

/**
 * The model an image call will actually use.
 *
 * ── THE REQUESTED ID IS VETTED, NEVER PASSED THROUGH ────────────────────────
 * A model id now arrives from a request, because the Studio lets somebody
 * choose one. Handing that string to the provider would let any caller bill
 * this account against any model on OpenRouter, including ones far dearer than
 * anything this product prices. An id that is not on the list is IGNORED and
 * the tier's own model is used, because the screen has already refused it with
 * a sentence and this layer's job is to make the wrong thing impossible rather
 * than to explain it twice.
 *
 * Lives here, exported and pure, rather than inside `createMesh`: a closure
 * nobody can call is a boundary nobody can prove.
 */
export function chooseImageModel(tier: ModelTier, requested?: string): string | undefined {
  return requested !== undefined && isAllowedImageModel(requested)
    ? requested
    : imageModelForTier(tier)
}
