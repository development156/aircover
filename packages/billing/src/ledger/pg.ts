import { Pool, type PoolConfig } from 'pg'
import { readFileSync } from 'node:fs'
import type { ApplyLedgerInput } from '@sahoda/shared'
import { assertServerOnly } from '../env'
import type { HoldLookup, LatestHold, LedgerApplyResult, LedgerBalance, LedgerPort } from './port'

const SUPABASE_HOST = /supabase\.(co|com|in|net)/

/**
 * TLS for the direct Postgres connection (mirrors packages/db test harness). Supabase's
 * direct endpoint presents a private CA chain; set SUPABASE_DB_CA_CERT to enforce full
 * verification. Absent a CA, the connection stays TLS-encrypted but skips chain
 * verification for the known Supabase host only.
 */
function pgSsl(connectionString: string): PoolConfig['ssl'] {
  const caPath = process.env.SUPABASE_DB_CA_CERT
  if (caPath) return { ca: readFileSync(caPath, 'utf8'), rejectUnauthorized: true }
  if (SUPABASE_HOST.test(connectionString)) return { rejectUnauthorized: false }
  return undefined
}

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
    const pattern = `${escapeLike(`${ref.action}:${ref.objectRef}`)}:%`
    const r = await pool.query<{ key: string; settled: boolean }>(
      `select h.idempotency_key as key,
              exists(select 1 from credit_ledger s where s.settles_entry_id = h.id) as settled
       from credit_ledger h
       where h.workspace_id = $1 and h.entry_type = 'HOLD' and h.idempotency_key like $2
       order by h.seq desc
       limit 1`,
      [ref.workspaceId, pattern],
    )
    const row = r.rows[0]
    if (!row) return null
    // holdKey = `${action}:${objectRef}:${attempt}` — attempt is always the final segment.
    const attempt = Number(row.key.slice(row.key.lastIndexOf(':') + 1))
    if (!Number.isInteger(attempt)) return null
    return { attempt, settled: row.settled }
  }

  return { apply, balance, latestHold, pool, close: () => pool.end() }
}

/** Escape LIKE metacharacters in the literal prefix so an objectRef can't act as a wildcard. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`)
}
