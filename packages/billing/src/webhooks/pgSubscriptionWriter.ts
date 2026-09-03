import type { Pool } from 'pg'
import { assertServerOnly } from '../env'
import { LIVE_SUBSCRIPTION_STATUSES } from '../entitlements/pg'
import {
  periodBounds,
  type ActivateSubscriptionInput,
  type SubscriptionWriter,
} from './subscriptionWriter'

/**
 * The predicate of the partial unique index `subscriptions_one_live`, spelled inline.
 *
 * `on conflict (workspace_id) where <predicate>` only infers a partial index when the
 * predicate matches the index's own, and Postgres will not infer it from a bound parameter —
 * so this is built from the same constant the resolver reads, not typed by hand and not
 * passed as `$n`. The values are code constants, never input.
 */
const LIVE_PREDICATE = `status in (${LIVE_SUBSCRIPTION_STATUSES.map((s) => `'${s}'`).join(', ')})`

/**
 * Direct-Postgres SubscriptionWriter over the server-only pool the ledger port uses.
 *
 * `subscriptions` has a tenant READ policy and no write policy on purpose (a member UPDATE
 * policy would let anyone set their own plan_id to 'agency'). The webhook's pool connects as
 * the database owner, which is how `billing_webhook_events` (RLS on, no policies) is written
 * today, so this write needs no new function and no migration.
 *
 * Not one transaction with the ledger GRANT: the pool exposes `query` only (the PGlite harness
 * has no client checkout), so the two writes are ordered and each is idempotent instead. If
 * this write fails after the grant landed, the audit row stays 'received', the provider
 * redelivers, the grant replays on its payment key and this write runs again.
 */
export function createPgSubscriptionWriter(pool: Pool): SubscriptionWriter {
  assertServerOnly()

  async function activate(input: ActivateSubscriptionInput): Promise<void> {
    const { start, end } = periodBounds(input.period)
    // Only the newest paid period may move the row: a July webhook delivered late, after
    // August was already paid for and written, must not roll the period (or the plan) back.
    await pool.query(
      `insert into subscriptions
         (workspace_id, plan_id, status, provider, current_period_start, current_period_end)
       values ($1, $2, 'active', $3, $4, $5)
       on conflict (workspace_id) where ${LIVE_PREDICATE}
       do update set
         plan_id = excluded.plan_id,
         status = 'active',
         provider = excluded.provider,
         current_period_start = excluded.current_period_start,
         current_period_end = excluded.current_period_end,
         grace_ends_at = null,
         dunning_attempts = 0,
         last_failure_at = null,
         last_failure_code = null
       where subscriptions.current_period_end is null
          or excluded.current_period_end >= subscriptions.current_period_end`,
      [input.workspaceId, input.planId, input.provider, start, end],
    )
  }

  return { activate }
}
