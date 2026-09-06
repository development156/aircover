import { z } from 'zod'
import rawPricing from '../../../../pricing.config.json' with { type: 'json' }

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
 *
 * ── WHY THE `with { type: 'json' }`, WHICH LOOKS LIKE NOISE ──────────────────
 * Bundlers inline a JSON import and never ask for the attribute, so this file
 * was correct everywhere the app runs and wrong in the one place it is only
 * LOADED: Playwright's ESM loader, which hands the specifier to Node, and Node
 * refuses a JSON module without it.
 *
 * The cost of that was the whole @smoke suite, not one spec. MEASURED
 * 2026-09-05, run 33995656650 on `wt-core` at `ba6f0b43`: the job installed
 * Chromium, built the app, started it, and then exited in fifteen seconds with
 * `TypeError: Module ".../pricing.config.json" needs an import attribute of
 * "type: json"` and `Total: 0 tests in 0 files`. Nothing ran. Reproduced
 * locally on Node 22 and Node 24 alike, so it is the loader and not the runtime.
 *
 * What reached it was `connections-widths.spec.ts` importing the connections
 * catalogue (`ac8ef5ec`) so its tile count came from the product rather than a
 * retyped `8`. The catalogue imports `@sahoda/shared`, and every spec in the
 * suite loads in one process, so the first spec to touch this package took the
 * other 121 tests down with it. `resolution-console.spec.ts` had predicted the
 * failure verbatim and worked around it by inlining a fixture; this is the same
 * fact fixed at its cause, so the next spec that needs a real contract can just
 * import one.
 *
 * KEPT AS A STATIC IMPORT ON PURPOSE. `ActionType` below is
 * `keyof (typeof rawPricing)['actions']`, a literal union TypeScript derives
 * from the file itself, so every call to `creditCost` is checked against the
 * prices that actually ship. A `readFileSync` + `JSON.parse` version would load
 * the same numbers and widen that type to `string`, which is a real loss of
 * checking traded for a cosmetic gain.
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
