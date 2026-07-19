import type { Pool } from 'pg'
import type { ExpiredHold } from './sweep'

/** Never sweep an unbounded set — a backlog is drained across runs, not in one transaction. */
const DEFAULT_LIMIT = 500

export interface ExpiredHoldSourceOptions {
  pool: Pool
  /**
   * Only reap holds that expired longer ago than this. The HOLD TTL is 10 minutes
   * (billing's DEFAULT_HOLD_TTL_SECONDS) and the sweep runs every 5, so without a margin
   * a slow-but-alive run gets its hold reaped mid-flight: its DEBIT then raises
   * HOLD_ALREADY_SETTLED, and the user sees a failure for work that actually succeeded
   * and was never charged. The margin buys that run time to settle itself.
   */
  graceSeconds: number
  limit?: number
  /** Restrict the sweep to one workspace. Used by tests; the scheduled sweep is global. */
  workspaceId?: string
}

/**
 * Read-only candidate query for the expired-hold reaper: unsettled HOLDs whose TTL lapsed
 * more than `graceSeconds` ago. Reading directly is deliberate — `LedgerPort` is billing's
 * narrow write surface and is not ours to widen. Every WRITE still goes through
 * `app.apply_ledger_entry()` via that port; this only chooses rows.
 *
 * "Unsettled" is the absence of any entry pointing at the HOLD through `settles_entry_id`
 * — the same column whose UNIQUE constraint gives the single-settlement guarantee, so the
 * read and the write agree on what settled means. Oldest first, so a backlog drains in
 * the order credits were stranded.
 */
export function createExpiredHoldSource(
  opts: ExpiredHoldSourceOptions,
): () => Promise<ExpiredHold[]> {
  const { pool, graceSeconds, limit = DEFAULT_LIMIT, workspaceId } = opts

  return async () => {
    const r = await pool.query<{
      id: string
      workspace_id: string
      amount: number
      idempotency_key: string
    }>(
      `select h.id, h.workspace_id, h.amount, h.idempotency_key
         from credit_ledger h
        where h.entry_type = 'HOLD'
          and h.hold_expires_at < now() - make_interval(secs => $1::float8)
          and ($2::uuid is null or h.workspace_id = $2::uuid)
          and not exists (
                select 1 from credit_ledger s where s.settles_entry_id = h.id
              )
        order by h.hold_expires_at
        limit $3`,
      [graceSeconds, workspaceId ?? null, limit],
    )

    return r.rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      amount: row.amount,
      idempotencyKey: row.idempotency_key,
    }))
  }
}
