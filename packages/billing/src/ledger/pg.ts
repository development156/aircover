import { Pool } from 'pg'
import type { ApplyLedgerInput } from '@sahoda/shared'
import { assertServerOnly } from '../env'
import { pgSsl } from '../pgSsl'
import type {
  HoldLookup,
  HoldSettlement,
  LatestHold,
  LedgerApplyResult,
  LedgerBalance,
  LedgerPort,
} from './port'

/** The raw JSON `app.apply_ledger_entry()` returns (snake_case columns from the row). */
interface RawApplyResult {
  entry: { id: string; balance_after: number }
  replayed: boolean
}

export interface PgLedgerPortOptions {
  connectionString: string
  /** Inject a pre-built pool (tests / connection reuse); otherwise one is created. */
  pool?: Pool
}

/** The port plus its pool + close hook, so tests and long-lived servers can manage the connection. */
export type PgLedgerPort = LedgerPort & { pool: Pool; close(): Promise<void> }

/**
 * The direct-Postgres LedgerPort — billing's server-only path to the service-only
 * `app.apply_ledger_entry()` (the `app` schema is not PostgREST-exposed, so this uses
 * a `pg` Pool, never supabase-js). Positional argument order matches the RPC exactly:
 * (workspace, entryType, amount, key, actionType, objectRef, modelTier, cogs,
 * settlesEntryId, holdTtlSeconds, actor, meta).
 */
export function createPgLedgerPort(opts: PgLedgerPortOptions): PgLedgerPort {
  assertServerOnly()
  const pool =
    opts.pool ??
    new Pool({
      connectionString: opts.connectionString,
      max: 10,
      ssl: pgSsl(opts.connectionString),
    })

  async function apply(input: ApplyLedgerInput): Promise<LedgerApplyResult> {
    const r = await pool.query<{ res: RawApplyResult }>(
      'select app.apply_ledger_entry($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) as res',
      [
        input.workspaceId,
        input.entryType,
        input.amount,
        input.idempotencyKey,
        input.actionType ?? null,
        input.objectRef ?? null,
        input.modelTier ?? null,
        input.cogsUsdEst ?? null,
        input.settlesEntryId ?? null,
        input.holdTtlSeconds ?? null,
        input.actor ?? null,
        input.meta ?? null,
      ],
    )
    const res = r.rows[0]!.res
    return {
      entry: { id: res.entry.id, balanceAfter: res.entry.balance_after },
      replayed: res.replayed,
    }
  }

  async function balance(workspaceId: string): Promise<LedgerBalance> {
    const r = await pool.query<{ balance_total: number; balance_held: number }>(
      'select balance_total, balance_held from credit_balances where workspace_id = $1',
      [workspaceId],
    )
    const row = r.rows[0]
    // No ledger activity yet ⇒ no materialized row ⇒ zero balance.
    return { total: row?.balance_total ?? 0, held: row?.balance_held ?? 0 }
  }

  async function latestHold(ref: HoldLookup): Promise<LatestHold | null> {
    // Match the structured action_type + object_ref columns (which withCredits always sets on
    // its HOLDs) — exact, and free of the ':' / LIKE-metachar ambiguity a key-pattern match has.
    // The settling entry's type (settles_entry_id is unique, so at most one) tells us WHETHER
    // this hold already charged (DEBIT) or was refunded (RELEASE) — the attempt-derivation
    // decision that keeps a lost-ack retry from double-charging.
    const r = await pool.query<{ key: string; settled_by: string | null }>(
      `select h.idempotency_key as key,
              (select s.entry_type from credit_ledger s where s.settles_entry_id = h.id limit 1) as settled_by
       from credit_ledger h
       where h.workspace_id = $1 and h.entry_type = 'HOLD' and h.action_type = $2 and h.object_ref = $3
       order by h.seq desc
       limit 1`,
      [ref.workspaceId, ref.action, ref.objectRef],
    )
    const row = r.rows[0]
    if (!row) return null
    // holdKey = `${action}:${objectRef}:${attempt}` — attempt is always the final segment.
    const attempt = Number(row.key.slice(row.key.lastIndexOf(':') + 1))
    if (!Number.isInteger(attempt)) return null
    return { attempt, settledBy: toSettlement(row.settled_by) }
  }

  return { apply, balance, latestHold, pool, close: () => pool.end() }
}

/** Map the settling entry's ledger type to the settlement the attempt logic cares about. */
function toSettlement(entryType: string | null): HoldSettlement {
  if (entryType === 'DEBIT') return 'debit'
  if (entryType === 'RELEASE') return 'release'
  return null // open, or settled by some other type — conservatively treat as not-advanceable
}
