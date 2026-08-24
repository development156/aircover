import { z } from 'zod'
import type { PlanId } from '../enums'

/**
 * Plan entitlements (D7 fold: resolved from plans.limits jsonb; Alpha reads, never
 * edits). loopLevel = max autonomy level 0..3; twinSize = persona count (0 = none).
 */
export const PlanLimitsSchema = z.object({
  channels: z.int(),
  sites: z.int(),
  seats: z.int(),
  loopLevel: z.int(),
  twinSize: z.int(),
})
export type PlanLimits = z.infer<typeof PlanLimitsSchema>

export interface PlanCatalogEntry {
  id: PlanId
  name: string
  monthlyCredits: number
  priceInr: number
  priceUsd: number
  limits: PlanLimits
}

/**
 * Canonical plan catalog. The single source for the `plans` table seed and for
 * entitlement reads. (Action credit costs are separate — see pricing.ts.)
 *
 * Repriced 2026-08-24 from the business model deck, which supersedes PRD §7.1 for
 * every figure below. Note that the credit allowances went DOWN as the prices went
 * up (Growth 5,000 to 4,000; Studio 15,000 to 12,000): this is a reprice, not an
 * increase, so any copy that calls a higher tier "more credits" is now wrong.
 *
 * `priceUsd` is a rounded marketing price, NOT a conversion, and the gap is wide
 * enough that calling it "about $25" in the UI is doing real work. At the ₹95.5 per
 * USD recorded as MEASURED in finance/pricing-model.json, the rupee prices convert
 * to $20.93, $41.87 and $83.76 — so $25, $49 and $99 carry a premium of 19.4%,
 * 17.0% and 18.2% over what an Indian customer pays for the same plan.
 *
 * That is a deliberate second price for a customer billed in dollars, not an
 * arithmetic slip, and it is written down here because the next person to read
 * these two numbers side by side will assume one was derived from the other.
 *
 * The deck also states these prices are GST INCLUSIVE. That claim is NOT encoded
 * here, deliberately: `GstSupplierConfig.priceIncludesTax` is the field that decides
 * it, and gst.ts calls it a tax opinion the founder confirms with a CA. A price
 * constant cannot settle a tax treatment.
 */
export const PLAN_CATALOG: Record<PlanId, PlanCatalogEntry> = {
  free: {
    id: 'free',
    name: 'Free',
    monthlyCredits: 100,
    priceInr: 0,
    priceUsd: 0,
    limits: { channels: 2, sites: 0, seats: 1, loopLevel: 1, twinSize: 0 },
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    monthlyCredits: 1500,
    priceInr: 1999,
    priceUsd: 25,
    limits: { channels: 4, sites: 1, seats: 1, loopLevel: 2, twinSize: 25 },
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    monthlyCredits: 4000,
    priceInr: 3999,
    priceUsd: 49,
    limits: { channels: 8, sites: 3, seats: 3, loopLevel: 3, twinSize: 100 },
  },
  /**
   * Customers see "Studio"; the id stays `agency`.
   *
   * The id is a stored value — it is the `plan_id` on every existing subscription
   * row and a foreign key into `plans` — so renaming it is a migration over live
   * money rows, not a rename. The label is the half customers read, and it is the
   * half the business model deck changed. Founder's ruling, 2026-08-24.
   */
  agency: {
    id: 'agency',
    name: 'Studio',
    monthlyCredits: 12000,
    priceInr: 7999,
    priceUsd: 99,
    limits: { channels: 12, sites: 10, seats: 10, loopLevel: 3, twinSize: 100 },
  },
}

/** Entitlements for a plan (from the catalog; Alpha never edits them). */
export const getEntitlements = (planId: PlanId): PlanLimits => PLAN_CATALOG[planId].limits

/**
 * The cheapest plan whose `dimension` limit is at least `needed`, or `null` when no
 * plan in the catalog reaches it.
 *
 * Exists so upgrade copy is DERIVED rather than written. The obvious hand-written
 * sentence for a blocked site — "Sites are on Growth and above" — is false: `sites`
 * is 0 on Free but 1 on Starter, so it names a plan three times the price of the one
 * the customer actually needs. A sentence built from this function cannot drift from
 * the catalog it describes.
 *
 * Deliberately a plain catalog query with NO entitlement semantics baked in: the
 * caller converts its own question into `needed` (a countable dimension asks for
 * `currentUsage + 1`; a level dimension asks for the level itself). That keeps the
 * countable-vs-level distinction in exactly one place — `checkEntitlement`'s
 * `isAllowed` — instead of restating it here where it could disagree.
 *
 * Ordered by `priceInr`, not by declaration order: "cheapest" is a price question,
 * and a catalog reordering must not silently change which plan gets recommended.
 */
export function cheapestPlanWithAtLeast(
  dimension: keyof PlanLimits,
  needed: number,
): PlanCatalogEntry | null {
  return (
    Object.values(PLAN_CATALOG)
      .slice()
      .sort((a, b) => a.priceInr - b.priceInr)
      .find((plan) => plan.limits[dimension] >= needed) ?? null
  )
}
