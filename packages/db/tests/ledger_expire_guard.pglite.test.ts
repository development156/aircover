import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'

import { bootFullSchema } from './helpers/pglite-tenant'

/**
 * EXPIRE, guarded by AVAILABLE credits, against the REAL `app.apply_ledger_entry`.
 *
 * ── WHAT THIS PINS ───────────────────────────────────────────────────────────
 * `20260906033100_ledger_expire_available_guard.sql` gives the EXPIRE branch the
 * `v_available = v_total - v_held` check HOLD and DEBIT already had. Before it, an
 * over-large expiry drove `balance_total` below `balance_held` and surfaced as a
 * RAW check_violation on `balance_held_le_total` / `balance_total_nonneg`. After
 * it, EXPIRE refuses with the function's own `CREDIT_INSUFFICIENT`.
 *
 * ── THE MUTATION THIS SURVIVES ───────────────────────────────────────────────
 * Removing the guard leaves EXPIRE still THROWING on an overshoot — just with a
 * constraint name instead of the named error — so a test that only asserted
 * failure would stay green through the revert. Every case below asserts the
 * MESSAGE (`CREDIT_INSUFFICIENT`, never `violates check constraint`) and that the
 * balance and the ledger are untouched. Confirmed by reverting the migration and
 * watching the message assertions go red.
 *
 * ── AND ONE THING ONLY A FULL-STACK BOOT CAN SEE ─────────────────────────────
 * `create or replace` with a mistyped signature OVERLOADS rather than replaces,
 * leaving the old body reachable. Booting every migration in order and asserting
 * exactly one `app.apply_ledger_entry` exists catches that directly.
 */

let db: PGlite
let ws: string

beforeAll(async () => {
  db = await bootFullSchema()
}, 120_000)

afterAll(async () => {
  await db.close()
})

beforeEach(async () => {
  const r = await db.query<{ id: string }>(
    `insert into workspaces (name, slug, created_by)
     values ('exp', 'exp-' || replace(gen_random_uuid()::text, '-', ''), 'user_test')
     returning id`,
  )
  ws = r.rows[0]!.id
})

afterEach(async () => {
  await db.query('delete from workspaces where id = $1', [ws])
})

/** One call to the only ledger write path. Returns the message instead of throwing. */
async function apply(
  entryType: string,
  amount: number,
  key: string,
  opts: { hold?: boolean } = {},
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await db.query(
      `select app.apply_ledger_entry(
         $1::uuid, $2, $3::int, $4, null, null, null, null, null,
         case when $5 then interval '10 minutes' else null end, 'test', null
       ) as res`,
      [ws, entryType, amount, key, opts.hold === true],
    )
    return { ok: true }
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

describe('EXPIRE is bounded by available credits (real Postgres, in-process)', () => {
  it('an EXPIRE larger than the balance raises the NAMED error and writes nothing', async () => {
    expect((await apply('GRANT', 100, 'g1')).ok).toBe(true)
    const before = await entryCount()

    const attempt = await apply('EXPIRE', 150, 'e1')

    expect(attempt.ok).toBe(false)
    if (attempt.ok) return
    // The tell that the guard fired rather than a table constraint. Reverting the
    // migration makes this the check-violation name instead, and this line reds.
    expect(attempt.message).toContain('CREDIT_INSUFFICIENT')
    expect(attempt.message).not.toContain('violates check constraint')

    // Nothing moved, and nothing was recorded.
    expect(await balance()).toEqual({ total: 100, held: 0 })
    expect(await entryCount()).toBe(before)
  })

  it('the boundary is AVAILABLE credits: total minus held, to the exact unit', async () => {
    expect((await apply('GRANT', 100, 'g1')).ok).toBe(true)
    expect((await apply('HOLD', 40, 'h1', { hold: true })).ok).toBe(true)
    expect(await balance()).toEqual({ total: 100, held: 40 })

    // One past available (60) fails with the named error…
    const tooMuch = await apply('EXPIRE', 61, 'e_over')
    expect(tooMuch.ok).toBe(false)
    if (tooMuch.ok) return
    expect(tooMuch.message).toContain('CREDIT_INSUFFICIENT')
    expect(await balance()).toEqual({ total: 100, held: 40 })

    // …and exactly on it succeeds. Held credits bound the expiry as firmly as the total.
    const exact = await apply('EXPIRE', 60, 'e_exact')
    expect(exact.ok).toBe(true)
    expect(await balance()).toEqual({ total: 40, held: 40 })
  })

  it('an EXPIRE within available still works, so the guard did not seize the branch', async () => {
    expect((await apply('GRANT', 100, 'g1')).ok).toBe(true)
    const expired = await apply('EXPIRE', 30, 'e1')
    expect(expired.ok).toBe(true)
    expect(await balance()).toEqual({ total: 70, held: 0 })
    expect(await entryCount()).toBe(2)
  })

  it('exactly one app.apply_ledger_entry exists — the replace did not overload', async () => {
    const r = await db.query<{ n: number }>(
      `select count(*)::int as n
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'app' and p.proname = 'apply_ledger_entry'`,
    )
    expect(r.rows[0]!.n).toBe(1)
  })
})
