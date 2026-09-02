import type { BillingProvider, PlanId } from '@sahoda/shared'
import type { Period } from '../period'

/**
 * What a verified successful payment tells the `subscriptions` table.
 *
 * Until 2026-09-02 nothing wrote that table at all: a payment landed a ledger GRANT and
 * stopped, while `createPgPlanResolver` and the plan screen both read `subscriptions` and
 * answered "free" for a customer who had just paid. Credits arrived; the plan never did.
 */
export interface ActivateSubscriptionInput {
  workspaceId: string
  planId: PlanId
  provider: BillingProvider
  /** The paid-for period, `YYYY-MM`. Bounds the row's current_period_start/end in UTC. */
  period: Period
}

/**
 * Writes the live `subscriptions` row for a paid workspace. One method, so the webhook's
 * unit tests can prove the call (and its ordering against the audit row) against a fake.
 */
export interface SubscriptionWriter {
  /**
   * Make the workspace's live row say: this plan, active, this provider, this period.
   * Idempotent — the same input twice leaves one row — and safe to re-drive after a crash.
   */
  activate(input: ActivateSubscriptionInput): Promise<void>
}

/**
 * The UTC bounds of a billing period: the first instant of the month to the first instant of
 * the next. UTC because `currentPeriod` derives the period in UTC; an IST server reading
 * local months would put a boundary 5.5 hours off the one the grant key was minted from.
 */
export function periodBounds(period: Period): { start: Date; end: Date } {
  const [year, month] = period.split('-').map(Number) as [number, number]
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  }
}
