import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { bootSchema } from './helpers/pglite-schema'
// @ts-expect-error — the invariant checker is a plain .mjs script with no declarations.
import { CHECKS } from '../scripts/ledger-invariants.mjs'

/**
 * Reversing money against the REAL `app.apply_ledger_entry`.
 *
 * ── WHY THIS SUITE EXISTS AT ALL ─────────────────────────────────────────────
 * `packages/billing` proves its reversal logic against a fake. A fake can only be as right
 * as whoever wrote it, and the single most important fact about a chargeback in this
 * system — that an over-large one writes NOTHING rather than clamping itself — is a fact
 * about a Postgres CHECK constraint, not about TypeScript. So it is measured here, on the
 * real function, loaded from the real migration file.
 *
 * The live suite in `ledger.test.ts` cannot do this: `helpers/forbidden-target.ts` refuses
 * the one Supabase project this account has, and it is right to. PGlite is the only place
 * the function can actually be RUN.
 *
 * ── ONE DATABASE, ONE WORKSPACE PER TEST ─────────────────────────────────────
 * Booting a WebAssembly Postgres costs about three seconds; doing it per test took this
 * file to 88 seconds and past the suite timeout under a parallel run. Every table here is
 * workspace-scoped, so a fresh workspace gives the same isolation for nothing — and the
 * workspace is deleted afterwards so the GLOBAL invariant queries below see a clean
 * database rather than the previous test's deliberate corruption.
 */

const LEDGER_SCHEMA = [
  '20260718000001_helpers.sql',
  '20260718000002_identity.sql',
  '20260718000006_billing_ledger.sql',
] as const

/** The check constraints `@sahoda/billing`'s `isBalanceFloorViolation` matches on. */
const FLOOR_CONSTRAINTS = ['balance_held_le_total', 'balance_total_nonneg']

let db: PGlite
let ws: string

beforeAll(async () => {
  db = await bootSchema([...LEDGER_SCHEMA])
}, 60_000)

afterAll(async () => {
  await db.close()
})

beforeEach(async () => {
  const r = await db.query<{ id: string }>(
    `insert into workspaces (name, slug, created_by)
     values ('rev', 'rev-' || replace(gen_random_uuid()::text, '-', ''), 'user_test')
     returning id`,
  )
  ws = r.rows[0]!.id
})

afterEach(async () => {
  // Cascades through credit_ledger. `app.block_mutations` permits it because a cascaded
  // delete runs at trigger depth > 1 — the same escape hatch workspace offboarding uses.
  await db.query('delete from workspaces where id = $1', [ws])
})

/** One call to the only ledger write path. Returns the error message instead of throwing. */
async function apply(
  entryType: string,
  amount: number,
  key: string,
  opts: { settles?: string; hold?: boolean } = {},
): Promise<{ ok: true; id: string; balanceAfter: number } | { ok: false; message: string }> {
  try {
    const r = await db.query<{ res: { entry: { id: string; balance_after: number } } }>(
      `select app.apply_ledger_entry(
         $1::uuid, $2, $3::int, $4, null, null, null, null, $5::uuid,
         case when $6 then interval '10 minutes' else null end, 'test', null
       ) as res`,
      [ws, entryType, amount, key, opts.settles ?? null, opts.hold === true],
    )
    const entry = r.rows[0]!.res.entry
    return { ok: true, id: entry.id, balanceAfter: entry.balance_after }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

const balance = async (): Promise<{ total: number; held: number }> => {
  const r = await db.query<{ balance_total: number; balance_held: number }>(
    `select balance_total, balance_held from credit_balances where workspace_id = $1`,
    [ws],
  )
  return { total: r.rows[0]?.balance_total ?? 0, held: r.rows[0]?.balance_held ?? 0 }
}

const entryCount = async (): Promise<number> => {
  const r = await db.query<{ n: number }>(
    `select count(*)::int as n from credit_ledger where workspace_id = $1`,
    [ws],
  )
  return r.rows[0]!.n
}

describe('the ledger under a reversal (real Postgres, in-process)', () => {
  /**
   * THE MEASUREMENT THE WHOLE DESIGN RESTS ON.
   *
   * A chargeback larger than the balance does not clamp itself and does not partially
   * apply. The transaction aborts and the ledger records nothing at all — which is worse
   * than an imperfect record, because the money has left the bank account either way.
   */
  it('an over-large ADJUST writes NOTHING — it neither clamps nor partially applies', async () => {
    await apply('GRANT', 1500, 'g1')
    await apply('DEBIT', 1300, 'd1')
    expect(await balance()).toEqual({ total: 200, held: 0 })

    const before = await entryCount()
    const attempt = await apply('ADJUST', -1500, 'cb1')

    expect(attempt.ok).toBe(false)
    if (attempt.ok) return
    // Pinned wording. `packages/billing/src/reversals/applyReversal.test.ts` feeds this exact
    // string to `isBalanceFloorViolation`; if Postgres rewords it, this fails first.
    expect(attempt.message).toContain('violates check constraint')
    expect(FLOOR_CONSTRAINTS.some((c) => attempt.message.includes(c))).toBe(true)

    // Nothing moved, and nothing was recorded.
    expect(await balance()).toEqual({ total: 200, held: 0 })
    expect(await entryCount()).toBe(before)
  })

  it('the boundary is AVAILABLE credits: total minus held, to the exact unit', async () => {
    await apply('GRANT', 1000, 'g1')
    await apply('HOLD', 800, 'h1', { hold: true })
    expect(await balance()).toEqual({ total: 1000, held: 800 })

    // One past the line fails…
    const tooMuch = await apply('ADJUST', -201, 'cb_over')
    expect(tooMuch.ok).toBe(false)

    // …and exactly on it succeeds. Held credits bound the reversal as firmly as the total.
    const exact = await apply('ADJUST', -200, 'cb_exact')
    expect(exact.ok).toBe(true)
    expect(await balance()).toEqual({ total: 800, held: 800 })
  })

  it('a clamped reversal is a NEW row — the entries it compensates are untouched', async () => {
    await apply('GRANT', 1500, 'g1')
    expect((await apply('DEBIT', 1300, 'd1')).ok).toBe(true)
    expect((await apply('ADJUST', -200, 'cb1')).ok).toBe(true)

    const rows = await db.query<{ seq: number; entry_type: string; amount: number }>(
      `select entry_type, amount from credit_ledger where workspace_id = $1 order by seq`,
      [ws],
    )
    expect(rows.rows).toEqual([
      { entry_type: 'GRANT', amount: 1500 },
      { entry_type: 'DEBIT', amount: 1300 },
      { entry_type: 'ADJUST', amount: -200 },
    ])
  })

  it('the ledger refuses to be edited, so a reversal COULD not have been one', async () => {
    await apply('GRANT', 1500, 'g1')
    // Not a style rule — `app.block_mutations` enforces it against service_role too, and
    // PGlite connects as superuser, so this is the strongest form of the check.
    await expect(
      db.query(`update credit_ledger set amount = 1 where workspace_id = $1`, [ws]),
    ).rejects.toThrow(/append-only/)
    await expect(
      db.query(`delete from credit_ledger where workspace_id = $1`, [ws]),
    ).rejects.toThrow(/append-only/)
  })

  it('replays a repeated reversal instead of reversing the money twice', async () => {
    await apply('GRANT', 1500, 'g1')
    const first = await apply('ADJUST', -500, 'cb:dispute-1')
    const second = await apply('ADJUST', -500, 'cb:dispute-1')

    expect(first.ok && second.ok).toBe(true)
    expect(await balance()).toEqual({ total: 1000, held: 0 })
    expect(await entryCount()).toBe(2)
  })

  it('a zero ADJUST is refused, so a nil reversal must never reach the ledger', async () => {
    await apply('GRANT', 1500, 'g1')
    const zero = await apply('ADJUST', 0, 'cb_zero')
    expect(zero.ok).toBe(false)
    if (zero.ok) return
    expect(zero.message).toContain('INVALID_AMOUNT')
  })

  /**
   * FOUND WHILE WRITING THIS SUITE, and worth recording because it changes what the
   * invariant checker's `no_double_settlement` query is FOR.
   *
   * A second entry settling the same HOLD cannot be inserted at all — `settles_entry_id`
   * carries a UNIQUE constraint, so the database refuses it before any application code is
   * consulted. That is a stronger guarantee than detection: the check in
   * `scripts/ledger-invariants.mjs` can therefore never fire while that index exists, and
   * it is kept only so that dropping the index would not silently remove the guarantee.
   */
  it('the database makes double settlement impossible, not merely detectable', async () => {
    await apply('GRANT', 1000, 'g1')
    const hold = await apply('HOLD', 300, 'h1', { hold: true })
    expect(hold.ok).toBe(true)
    if (!hold.ok) return
    expect((await apply('DEBIT', 250, 'd1', { settles: hold.id })).ok).toBe(true)

    // Through the function: rejected by its own pre-check.
    const viaFunction = await apply('RELEASE', 300, 'r1', { settles: hold.id })
    expect(viaFunction.ok).toBe(false)
    if (viaFunction.ok) return
    expect(viaFunction.message).toContain('HOLD_ALREADY_SETTLED')

    // Behind the function's back: rejected by the unique index.
    await expect(
      db.query(
        `insert into credit_ledger
           (workspace_id, entry_type, amount, balance_after, idempotency_key, settles_entry_id, actor)
         values ($1, 'RELEASE', 300, 750, 'smuggled-release', $2, 'by-hand')`,
        [ws, hold.id],
      ),
    ).rejects.toThrow(/settles_entry_id/)
  })
})

/**
 * The invariant checker, checked.
 *
 * `scripts/ledger-invariants.mjs` reported ALL INVARIANTS HOLD against production. That
 * sentence is worth nothing unless the same queries can be shown to say the opposite when
 * something is genuinely wrong — so here they are run against a ledger built by the real
 * function, and then against the same ledger with one row corrupted.
 */
describe('the invariant checker itself', () => {
  const runChecks = async (): Promise<Record<string, number>> => {
    const out: Record<string, number> = {}
    for (const check of CHECKS as { id: string; sql: string }[]) {
      const r = await db.query(check.sql)
      out[check.id] = r.rows.length
    }
    return out
  }

  /** A ledger with one of everything the checker knows how to read. */
  beforeEach(async () => {
    await apply('GRANT', 1000, 'g1')
    await apply('TOPUP', 500, 't1')
    const hold = await apply('HOLD', 300, 'h1', { hold: true })
    if (hold.ok) await apply('DEBIT', 250, 'd1', { settles: hold.id })
    await apply('HOLD', 100, 'h2', { hold: true })
    await apply('ADJUST', -50, 'a1')
  })

  it('passes on a ledger the real function built', async () => {
    // Named explicitly rather than summed, so a check that silently stopped selecting
    // anything cannot pass as "no violations".
    expect(await runChecks()).toEqual({
      total_reconciles: 0,
      held_reconciles: 0,
      held_le_total: 0,
      no_double_settlement: 0,
      settlement_targets_a_hold: 0,
      debit_within_hold: 0,
      amount_sign: 0,
      balance_after_replays: 0,
      ledger_without_balance: 0,
    })
    // And the ledger it passed on is not empty. 1000 + 500 - 250 - 50 = 1200, 100 held.
    expect(await balance()).toEqual({ total: 1200, held: 100 })
  })

  /**
   * A ledger row inserted OUTSIDE `apply_ledger_entry` — the exact shape of a manual
   * "fix" someone might make with a psql session at 2am. The balance table is not
   * touched, so the checks must notice the ledger no longer explains it.
   */
  it('FAILS when a row is written behind the function’s back', async () => {
    await db.query(
      `insert into credit_ledger
         (workspace_id, entry_type, amount, balance_after, idempotency_key, actor)
       values ($1, 'GRANT', 9999, 99999, 'smuggled', 'by-hand')`,
      [ws],
    )
    const results = await runChecks()
    expect(results.total_reconciles).toBe(1)
    expect(results.balance_after_replays).toBeGreaterThan(0)
  })

  /** A balance nudged without a matching entry — the other direction of the same fraud. */
  it('FAILS when the balance is edited without a ledger entry', async () => {
    await db.query(
      `update credit_balances set balance_total = balance_total + 1000 where workspace_id = $1`,
      [ws],
    )
    const results = await runChecks()
    expect(results.total_reconciles).toBe(1)
    expect(results.held_reconciles).toBe(0)
  })

  /** A hold released without its reservation being returned to the balance. */
  it('FAILS when held credits and open holds disagree', async () => {
    await db.query(`update credit_balances set balance_held = 0 where workspace_id = $1`, [ws])
    const results = await runChecks()
    expect(results.held_reconciles).toBe(1)
  })
})
