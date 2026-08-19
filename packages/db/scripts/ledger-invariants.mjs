#!/usr/bin/env node
/**
 * The ledger invariant check — READ ONLY, against whatever `SUPABASE_DB_URL` names.
 *
 * ── WHY THIS EXISTS SEPARATELY FROM tests/ledger.test.ts ─────────────────────
 * That suite proves `app.apply_ledger_entry` BEHAVES correctly, on a database it is
 * allowed to write to. It cannot run against the one Supabase project this account
 * has, because `helpers/forbidden-target.ts` refuses that ref by identity — and it
 * is right to. So there was no way to ask the only question that matters about the
 * money that already exists: **do the balances the app shows reconcile to the
 * entries that produced them?**
 *
 * This script asks exactly that, and can never answer it by writing. It opens the
 * session `read only` at the server before it runs a single statement, so a typo in
 * here is refused by Postgres rather than caught by review.
 *
 * ── THE THREE THINGS THE NAIVE VERSION GETS WRONG ────────────────────────────
 * 1. `credit_ledger.amount` is NOT signed. The CHECK constraint forces it positive
 *    for every type except ADJUST; direction lives in the `if` ladder inside
 *    `apply_ledger_entry`. `sum(amount)` is therefore meaningless — the ladder has
 *    to be mirrored literally (see SIGNED_TOTAL below).
 * 2. `balance_after` is inserted as `v_total - v_held` — it is AVAILABLE, not total.
 *    Reconciling a running sum of deltas against it reports a false violation on
 *    every workspace that has ever held credits.
 * 3. A HOLD is released by the row that SETTLES it (`settles_entry_id`), and a
 *    settling DEBIT releases the WHOLE hold while charging only part of it. So held
 *    credits are `sum(HOLD.amount) where nothing settles that hold` — not
 *    `sum(HOLD) - sum(RELEASE)`, which double-counts a partial batch.
 *
 * Usage:
 *   node packages/db/scripts/ledger-invariants.mjs            # human report
 *   node packages/db/scripts/ledger-invariants.mjs --json     # machine readable
 *
 * Exit code is 1 when any invariant is violated, so it can gate a release.
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '../../..')

/**
 * Parse the repo-root `.env` here rather than importing dotenv into the process env.
 * The credential is used to build one Pool and is never re-exported, so nothing else
 * running in this process can pick it up.
 */
function readEnvFile(path) {
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return {}
  }
  const out = {}
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!m) continue
    let value = m[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[m[1]] = value
  }
  return out
}

/**
 * The `if` ladder from `app.apply_ledger_entry` §4, transcribed. If that function
 * ever changes, this expression is what has to change with it — which is why it is
 * one expression and not scattered through the queries below.
 */
export const SIGNED_TOTAL = `
  sum(
    case entry_type
      when 'GRANT'       then  amount
      when 'TOPUP'       then  amount
      when 'PERF_REWARD' then  amount
      when 'ADJUST'      then  amount          -- the only type whose amount may be negative
      when 'EXPIRE'      then -amount
      when 'DEBIT'       then -amount
      else 0                                    -- HOLD / RELEASE move held, never total
    end
  )::bigint
`

/** Every check, as a name plus the query that finds its violations. */
export const CHECKS = [
  {
    id: 'total_reconciles',
    title: 'credit_balances.balance_total equals the signed sum of its ledger entries',
    sql: `
      with computed as (
        select workspace_id, ${SIGNED_TOTAL} as expected
        from credit_ledger group by workspace_id
      )
      select b.workspace_id,
             b.balance_total,
             coalesce(c.expected, 0) as expected,
             b.balance_total - coalesce(c.expected, 0) as drift
      from credit_balances b
      left join computed c on c.workspace_id = b.workspace_id
      where b.balance_total <> coalesce(c.expected, 0)
      order by abs(b.balance_total - coalesce(c.expected, 0)) desc
    `,
  },
  {
    id: 'held_reconciles',
    title: 'credit_balances.balance_held equals the sum of HOLDs nothing has settled',
    sql: `
      with open_holds as (
        select h.workspace_id, sum(h.amount)::bigint as expected
        from credit_ledger h
        where h.entry_type = 'HOLD'
          and not exists (select 1 from credit_ledger s where s.settles_entry_id = h.id)
        group by h.workspace_id
      )
      select b.workspace_id,
             b.balance_held,
             coalesce(o.expected, 0) as expected,
             b.balance_held - coalesce(o.expected, 0) as drift
      from credit_balances b
      left join open_holds o on o.workspace_id = b.workspace_id
      where b.balance_held <> coalesce(o.expected, 0)
      order by abs(b.balance_held - coalesce(o.expected, 0)) desc
    `,
  },
  {
    id: 'held_le_total',
    title: 'held never exceeds total, and neither is negative',
    sql: `
      select workspace_id, balance_total, balance_held
      from credit_balances
      where balance_held > balance_total or balance_held < 0 or balance_total < 0
    `,
  },
  {
    id: 'no_double_settlement',
    title: 'no HOLD is settled twice',
    sql: `
      select settles_entry_id, count(*)::int as settlements
      from credit_ledger
      where settles_entry_id is not null
      group by settles_entry_id having count(*) > 1
    `,
  },
  {
    id: 'settlement_targets_a_hold',
    title: 'every settling entry points at a HOLD in the same workspace',
    sql: `
      select s.id, s.workspace_id, s.entry_type, s.settles_entry_id,
             h.entry_type as target_type, h.workspace_id as target_workspace
      from credit_ledger s
      left join credit_ledger h on h.id = s.settles_entry_id
      where s.settles_entry_id is not null
        and (h.id is null or h.entry_type <> 'HOLD' or h.workspace_id <> s.workspace_id)
    `,
  },
  {
    id: 'debit_within_hold',
    title: 'a settling DEBIT never charges more than the HOLD it settles',
    sql: `
      select s.id, s.workspace_id, s.amount as debited, h.amount as held
      from credit_ledger s
      join credit_ledger h on h.id = s.settles_entry_id
      where s.entry_type = 'DEBIT' and s.amount > h.amount
    `,
  },
  {
    id: 'amount_sign',
    title: 'only ADJUST carries a non-positive amount, and ADJUST is never zero',
    sql: `
      select id, workspace_id, entry_type, amount
      from credit_ledger
      where (entry_type = 'ADJUST' and amount = 0)
         or (entry_type <> 'ADJUST' and amount <= 0)
    `,
  },
  {
    id: 'balance_after_replays',
    title: 'balance_after on every entry equals available (total − held) as of that entry',
    /**
     * Replays the whole ledger in `seq` order per workspace and compares each row's
     * stored `balance_after` to the available balance the replay produces. This is the
     * check that catches a row written outside `apply_ledger_entry`: the aggregate
     * checks above would still reconcile if someone inserted a matching pair.
     *
     * `settles` is resolved by join rather than by a window, because the amount a
     * settlement releases belongs to the HOLD row, not to the settling row.
     */
    sql: `
      with entries as (
        select e.id, e.workspace_id, e.seq, e.entry_type, e.amount, e.balance_after,
               h.amount as hold_amount
        from credit_ledger e
        left join credit_ledger h on h.id = e.settles_entry_id
      ),
      replayed as (
        select id, workspace_id, seq, entry_type, balance_after,
               sum(
                 case entry_type
                   when 'GRANT'       then  amount
                   when 'TOPUP'       then  amount
                   when 'PERF_REWARD' then  amount
                   when 'ADJUST'      then  amount
                   when 'EXPIRE'      then -amount
                   when 'DEBIT'       then -amount
                   else 0
                 end
               ) over w as total_at,
               sum(
                 case entry_type
                   when 'HOLD'    then  amount
                   when 'RELEASE' then -coalesce(hold_amount, 0)
                   when 'DEBIT'   then -coalesce(hold_amount, 0)
                   else 0
                 end
               ) over w as held_at
        from entries
        window w as (partition by workspace_id order by seq
                     rows between unbounded preceding and current row)
      )
      select id, workspace_id, seq, entry_type, balance_after,
             (total_at - held_at) as expected
      from replayed
      where balance_after <> (total_at - held_at)
      order by workspace_id, seq
    `,
  },
  {
    id: 'ledger_without_balance',
    title: 'no workspace has ledger entries but no balance row',
    sql: `
      select l.workspace_id, count(*)::int as entries
      from credit_ledger l
      left join credit_balances b on b.workspace_id = l.workspace_id
      where b.workspace_id is null
      group by l.workspace_id
    `,
  },
]

/** Context printed alongside the verdict so a clean report is not mistaken for an empty database. */
export const SCALE_SQL = `
  select
    (select count(*) from credit_ledger)::int          as ledger_entries,
    (select count(*) from credit_balances)::int        as balance_rows,
    (select count(distinct workspace_id) from credit_ledger)::int as workspaces_with_entries,
    (select coalesce(sum(balance_total), 0) from credit_balances)::bigint as credits_outstanding,
    (select coalesce(sum(balance_held), 0) from credit_balances)::bigint  as credits_held,
    (select coalesce(max(created_at)::text, '')  from credit_ledger)      as newest_entry
`

async function main() {
  const asJson = process.argv.includes('--json')
  const fileEnv = readEnvFile(resolve(REPO_ROOT, '.env'))
  const connectionString =
    process.env.SUPABASE_DB_URL ||
    process.env.DATABASE_URL ||
    fileEnv.SUPABASE_DB_URL ||
    fileEnv.DATABASE_URL

  if (!connectionString) {
    console.error('No SUPABASE_DB_URL / DATABASE_URL — nothing to check.')
    process.exit(2)
  }

  const ssl = /supabase\.(co|com|in|net)/.test(connectionString)
    ? { rejectUnauthorized: false }
    : undefined
  const pool = new pg.Pool({ connectionString, max: 1, ssl })

  const client = await pool.connect()
  // Belt and braces: the server refuses a write from here on, whatever this file says.
  await client.query('set session characteristics as transaction read only')
  await client.query('begin read only')

  const scale = (await client.query(SCALE_SQL)).rows[0]
  const results = []
  for (const check of CHECKS) {
    const { rows } = await client.query(check.sql)
    results.push({
      id: check.id,
      title: check.title,
      violations: rows.length,
      rows: rows.slice(0, 10),
    })
  }

  await client.query('rollback')
  client.release()
  await pool.end()

  const failed = results.filter((r) => r.violations > 0)
  const report = { scale, results, ok: failed.length === 0 }

  if (asJson) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log('LEDGER INVARIANTS — read-only')
    console.log(
      `  ${scale.ledger_entries} entries · ${scale.balance_rows} balance rows · ` +
        `${scale.workspaces_with_entries} workspaces with entries`,
    )
    console.log(
      `  ${scale.credits_outstanding} credits outstanding (${scale.credits_held} held) · ` +
        `newest entry ${scale.newest_entry || 'none'}`,
    )
    console.log('')
    for (const r of results) {
      console.log(`  ${r.violations === 0 ? 'PASS' : `FAIL(${r.violations})`}  ${r.title}`)
      for (const row of r.rows) console.log(`          ${JSON.stringify(row)}`)
    }
    console.log('')
    console.log(
      failed.length === 0 ? '  ALL INVARIANTS HOLD' : `  ${failed.length} INVARIANT(S) VIOLATED`,
    )
  }

  process.exit(failed.length === 0 ? 0 : 1)
}

/**
 * Only run when invoked directly. The CHECKS above are imported by
 * `tests/ledger_reversal.pglite.test.ts`, which runs them against a real Postgres built
 * from the migration files — including one deliberately corrupted row, so the checker is
 * shown to FAIL as well as to pass. A checker never shown to fail is not a checker.
 */
const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedDirectly) {
  main().catch((e) => {
    console.error(e)
    process.exit(2)
  })
}
