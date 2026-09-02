import { randomUUID } from 'node:crypto'
import { appError, err, ok, type Result } from '@sahoda/shared'
import type { ParsedWebhookEvent } from '../providers/types'
import type { PlanGrantResult } from './applyPlanGrant'
import type { WebhookEventStore } from './store'
import type { SubscriptionWriter } from './subscriptionWriter'

export interface ProcessResult {
  /**
   * `processed` — a grant was applied. `duplicate` — already-processed event, skipped.
   * `ignored` — a real, correctly-handled delivery that grants nothing (a failed or dropped
   * payment, or an event type we do not recognize).
   *
   * `ignored` is a distinction in this DTO only: the audit row is marked `processed`, because
   * the event WAS handled and `billing_webhook_events.status` is constrained to
   * ('received','processed','failed') — recording it as 'failed' would be a lie, and adding a
   * fourth status needs a wt-db migration this package must not write.
   */
  status: 'processed' | 'duplicate' | 'ignored'
  /** The grant applied this delivery; null for a skipped duplicate or an ignored event. */
  grant: PlanGrantResult | null
}

/**
 * Events that mean "money arrived". Anything else is a legitimate delivery that grants nothing.
 * Kept as a set so a new PaymentEventType has to be classified deliberately rather than falling
 * into the grant path by default.
 */
const GRANTING_EVENT_TYPES = new Set<ParsedWebhookEvent['eventType']>(['payment_succeeded'])

/** User-facing failure copy. Fixed so no store/DB internals reach a caller. */
const GENERIC_FAILURE = 'Could not process the payment event'

export interface ProcessPaymentEventDeps {
  /**
   * The audit-row store AND the subscriptions writer, in one dependency: `createPgWebhookEventStore`
   * returns both over one pool, so the endpoint that already passes the store gets the plan
   * activated without a second thing to wire. A store without `activate` does not compile.
   */
  store: WebhookEventStore & SubscriptionWriter
  applyPlanGrant: (event: ParsedWebhookEvent) => Promise<Result<PlanGrantResult>>
  newTraceId?: () => string
  /**
   * Server-side observability hook. The raw cause goes here, never onto the Result.
   * Default is a no-op — no logger dependency, no console.
   */
  onError?: (cause: unknown, traceId: string) => void
}

/**
 * Idempotent webhook processing (owner ruling #1, now unblocked by the widened provider enum):
 * claim a billing_webhook_events row ((provider, event_id) dedup) → apply the plan grant →
 * activate the subscription → mark the row processed / failed. An already-processed event is
 * skipped with no re-grant. This is provider-level replay dedup + audit ON TOP of the ledger's
 * per-payment grant key — defence in depth. Callers verify the signature and parse the event
 * BEFORE handing it here.
 */
export function createProcessPaymentEvent(
  deps: ProcessPaymentEventDeps,
): (event: ParsedWebhookEvent) => Promise<Result<ProcessResult>> {
  const { store, applyPlanGrant } = deps
  const newTraceId = deps.newTraceId ?? (() => randomUUID())

  return async function processPaymentEvent(
    event: ParsedWebhookEvent,
  ): Promise<Result<ProcessResult>> {
    const traceId = newTraceId()
    try {
      const claim = await store.claim({
        provider: event.provider,
        eventId: event.eventId,
        eventType: event.eventType,
        payload: event.raw,
      })

      // Already fully processed → skip. No re-grant, no double charge.
      if (claim.alreadyProcessed) {
        return ok({ status: 'duplicate', grant: null })
      }

      // A failed/dropped/unrecognized payment is routine traffic, NOT an error. Driving it into
      // applyPlanGrant (which handles only payment_succeeded) returned VALIDATION_ERROR, marked
      // the row 'failed' and answered !ok — so the provider redelivered, and because pgStore
      // treats only 'processed' as terminal the row was re-driven forever. Terminate it here:
      // the event was handled, it simply grants nothing.
      if (!GRANTING_EVENT_TYPES.has(event.eventType)) {
        await store.markProcessed(claim.id)
        return ok({ status: 'ignored', grant: null })
      }

      const grant = await applyPlanGrant(event)
      if (!grant.ok) {
        // Best-effort audit; failing to record the failure must not mask the real error.
        await store
          .markFailed(claim.id, `${grant.error.code}: ${grant.error.message}`)
          .catch(() => {})
        return grant
      }

      // The payment also has to reach `subscriptions`, or entitlements and the plan screen go
      // on reading "free" for a customer who has paid (billing-ledger-2). A zero-credit plan
      // change still activates: the customer bought the plan even if the proration rounded to
      // nothing. Runs BEFORE markProcessed so a failure here leaves the row 'received' and the
      // redelivery re-drives both writes; the grant replays on its payment key, this repeats.
      try {
        await store.activate({
          workspaceId: event.workspaceId,
          planId: event.planId,
          provider: event.provider,
          period: event.period,
        })
      } catch (cause) {
        try {
          deps.onError?.(cause, traceId)
        } catch {
          // a broken logger must not turn a typed error into a rejection
        }
        await store
          .markFailed(claim.id, 'PROVIDER_ERROR: subscription not activated')
          .catch(() => {})
        return err(appError('PROVIDER_ERROR', GENERIC_FAILURE, traceId))
      }

      // If markProcessed throws, the row stays 'received' → a redelivery re-drives the grant
      // (which replays idempotently on its payment key) and marks it then. Self-healing.
      await store.markProcessed(claim.id)
      return ok({ status: 'processed', grant: grant.data })
    } catch (unexpected) {
      try {
        deps.onError?.(unexpected, traceId)
      } catch {
        // a broken logger must not turn a typed error into a rejection
      }
      return err(appError('PROVIDER_ERROR', GENERIC_FAILURE, traceId))
    }
  }
}
