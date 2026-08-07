import { z } from 'zod'
import rawPricing from '../../../../pricing.config.json'

/**
 * The ONLY reader of pricing.config.json (repo root). Credit action prices come
 * from here and nowhere else (CLAUDE.md non-negotiable). Plan subscription
 * prices + monthly grants are a separate catalog (see billing/plans) — this file
 * is action credit costs only.
 */
export const PricingConfigSchema = z.object({
  currency_note: z.string(),
  rollover_cap_x: z.number(),
  perf_reward: z.object({
    per_post: z.number(),
    monthly_cap_pct: z.number(),
    lifetime_milestone_cap: z.number(),
  }),
  actions: z.record(z.string(), z.number()),
})
export type PricingConfig = z.infer<typeof PricingConfigSchema>

/** Parsed + validated at module load — a malformed config fails fast at import. */
export const PRICING: PricingConfig = PricingConfigSchema.parse(rawPricing)

/** The literal union of configured action keys, derived from the JSON itself. */
export type ActionType = keyof (typeof rawPricing)['actions']

/** Credit cost of an action (x units). The single source of truth for spend amounts. */
export function creditCost(action: ActionType, units = 1): number {
  const unit = PRICING.actions[action]
  if (typeof unit !== 'number') {
    throw new Error(`No credit price configured for action "${String(action)}"`)
  }
  return unit * units
}
