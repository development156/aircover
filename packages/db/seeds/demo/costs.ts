import { creditCost, type ActionType, type ModelTier } from '@sahoda/shared'

/**
 * The one place the demo decides which model tier ran an action and what it cost us.
 *
 * `credit_ledger.model_tier` / `cogs_usd_est` are member-readable (the wallet's
 * transparency panel), while `ai_provider_logs.tier` / `cost_usd` are service-only margin
 * telemetry. They describe the SAME work. Seeding them from two hand-written tables let
 * them drift: the wallet claimed a Sonnet-class `standard` tier for variant writing the
 * router sends to Haiku, and the two tables put the site generation 3.5x apart on cost
 * while sharing a trace id. Both modules now read this table, so they cannot disagree.
 *
 * `tier` mirrors TASK_TIER in packages/mesh/src/routing.ts, restated rather than imported
 * because packages/db does not depend on packages/mesh. Keep the two in step; the mapping
 * from a pricing action to a mesh task is recorded in `meshTask` so the correspondence is
 * checkable rather than implied.
 */
export interface DemoActionCost {
  /** Tier the mesh would actually route this task to. `null` = no model call. */
  readonly tier: ModelTier | null
  /** MeshTaskName this action maps to, or null where the product has no such task. */
  readonly meshTask: string | null
  /** Provider cost in USD for one unit of the action. */
  readonly cogsUsd: number
}

/**
 * Costs are sized against the Starter rate: 1500 credits for ₹499 puts one credit near
 * $0.004, so a 100-credit site generation sells for about $0.39. Every figure here lands
 * near a fifth of what its action charges, which is the margin the transparency UI is
 * meant to show. A demo whose COGS approached its price would read as a business losing
 * money on every click.
 */
export const ACTION_COST = {
  brand_research: { tier: 'standard', meshTask: 'brand_guidelines', cogsUsd: 0.0384 },
  site_generate: { tier: 'premium', meshTask: 'site_generate', cogsUsd: 0.0912 },
  post_variants: { tier: 'economy', meshTask: 'content_variants', cogsUsd: 0.0021 },
  caption_rewrite: { tier: 'economy', meshTask: 'caption_rewrite', cogsUsd: 0.0004 },
  campaign_plan: { tier: 'standard', meshTask: 'plan_week', cogsUsd: 0.0186 },
  // Image generation has no entry in TASK_TIER — the Alpha mesh routes no image task — so
  // claiming any tier here would invent a routing the product does not perform.
  image_standard: { tier: null, meshTask: null, cogsUsd: 0.0055 },
} as const satisfies Record<string, DemoActionCost>

export type PricedAction = keyof typeof ACTION_COST

/**
 * What the rejected Raja Parba poster cost us before it failed. Recorded on BOTH the
 * ledger RELEASE and the `ai_provider_logs` error row: the user pays nothing, and the loss
 * is ours. Writing 0 on the telemetry row while the ledger claimed a cost would have made
 * the two tables contradict each other about who ate it.
 */
export const FAILED_IMAGE_COGS_USD = 0.0031

/**
 * Model slug per tier, mirroring TIER_ROUTES in packages/mesh/src/routing.ts (OpenRouter
 * primary). Only used to label `ai_provider_logs.model`, so a demo row names a model the
 * router would really have reached for.
 */
export const TIER_MODEL: Record<ModelTier, string> = {
  nano: 'anthropic/claude-haiku-4-5',
  economy: 'anthropic/claude-haiku-4-5',
  standard: 'anthropic/claude-sonnet-5',
  premium: 'anthropic/claude-opus-4-8',
  research: 'anthropic/claude-sonnet-5',
}

/** Credits an action charges, straight from pricing.config.json via the shared reader. */
export function creditsFor(action: PricedAction, units = 1): number {
  return creditCost(action as ActionType, units)
}
