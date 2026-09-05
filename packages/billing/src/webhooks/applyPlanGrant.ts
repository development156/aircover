import { randomUUID } from 'node:crypto'
import {
  appError,
  err,
  monthlyGrantKey,
  ok,
  PLAN_CATALOG,
  planChangeGrantKey,
  topUpGrantKey,
  type Result,
} from '@sahoda/shared'
import type { LedgerPort } from '../ledger/port'
import { isPeriod } from '../period'
import type { ParsedWebhookEvent } from '../providers/types'

/**
 * Idempotency key for a plain (non-plan-change) purchase: the monthly key, then the PAYMENT.
 *
 * `monthlyGrantKey` alone is (plan, period, workspace), and a plain purchase was keyed on it
 * until 2026-09-02. That made every second real payment for the same plan in the same month a
 * REPLAY: Cashfree took the money, the ledger returned the first grant, and the customer got
 * nothing (billing-ledger-4). The provider's event id names one payment — Cashfree's is
 * `PAYMENT_SUCCESS_WEBHOOK:<cf_payment_id>` — so a second payment is a second key and a
 * redelivery of the same payment is still the same key.
 *
 * The monthly key stays as the prefix so a ledger row still reads as (plan, period, workspace)
 * to a human, and so the recurring path, when one exists, can go on keying on the month.
 */
export const purchaseGrantKey = (
  event: Pick<ParsedWebhookEvent, 'planId' | 'period' | 'workspaceId' | 'provider' | 'eventId'>,
): string =>
  `${monthlyGrantKey(event.planId, event.period, event.workspaceId)}:${event.provider}:${event.eventId}`

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
 *     entry. The key carries no amount, so if a plan's `monthlyCredits` changes between a
 *     payment and its redelivery the key still replays while `granted` reports today's catalog
 *     value against a ledger row holding the old one. Treat it as "what this plan grants for
 *     this period now", never as an audit of what was actually credited — for that, read the
 *     ledger.
 */
export interface PlanGrantResult {
  /** Credits the plan's monthly allotment grants for this period. See the caveat above. */
  granted: number
  /**
   * Balance after the entry that stands. On replay this is the ORIGINAL entry's balance.
   *
   * NULL when no entry was written at all — a plan change whose prorated credits round to
   * zero. Deliberately null rather than `0`: the balance is not zero, we simply did not
   * touch it, and a zero here would be a figure no query can produce.
   */
  balanceAfter: number | null
  /**
   * True when the ledger replayed this grant: the same payment driven again (a redelivery
   * whose audit row was left 'received' by a crash, or the same change id twice). A DISTINCT
   * payment never replays — its key names the payment — so `replayed` no longer means "real
   * money produced no credits"; it means "this delivery added nothing because an earlier one
   * for the same payment already did".
   */
  replayed: boolean
}

export interface ApplyPlanGrantDeps {
  newTraceId?: () => string
}

/**
 * Apply the plan grant for a verified "paid" event: GRANT the plan's monthly_credits (from
 * PLAN_CATALOG — NOT action pricing) via apply_ledger_entry, keyed by `purchaseGrantKey` so a
 * redelivered webhook never double-grants and a second real payment always grants again.
 *
 * The billing_webhook_events (provider, event_id) row is written by `processPaymentEvent`,
 * not here; that table is provider-level dedup + an audit trail on top of the ledger key.
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
    // the grant key is built, and the period is also what bounds the subscription row an
    // unpadded '2026-7' would stamp wrongly. Reject first.
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

    /**
     * A mid-period PLAN CHANGE grants the prorated difference and is keyed on the CHANGE; a
     * plain purchase grants the full month and is keyed on the PAYMENT (`purchaseGrantKey`).
     *
     * Neither is keyed on the bare month. That key is (plan, period, workspace) with no change
     * and no payment in it, so a second upgrade, or a second purchase of the same plan in one
     * month, would REPLAY — the ledger would return `replayed: true`, grant nothing, and the
     * route would report success for a payment that produced no credits. Buying twice in one
     * month is not exotic; it is what a customer does when the first month's credits run out.
     */
    /**
     * A BOUGHT PACK is keyed on the payment, and nothing about the plan enters it.
     *
     * Buying the same size twice in one afternoon is ordinary behaviour, so a key those two
     * purchases shared would take the second payment and grant nothing for it. See
     * `topUpGrantKey`.
     *
     * The entry type is TOPUP rather than GRANT because they are different facts — one is
     * money the customer paid, the other is an allowance they were given — and the wallet's
     * own copy classifier reads that column to tell a reader which happened.
     */
    const topUp = event.topUp
    const amount = topUp
      ? topUp.credits
      : event.planChange
        ? event.planChange.credits
        : plan.monthlyCredits
    const key = topUp
      ? topUpGrantKey(topUp.orderId)
      : event.planChange
        ? planChangeGrantKey(event.planChange.changeId)
        : purchaseGrantKey(event)

    // A zero-credit change is a real event (an upgrade in the last minutes of a period, where
    // the prorated difference rounds to nothing) and `apply_ledger_entry` rejects a zero
    // amount outright. Report it honestly rather than driving a refusal into the ledger.
    if (amount <= 0) {
      return ok({ granted: 0, balanceAfter: null, replayed: false })
    }

    // Never reject on an infra failure — this returns a Result the webhook handler branches on
    // (same contract as withCredits). The grant is idempotent by `key`, so a caller retry
    // replays rather than double-granting. The message is fixed so no DB internals leak.
    try {
      const res = await port.apply({
        workspaceId: event.workspaceId,
        entryType: topUp ? 'TOPUP' : 'GRANT',
        amount,
        idempotencyKey: key,
        actor: `provider:${event.provider}`,
        meta: {
          eventId: event.eventId,
          planId: event.planId,
          period: event.period,
          mode: event.mode,
          ...(event.planChange ? { planChangeId: event.planChange.changeId } : {}),
          ...(topUp ? { topUpOrderId: topUp.orderId } : {}),
        },
      })
      return ok({ granted: amount, balanceAfter: res.entry.balanceAfter, replayed: res.replayed })
    } catch {
      return err(appError('PROVIDER_ERROR', 'Could not apply plan grant', traceId))
    }
  }
}
