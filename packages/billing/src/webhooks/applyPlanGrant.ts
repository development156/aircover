import { randomUUID } from 'node:crypto'
import { appError, err, monthlyGrantKey, ok, PLAN_CATALOG, type Result } from '@sahoda/shared'
import type { LedgerPort } from '../ledger/port'
import { isPeriod } from '../period'
import type { ParsedWebhookEvent } from '../providers/types'

/**
 * The grant that STANDS for this (workspace, plan, period) — not necessarily one applied by
 * this delivery. Owner ruling: on a replay this describes the ORIGINAL grant, not a second one.
 * Never read `granted`/`balanceAfter` without `replayed`: `granted: 1500, replayed: true` means
 * "1500 stand for this period, and this delivery added none of them".
 *
 * The two fields get there by DIFFERENT routes, which matters:
 *   - `balanceAfter` comes from the ledger's returned row (`res.entry.balanceAfter`), so on a
 *     replay it is the balance as of the ORIGINAL grant and may be arbitrarily stale — later
 *     DEBITs are not reflected. Pinned by an intervening-DEBIT case in the integration tests.
 *   - `granted` is re-read from `PLAN_CATALOG` on THIS call, not recovered from the original
 *     entry. `monthlyGrantKey` is (plan, period, workspace) with no amount in it, so if a plan's
 *     `monthlyCredits` changes mid-period the key still replays while `granted` reports today's
 *     catalog value against a ledger row holding the old one. Treat it as "what this plan grants
 *     for this period now", never as an audit of what was actually credited — for that, read the
 *     ledger.
 */
export interface PlanGrantResult {
  /** Credits the plan's monthly allotment grants for this period. See the caveat above. */
  granted: number
  /** Balance after the entry that stands. On replay this is the ORIGINAL entry's balance. */
  balanceAfter: number
  /**
   * True when the ledger replayed this grant — a redelivery, or a genuinely distinct second
   * payment for the same plan+period. The latter means real money produced no credits, which
   * the route MUST surface for refund/support (REQUESTS.md §6), not pass off as a success.
   */
  replayed: boolean
}

export interface ApplyPlanGrantDeps {
  newTraceId?: () => string
}

/**
 * Apply the monthly plan grant for a verified "paid" event: GRANT the plan's
 * monthly_credits (from PLAN_CATALOG — NOT action pricing) via apply_ledger_entry,
 * keyed by monthlyGrantKey so a replayed webhook never double-grants.
 *
 * Deferred (owner ruling #1): the billing_webhook_events (provider, event_id) row is
 * NOT written here — it depends on the provider-enum widening ('fixture'/'cashfree')
 * landing from wt-db. It is flagged, never faked. Until it lands, replay-safety rests
 * on the ledger's monthlyGrantKey, which alone prevents a double-grant; the events
 * table adds provider-level dedup + an audit trail on top.
 */
export function createApplyPlanGrant(
  port: LedgerPort,
  deps: ApplyPlanGrantDeps = {},
): (event: ParsedWebhookEvent) => Promise<Result<PlanGrantResult>> {
  const newTraceId = deps.newTraceId ?? (() => randomUUID())

  return async function applyPlanGrant(
    event: ParsedWebhookEvent,
  ): Promise<Result<PlanGrantResult>> {
    const traceId = newTraceId()

    if (event.eventType !== 'payment_succeeded') {
      return err(
        appError(
          'VALIDATION_ERROR',
          `applyPlanGrant only handles payment_succeeded events (got ${event.eventType})`,
          traceId,
        ),
      )
    }

    // The period format contract is enforced HERE, not only at the providers: this is where
    // monthlyGrantKey is built, so an unpadded '2026-7' reaching this point would mint a
    // second idempotency key for a month already granted — a double-grant. Reject first.
    if (!isPeriod(event.period)) {
      return err(
        appError(
          'VALIDATION_ERROR',
          `period must be a zero-padded YYYY-MM (got ${JSON.stringify(event.period)})`,
          traceId,
        ),
      )
    }

    // planId indexes PLAN_CATALOG. It is typed PlanId, but a value that slipped past a
    // provider's parse would throw a raw TypeError out of a function contracted never to
    // reject (PR#1 advisory: "PLAN_CATALOG lookup outside try").
    const plan = PLAN_CATALOG[event.planId]
    if (!plan) {
      return err(
        appError('VALIDATION_ERROR', `unknown planId ${JSON.stringify(event.planId)}`, traceId),
      )
    }

    const amount = plan.monthlyCredits
    const key = monthlyGrantKey(event.planId, event.period, event.workspaceId)

    // Never reject on an infra failure — this returns a Result the webhook handler branches on
    // (same contract as withCredits). The grant is idempotent by `key`, so a caller retry
    // replays rather than double-granting. The message is fixed so no DB internals leak.
    try {
      const res = await port.apply({
        workspaceId: event.workspaceId,
        entryType: 'GRANT',
        amount,
        idempotencyKey: key,
        actor: `provider:${event.provider}`,
        meta: {
          eventId: event.eventId,
          planId: event.planId,
          period: event.period,
          mode: event.mode,
        },
      })
      return ok({ granted: amount, balanceAfter: res.entry.balanceAfter, replayed: res.replayed })
    } catch {
      return err(appError('PROVIDER_ERROR', 'Could not apply plan grant', traceId))
    }
  }
}
