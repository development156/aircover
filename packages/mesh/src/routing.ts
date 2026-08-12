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

export function imageModelForTier(tier: ModelTier): string | undefined {
  return IMAGE_ROUTES[tier]
}
