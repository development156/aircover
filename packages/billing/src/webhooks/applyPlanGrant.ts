import { randomUUID } from 'node:crypto'
import { appError, err, monthlyGrantKey, ok, PLAN_CATALOG, type Result } from '@sahoda/shared'
import type { LedgerPort } from '../ledger/port'
import type { ParsedWebhookEvent } from '../providers/types'

export interface PlanGrantResult {
  /** Credits granted (the plan's monthly allotment). */
  granted: number
  balanceAfter: number
  /** True when the ledger replayed this grant (a duplicate webhook) — no double-grant. */
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

    const amount = PLAN_CATALOG[event.planId].monthlyCredits
    const key = monthlyGrantKey(event.planId, event.period, event.workspaceId)

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
  }
}
