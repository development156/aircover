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
  nano: { openRouter: 'anthropic/claude-haiku-4-5', openai: 'gpt-4o-mini' },
  economy: { openRouter: 'anthropic/claude-haiku-4-5', openai: 'gpt-4o-mini' },
  standard: { openRouter: 'anthropic/claude-sonnet-5', openai: 'gpt-4o' },
  premium: { openRouter: 'anthropic/claude-opus-4-8', openai: 'gpt-4o' },
  research: { openRouter: 'anthropic/claude-sonnet-5', openai: 'gpt-4o' },
}

/**
 * MeshTaskName → tier (sahoda-mesh tier guide): captions/variants = economy;
 * plans/brand_guidelines = standard; site generation = premium (budgeted).
 */
export const TASK_TIER: Record<MeshTaskName, ModelTier> = {
  brand_guidelines: 'standard',
  content_variants: 'economy',
  caption_rewrite: 'economy',
  plan_week: 'standard',
  site_generate: 'premium',
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
