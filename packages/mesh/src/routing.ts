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
}

export function routeForTier(tier: ModelTier): TierRoute {
  return TIER_ROUTES[tier]
}
