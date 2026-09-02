import type { Pool } from 'pg'
import { assertServerOnly } from '../env'
import { createPgSubscriptionWriter } from './pgSubscriptionWriter'
import type { WebhookClaim, WebhookEventInput, WebhookEventStore } from './store'
import type { SubscriptionWriter } from './subscriptionWriter'

/**
 * The webhook-event store plus the subscription writer plus its pool.
 *
 * The writer rides on the store because the store is the one pool-owning dependency every
 * webhook endpoint already hands to `createProcessPaymentEvent`; composing it here is what
 * puts the subscriptions write on the live path without a second wiring step each endpoint
 * could forget. `subscriptionWriter.ts` stays its own port so tests can fake it alone.
 */
export type PgWebhookEventStore = WebhookEventStore & SubscriptionWriter & { pool: Pool }

/**
 * Direct-Postgres WebhookEventStore for the service-only billing_webhook_events table
 * (RLS on, no policies). Shares the pg Pool with the ledger port. Idempotency is the
 * table's `unique (provider, event_id)` constraint.
 */
export function createPgWebhookEventStore(pool: Pool): PgWebhookEventStore {
  assertServerOnly()
  const subscriptions = createPgSubscriptionWriter(pool)

  async function claim(input: WebhookEventInput): Promise<WebhookClaim> {
    // jsonb param: stringify objects; null stays null.
    const payload = input.payload == null ? null : JSON.stringify(input.payload)

    // A fresh insert returns the row; ON CONFLICT DO NOTHING returns nothing for a duplicate.
    const inserted = await pool.query<{ id: string }>(
      `insert into billing_webhook_events (provider, event_id, event_type, payload, status)
       values ($1, $2, $3, $4, 'received')
       on conflict (provider, event_id) do nothing
       returning id`,
      [input.provider, input.eventId, input.eventType, payload],
    )
    if (inserted.rows[0]) return { id: inserted.rows[0].id, alreadyProcessed: false }

    // Duplicate: a 'processed' row is skipped; a 'received'/'failed' one (crashed or errored
    // mid-process) is re-driven — the grant replays on its payment key, so this can't double-grant.
    const existing = await pool.query<{ id: string; status: string }>(
      `select id, status from billing_webhook_events where provider = $1 and event_id = $2`,
      [input.provider, input.eventId],
    )
    const row = existing.rows[0]!
    return { id: row.id, alreadyProcessed: row.status === 'processed' }
  }

  async function markProcessed(id: string): Promise<void> {
    await pool.query(
      `update billing_webhook_events set status = 'processed', processed_at = now(), error = null where id = $1`,
      [id],
    )
  }

  async function markFailed(id: string, error: string): Promise<void> {
    await pool.query(
      `update billing_webhook_events set status = 'failed', error = $2 where id = $1`,
      [id, error],
    )
  }

  return { claim, markProcessed, markFailed, activate: subscriptions.activate, pool }
}
