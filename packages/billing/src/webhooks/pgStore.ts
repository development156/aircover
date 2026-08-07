import type { Pool } from 'pg'
import { assertServerOnly } from '../env'
import type { WebhookClaim, WebhookEventInput, WebhookEventStore } from './store'

/** The webhook-event store plus its pool, so callers can share/manage the connection. */
export type PgWebhookEventStore = WebhookEventStore & { pool: Pool }

/**
 * Direct-Postgres WebhookEventStore for the service-only billing_webhook_events table
 * (RLS on, no policies). Shares the pg Pool with the ledger port. Idempotency is the
 * table's `unique (provider, event_id)` constraint.
 */
export function createPgWebhookEventStore(pool: Pool): PgWebhookEventStore {
  assertServerOnly()

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
    // mid-process) is re-driven — the grant replays idempotently, so this can't double-charge.
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

  return { claim, markProcessed, markFailed, pool }
}
