import type { BillingProvider } from '@sahoda/shared'

/** The fields billing records on a billing_webhook_events row when it first sees an event. */
export interface WebhookEventInput {
  provider: BillingProvider
  eventId: string
  eventType: string | null
  /** The verified raw payload, retained verbatim for audit (stored as jsonb). */
  payload: unknown
}

export interface WebhookClaim {
  /** The billing_webhook_events row id. */
  id: string
  /**
   * True when this (provider, event_id) has already reached 'processed' — the caller must
   * SKIP (no re-grant). A row still 'received'/'failed' (crashed or errored mid-process)
   * returns false so it can be safely re-driven; the grant itself is idempotent.
   */
  alreadyProcessed: boolean
}

/**
 * Records provider webhook events with (provider, event_id) idempotency — the service-only
 * billing_webhook_events table (RLS on, no policies), reached over the direct pg connection.
 * This is provider-level replay dedup + an audit trail ON TOP of the ledger's per-payment key.
 */
export interface WebhookEventStore {
  /** Claim an event for processing: insert a 'received' row, or return the existing one. */
  claim(input: WebhookEventInput): Promise<WebhookClaim>
  markProcessed(id: string): Promise<void>
  markFailed(id: string, error: string): Promise<void>
}
