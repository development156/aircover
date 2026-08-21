import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { openDbUnderTest, type DbUnderTest } from './test-helpers/db-under-test'
import { availableCredits, holdKey, releaseKey } from '@sahoda/shared'
import { createPgLedgerPort, type PgLedgerPort } from './ledger/pg'
import { createWithCredits } from './withCredits'

/**
 * Real-DB tests against the real `app.apply_ledger_entry`.
 *
 * These were `describe.skipIf(!LIVE_DB_URL)` and had therefore never run: the
 * only DSN this repo has is production's, and the opt-in that guards it is off
 * by default and should stay off. They now run against PGlite built from the
 * actual migration files, and against the live database when opted in.
 */
describe('withCredits against the real ledger', () => {
  let db: DbUnderTest
  let port: PgLedgerPort
  let ws: string

  beforeAll(async () => {
    db = await openDbUnderTest()
    port = createPgLedgerPort({
      connectionString: db.connectionString,
      ...(db.kind === 'pglite' ? { pool: db.pool } : {}),
    })
  })
  afterAll(async () => {
    await port.close()
    await db.close()
  })

  /**
   * THE BACKSTOP UNDER IDEMPOTENCY, WHICH NOTHING WAS CHECKING.
   *
   * MEASURED 2026-08-20 by mutation: dropping
   * `credit_ledger_idempotency_key_key` left all 37 billing tests green. That
   * is not quite a hole in the replay logic — `app.apply_ledger_entry` takes
   * `select … for update` on the workspace's `credit_balances` row before it
   * looks the key up, so two applies for one workspace are serialised and the
   * second sees the first's row. The UNIQUE index is the layer BELOW that: what
   * catches a key reused across workspaces, or any future path that reaches the
   * table without taking the lock.
   *
   * It is asserted structurally and not by racing two writers, and the reason is
   * a limit of the harness rather than a choice: PGlite is one connection, so
   * `Promise.all` of two applies executes them one after another and would prove
   * serial replay while claiming to prove a race. Reproducing the real race
   * needs a multi-connection Postgres and belongs to the live suite.
   */
  it('the ledger’s idempotency key is UNIQUE at the database level', async () => {
    const r = await port.pool.query<{ def: string }>(
      `select pg_get_constraintdef(c.oid) as def
       from pg_constraint c
       join pg_class rel on rel.oid = c.conrelid
       where rel.relname = 'credit_ledger' and c.contype = 'u'`,
    )
    const defs = r.rows.map((row) => row.def.replace(/\s+/g, ' '))
    expect(defs, 'credit_ledger has no UNIQUE (idempotency_key)').toContain(
      'UNIQUE (idempotency_key)',
    )
  })

  it('a replayed key returns the first entry and charges nothing further', async () => {
    await grant(100)
    const before = await port.balance(ws)
    const key = `replay:${ws}`
    const first = await port.apply({
      workspaceId: ws,
      entryType: 'DEBIT',
      amount: 5,
      idempotencyKey: key,
    })
    const second = await port.apply({
      workspaceId: ws,
      entryType: 'DEBIT',
      amount: 5,
      idempotencyKey: key,
    })

    expect(second.replayed, 'the second apply was treated as a new charge').toBe(true)
    expect(second.entry.id).toBe(first.entry.id)
    const after = await port.balance(ws)
    expect(after.total, 'the workspace was charged twice for one key').toBe(before.total - 5)
    expect(after.held).toBe(before.held)
  })

  it('is running against a real Postgres, and says which one', () => {
    // Without this the suite could silently go back to proving nothing — a
    // pool that failed to build would surface as a cascade of unrelated errors
    // rather than as the one fact that matters.
    expect(['pglite', 'live']).toContain(db.kind)
    console.log(`[billing] ledger suite running against: ${db.kind}`)
  })

  beforeEach(async () => {
    const r = await port.pool.query<{ id: string }>(
      `insert into workspaces (name, slug, created_by)
       values ('billing-it', 'billing-it-' || replace(gen_random_uuid()::text, '-', ''), 'user_billing_it')
       returning id`,
    )
    ws = r.rows[0]!.id
  })
  afterEach(async () => {
    if (ws) await port.pool.query('delete from workspaces where id = $1', [ws])
  })

  async function grant(amount: number): Promise<void> {
    await port.apply({
      workspaceId: ws,
      entryType: 'GRANT',
      amount,
      idempotencyKey: `grant:it:${ws}`,
    })
  }

  it('charges the exact configured cost on success and lowers the balance', async () => {
    await grant(100)
    const withCredits = createWithCredits(port)

    const result = await withCredits(
      { workspaceId: ws, action: 'post_variants', objectRef: 'p1' },
      async () => 'generated',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.data.data).toBe('generated')
    expect(result.data.balanceAfter).toBe(97) // 100 − post_variants(3)

    const bal = await port.balance(ws)
    expect(bal).toEqual({ total: 97, held: 0 })
    expect(availableCredits({ balance_total: bal.total, balance_held: bal.held })).toBe(97)
  })

  it('RELEASEs the hold on failure — the user is never charged', async () => {
    await grant(50)
    const withCredits = createWithCredits(port)

    const result = await withCredits(
      { workspaceId: ws, action: 'twin_preflight', objectRef: 'x1' },
      async () => {
        throw new Error('model boom')
      },
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected err')
    expect(result.error.code).toBe('PROVIDER_ERROR')
    expect(await port.balance(ws)).toEqual({ total: 50, held: 0 })
  })

  it('returns CREDIT_INSUFFICIENT with the exact shortfall and never runs fn', async () => {
    await grant(5)
    const withCredits = createWithCredits(port)
    let ran = false

    const result = await withCredits(
      { workspaceId: ws, action: 'site_generate', objectRef: 's1' },
      async () => {
        ran = true
        return 'nope'
      },
    )

    expect(ran).toBe(false)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected err')
    expect(result.error.code).toBe('CREDIT_INSUFFICIENT')
    expect(result.error.details).toEqual({ available: 5, required: 100 })
    expect(await port.balance(ws)).toEqual({ total: 5, held: 0 })
  })

  it('charges EXACTLY ONCE for a repeat call on the same objectRef (lost-ack DEBIT is replay-safe)', async () => {
    await grant(100)
    const withCredits = createWithCredits(port)
    const opts = { workspaceId: ws, action: 'caption_rewrite' as const, objectRef: 'c1' }

    // A second call on the same (action, objectRef) models a caller that retried after a
    // committed-but-lost-ack DEBIT. The hold is settled-by-DEBIT, so the retry REUSES the
    // attempt → the DEBIT replays idempotently rather than charging a second time.
    const first = await withCredits(opts, async () => 'a')
    const second = await withCredits(opts, async () => 'b')

    expect(first.ok && second.ok).toBe(true)
    expect(await port.balance(ws)).toEqual({ total: 99, held: 0 }) // caption_rewrite(1), charged ONCE
  })

  it('advances to a fresh attempt after a RELEASED hold (a genuine retry after failure charges)', async () => {
    await grant(100)
    // A prior attempt that HELD then was RELEASED (failed + refunded).
    const h = await port.apply({
      workspaceId: ws,
      entryType: 'HOLD',
      amount: 1,
      idempotencyKey: holdKey('caption_rewrite', 'c2', 1),
      actionType: 'caption_rewrite',
      objectRef: 'c2',
      holdTtlSeconds: 600,
    })
    await port.apply({
      workspaceId: ws,
      entryType: 'RELEASE',
      amount: 1,
      idempotencyKey: releaseKey(holdKey('caption_rewrite', 'c2', 1)),
      settlesEntryId: h.entry.id,
    })
    expect(await port.balance(ws)).toEqual({ total: 100, held: 0 }) // refunded, nothing charged

    const withCredits = createWithCredits(port)
    const result = await withCredits(
      { workspaceId: ws, action: 'caption_rewrite', objectRef: 'c2' },
      async () => 'x',
    )

    expect(result.ok).toBe(true)
    expect(await port.balance(ws)).toEqual({ total: 99, held: 0 }) // fresh attempt 2, charged once
  })

  it('resumes an unsettled hold (crash recovery) instead of double-holding', async () => {
    await grant(100)
    // Simulate a run that HELD then died before settling.
    await port.apply({
      workspaceId: ws,
      entryType: 'HOLD',
      amount: 3,
      idempotencyKey: holdKey('post_variants', 'p9', 1),
      actionType: 'post_variants',
      objectRef: 'p9',
      holdTtlSeconds: 600,
    })
    expect(await port.balance(ws)).toEqual({ total: 100, held: 3 })

    const withCredits = createWithCredits(port)
    const result = await withCredits(
      { workspaceId: ws, action: 'post_variants', objectRef: 'p9' },
      async () => 'recovered',
    )

    expect(result.ok).toBe(true)
    expect(await port.balance(ws)).toEqual({ total: 97, held: 0 }) // charged once, hold settled
  })
})
