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
 * Canonical plan catalog (PRD §7.1). The single source for the `plans` table seed
 * and for entitlement reads. (Action credit costs are separate — see pricing.ts.)
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
    priceInr: 499,
    priceUsd: 12,
    limits: { channels: 4, sites: 1, seats: 1, loopLevel: 2, twinSize: 25 },
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    monthlyCredits: 5000,
    priceInr: 1499,
    priceUsd: 29,
    limits: { channels: 8, sites: 3, seats: 3, loopLevel: 3, twinSize: 100 },
  },
  agency: {
    id: 'agency',
    name: 'Agency',
    monthlyCredits: 15000,
    priceInr: 3999,
    priceUsd: 79,
    limits: { channels: 8, sites: 10, seats: 10, loopLevel: 3, twinSize: 100 },
  },
}

/** Entitlements for a plan (from the catalog; Alpha never edits them). */
export const getEntitlements = (planId: PlanId): PlanLimits => PLAN_CATALOG[planId].limits
