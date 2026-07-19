import { randomUUID } from 'node:crypto'
import { appError, err, ok, type Result } from '@sahoda/shared'
import type { ParsedWebhookEvent } from '../providers/types'
import type { PlanGrantResult } from './applyPlanGrant'
import type { WebhookEventStore } from './store'

export interface ProcessResult {
  status: 'processed' | 'duplicate'
  /** The grant applied this delivery, or null when the event was a skipped duplicate. */
  grant: PlanGrantResult | null
}

/** User-facing failure copy. Fixed so no store/DB internals reach a caller. */
const GENERIC_FAILURE = 'Could not process the payment event'

export interface ProcessPaymentEventDeps {
  store: WebhookEventStore
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
 * mark the row processed / failed. An already-processed event is skipped with no re-grant.
 * This is provider-level replay dedup + audit ON TOP of the ledger's monthlyGrantKey — defence
 * in depth. Callers verify the signature and parse the event BEFORE handing it here.
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

      const grant = await applyPlanGrant(event)
      if (!grant.ok) {
        // Best-effort audit; failing to record the failure must not mask the real error.
        await store
          .markFailed(claim.id, `${grant.error.code}: ${grant.error.message}`)
          .catch(() => {})
        return grant
      }

      // If markProcessed throws, the row stays 'received' → a redelivery re-drives the grant
      // (which replays idempotently via monthlyGrantKey) and marks it then. Self-healing.
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
