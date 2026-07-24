import type { PlanId } from '@sahoda/shared'

/**
 * Resolves a workspace to its current plan.
 *
 * Deliberately NOT part of `LedgerPort` — the gate has no ledger concern, and entitlement
 * checks run at call sites that never touch credits. Kept a one-method port so the gate is
 * unit-testable against a fake with no database.
 */
export interface PlanResolverPort {
  /** The workspace's live plan. A workspace with no live subscription resolves to 'free'. */
  resolvePlanId(workspaceId: string): Promise<PlanId>
}
