import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import type { Pool } from 'pg'
import { hasLedgerEnv } from './helpers/env'
import { pgPool } from './helpers/db'

type LedgerRow = {
  id: string
  entry_type: string
  amount: number
  balance_after: number
}
type ApplyResult = { entry: LedgerRow; replayed: boolean }

// The ledger fn is the correctness-critical, non-negotiable feature. These are
// property/concurrency tests against the live function (skipped without a DB URL).
describe.skipIf(!hasLedgerEnv)('app.apply_ledger_entry', () => {
  let pool: Pool
  let ws: string
  const created: string[] = []

  beforeAll(async () => {
    pool = pgPool()
    // Recovery sweep. credit_ledger.idempotency_key is GLOBALLY unique, and the dev DB is
    // shared — so a run killed between beforeEach and afterEach used to strand rows that
    // broke every later run forever. Keys are workspace-scoped now (see key() below), so
    // strays can no longer collide; this just clears the litter they leave.
    // The 1h floor is a heuristic, not a guarantee: it keeps a normally-paced concurrent
    // run (whole suite ≈ 40s) well out of range, but a run parked at a breakpoint for over
    // an hour would have its live workspace swept from under it. That trade is deliberate —
    // the alternative, never sweeping, is what poisoned this DB in the first place.
    await pool.query(
      `delete from workspaces
       where created_by = 'user_ledger' and created_at < now() - interval '1 hour'`,
    )
  })
  afterAll(async () => {
    // Safety net for anything afterEach missed (e.g. it threw mid-suite).
    if (created.length > 0) {
      await pool.query('delete from workspaces where id = any($1::uuid[])', [created])
    }
    await pool.end()
  })

  beforeEach(async () => {
    const r = await pool.query<{ id: string }>(
      `insert into workspaces (name, slug, created_by)
       values ('ledger-test', 'led-' || replace(gen_random_uuid()::text, '-', ''), 'user_ledger')
       returning id`,
    )
    ws = r.rows[0]!.id
    created.push(ws)
  })
  afterEach(async () => {
    if (ws) await pool.query('delete from workspaces where id = $1', [ws])
    // Clear it: a stale id here would silently scope the NEXT test's keys to a workspace
    // that no longer exists if its beforeEach ever failed.
    ws = ''
  })

  /**
   * Scope every idempotency key to the per-test workspace, mirroring how
   * bootstrap_workspace builds its own ('grant:signup:' || v_ws_id). The column is unique
   * across the WHOLE table, not per tenant, so a bare literal like 'grant:signup' is a
   * one-shot resource on a shared DB: the first interrupted run claims it permanently.
   * A fresh workspace uuid each test makes that impossible.
   *
   * The guard is the point, not defensiveness: without it a failed beforeEach leaves ws
   * empty and every key silently reverts to a fixed literal ('grant:signup:undefined') —
   * re-introducing the exact poisoning this scoping exists to prevent.
   */
  const key = (k: string): string => {
    if (!ws) throw new Error(`no test workspace — refusing to build an unscoped key from "${k}"`)
    return `${k}:${ws}`
  }

  async function apply(
    type: string,
    amount: number,
    k: string,
    opts: { settles?: string; objectRef?: string; holdTtl?: string } = {},
  ): Promise<ApplyResult> {
    const r = await pool.query<{ res: ApplyResult }>(
      `select app.apply_ledger_entry($1,$2,$3,$4,null,$5,null,null,$6,$7,null,null) as res`,
      [
        ws,
        type,
        amount,
        key(k),
        opts.objectRef ?? null,
        opts.settles ?? null,
        opts.holdTtl ?? null,
      ],
    )
    return r.rows[0]!.res
  }

  async function expectReject(p: Promise<unknown>, codeFragment: string) {
    await expect(p).rejects.toThrow(codeFragment)
  }

  async function balance() {
    const r = await pool.query<{ balance_total: number; balance_held: number }>(
      'select balance_total, balance_held from credit_balances where workspace_id = $1',
      [ws],
    )
    return r.rows[0]!
  }

  it('GRANT → HOLD → DEBIT charges only completed units and releases the remainder', async () => {
    const g = await apply('GRANT', 100, 'grant:signup')
    expect(g.entry.balance_after).toBe(100)

    const h = await apply('HOLD', 9, 'post_variants:p1:1') // reserve 3 units × 3 cr
    expect(h.entry.balance_after).toBe(91) // available = total(100) − held(9)

    const d = await apply('DEBIT', 6, 'post_variants:p1:1:debit', { settles: h.entry.id }) // 2 units
    expect(d.entry.balance_after).toBe(94) // charged 6, hold fully released
    expect(await balance()).toEqual({ balance_total: 94, balance_held: 0 })
  })

  it('a failed action RELEASEs the hold — the user is not charged', async () => {
    await apply('GRANT', 50, 'grant:signup')
    const h = await apply('HOLD', 4, 'twin_preflight:x:1')
    const rel = await apply('RELEASE', 4, 'twin_preflight:x:1:release', { settles: h.entry.id })
    expect(rel.entry.balance_after).toBe(50)
    expect(await balance()).toEqual({ balance_total: 50, balance_held: 0 })
  })

  it('replays a duplicate idempotency key without double-applying', async () => {
    await apply('GRANT', 100, 'grant:signup')
    const first = await apply('DEBIT', 5, 'caption_rewrite:c:1:debit-direct')
    const again = await apply('DEBIT', 5, 'caption_rewrite:c:1:debit-direct')
    expect(again.replayed).toBe(true)
    expect(again.entry.id).toBe(first.entry.id)
    expect((await balance()).balance_total).toBe(95) // charged once
  })

  it('blocks a HOLD that exceeds available with CREDIT_INSUFFICIENT', async () => {
    await apply('GRANT', 5, 'grant:signup')
    await expectReject(apply('HOLD', 6, 'site_generate:s:1'), 'CREDIT_INSUFFICIENT')
  })

  it('parallel HOLDs never over-spend (single balance row serializes them)', async () => {
    await apply('GRANT', 100, 'grant:signup')
    const attempts = Array.from({ length: 20 }, (_, i) =>
      apply('HOLD', 10, `parallel:${i}`).then(
        () => 'ok' as const,
        () => 'rejected' as const,
      ),
    )
    const results = await Promise.all(attempts)
    expect(results.filter((r) => r === 'ok').length).toBe(10) // exactly 100/10
    expect(await balance()).toEqual({ balance_total: 100, balance_held: 100 })
  })

  it('double-settle race: exactly one of DEBIT/RELEASE wins', async () => {
    await apply('GRANT', 100, 'grant:signup')
    const h = await apply('HOLD', 20, 'race:h:1')
    const debit = apply('DEBIT', 20, 'race:h:1:debit', { settles: h.entry.id }).then(
      () => 'debit' as const,
      () => 'debit-lost' as const,
    )
    const release = apply('RELEASE', 20, 'race:h:1:release', { settles: h.entry.id }).then(
      () => 'release' as const,
      () => 'release-lost' as const,
    )
    const [a, b] = await Promise.all([debit, release])
    const winners = [a, b].filter((r) => r === 'debit' || r === 'release')
    expect(winners.length).toBe(1)
    expect((await balance()).balance_held).toBe(0)
  })

  it('rejects settling a hold twice (charge-after-release is impossible)', async () => {
    await apply('GRANT', 100, 'grant:signup')
    const h = await apply('HOLD', 10, 'settle:h:1')
    await apply('RELEASE', 10, 'settle:h:1:release', { settles: h.entry.id })
    await expectReject(
      apply('DEBIT', 10, 'settle:h:1:debit', { settles: h.entry.id }),
      'HOLD_ALREADY_SETTLED',
    )
  })

  it('rejects a cross-workspace idempotency key reuse', async () => {
    // The one test that reuses a key across tenants ON PURPOSE — so it passes the already
    // scoped literal through verbatim rather than re-scoping to the second workspace.
    // Still safe to interrupt: the key carries this run's workspace uuid, which is never
    // minted again.
    const shared = key('shared-key')
    await apply('GRANT', 10, 'shared-key')
    const r = await pool.query<{ id: string }>(
      `insert into workspaces (name, slug, created_by)
       values ('other', 'oth-' || replace(gen_random_uuid()::text, '-', ''), 'user_ledger')
       returning id`,
    )
    const other = r.rows[0]!.id
    created.push(other)
    try {
      await expect(
        pool.query(
          `select app.apply_ledger_entry($1,'GRANT',10,$2,null,null,null,null,null,null,null,null)`,
          [other, shared],
        ),
      ).rejects.toThrow('IDEMPOTENCY_KEY_CONFLICT')
    } finally {
      await pool.query('delete from workspaces where id = $1', [other])
    }
  })

  it('keeps the replayed-sum invariant (Σ entry effects == stored balance)', async () => {
    await apply('GRANT', 100, 'grant:signup')
    const h1 = await apply('HOLD', 12, 'inv:h1')
    await apply('DEBIT', 8, 'inv:h1:debit', { settles: h1.entry.id }) // charge 8, release 12
    await apply('TOPUP', 30, 'inv:topup')
    const h2 = await apply('HOLD', 5, 'inv:h2')
    await apply('RELEASE', 5, 'inv:h2:release', { settles: h2.entry.id })

    const inv = await pool.query<{ total: number; held: number }>(
      `select
         coalesce(sum(case
           when entry_type in ('GRANT','TOPUP','PERF_REWARD','ADJUST') then amount
           when entry_type in ('DEBIT','EXPIRE') then -amount
           else 0 end), 0)::int as total,
         coalesce(sum(case when entry_type = 'HOLD'
             and not exists (select 1 from credit_ledger s where s.settles_entry_id = credit_ledger.id)
           then amount else 0 end), 0)::int as held
       from credit_ledger where workspace_id = $1`,
      [ws],
    )
    expect(await balance()).toEqual({
      balance_total: inv.rows[0]!.total,
      balance_held: inv.rows[0]!.held,
    })
  })
})
