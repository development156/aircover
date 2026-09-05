import { z } from 'zod'
import rawPricing from '../../../../pricing.config.json'

/**
 * The ONLY reader of pricing.config.json (repo root). Credit action prices come
 * from here and nowhere else (CLAUDE.md non-negotiable). Plan subscription
 * prices + monthly grants are a separate catalog (see billing/plans) — this file
 * is action credit costs only.
 *
 * The import below escapes this package, so Turborepo cannot see it while
 * hashing @sahoda/shared. Root turbo.json lists pricing.config.json under
 * `globalDependencies` to close that gap — without it a price edit replays a
 * cached green suite and ships unguarded. Keep the two in step.
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
  /**
   * WHAT CREDITS COST WHEN SOMEBODY BUYS THEM OUTRIGHT.
   *
   * One rate, and every figure on the wallet's top-up panel is derived from it:
   * the three offered sizes, the custom amount, and the rupees each comes to.
   * A second rate written anywhere else is a price this file does not know about,
   * which is the thing CLAUDE.md's non-negotiable exists to prevent.
   *
   * There is NO bulk discount, deliberately. A larger pack at a better rate reads
   * as generosity and is a second price: `inrForCredits` would stop being one
   * multiplication and every quoted figure would need the pack it came from.
   */
  top_up: z.object({
    /** The unit: this many credits for `inr_per_pack` rupees. */
    credits_per_pack: z.number().int().positive(),
    inr_per_pack: z.number().int().positive(),
    /** The sizes offered as buttons. Each must be a whole number of steps. */
    packs: z.array(z.number().int().positive()).nonempty(),
    /** Floor, granularity and ceiling for a custom amount. */
    min_credits: z.number().int().positive(),
    step_credits: z.number().int().positive(),
    max_credits: z.number().int().positive(),
  }),
})
export type PricingConfig = z.infer<typeof PricingConfigSchema>

/** Parsed + validated at module load — a malformed config fails fast at import. */
export const PRICING: PricingConfig = PricingConfigSchema.parse(rawPricing)

/** The one rate credits are sold at, and the bounds a custom amount must sit in. */
export const TOP_UP = PRICING.top_up

/**
 * Rupees for a number of credits, at the single configured rate.
 *
 * INTEGER RUPEES, always. `credits * inr / per_pack` is exact for every multiple
 * of `step_credits` at the configured 500/2000 — 500 credits is 125 rupees — and
 * the guard below is what keeps that true if somebody edits the config into a
 * rate that does not divide evenly. A price with a fraction of a rupee in it
 * cannot be charged and must never be shown.
 */
export function inrForCredits(credits: number): number {
  const paise = credits * TOP_UP.inr_per_pack * 100
  if (paise % TOP_UP.credits_per_pack !== 0) {
    throw new Error(
      `top-up rate does not divide evenly for ${credits} credits — fix pricing.config.json`,
    )
  }
  return paise / TOP_UP.credits_per_pack / 100
}

/** Credits for a rupee amount, at the same rate. Floors: never sell credit nobody paid for. */
export function creditsForInr(inr: number): number {
  return Math.floor((inr * TOP_UP.credits_per_pack) / TOP_UP.inr_per_pack)
}

export type TopUpRefusal = 'below-minimum' | 'above-maximum' | 'not-a-step' | 'not-a-number'

/**
 * Is this a quantity somebody may actually buy?
 *
 * Returns a REASON rather than a boolean, because the three refusals are three
 * different sentences on the screen and a caller with only `false` has to invent
 * one. The server action and the panel both call this, so what the button
 * refuses and what the action refuses can never drift apart.
 */
export function refuseTopUpCredits(credits: unknown): TopUpRefusal | null {
  if (typeof credits !== 'number' || !Number.isFinite(credits) || !Number.isInteger(credits)) {
    return 'not-a-number'
  }
  if (credits < TOP_UP.min_credits) return 'below-minimum'
  if (credits > TOP_UP.max_credits) return 'above-maximum'
  if (credits % TOP_UP.step_credits !== 0) return 'not-a-step'
  return null
}

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
