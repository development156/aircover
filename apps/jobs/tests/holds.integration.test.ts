import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import type { Pool } from 'pg'
import { createPgLedgerPort, type PgLedgerPort } from '@sahoda/billing'
import { expiredReleaseKey } from '@sahoda/shared'
import { hasLedgerEnv } from './helpers/env'
import { pgPool } from './helpers/db'
import { createExpiredHoldSource } from '../src/holds/pgHolds'
import { sweepExpiredHolds } from '../src/holds/sweep'

/** A HOLD whose TTL lapses almost immediately, so "expired" is reachable in a test. */
const SHORT_TTL_SECONDS = 1
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// The reaper writes real money state through the live ledger function. These prove the
// two things unit tests with a fake port cannot: that the candidate query honours the
// grace margin, and that a late DEBIT racing the sweep settles exactly once.
describe.skipIf(!hasLedgerEnv)('expired-hold reaper (live ledger)', () => {
  let pool: Pool
  let ledger: PgLedgerPort
  let ws: string
  const created: string[] = []

  // credit_ledger.idempotency_key is GLOBALLY unique and the dev DB is shared, so every
  // key is scoped to this run's workspace uuid — strays can never collide with a later run.
  const key = (k: string) => `${k}:${ws}`

  beforeAll(async () => {
    pool = pgPool()
    ledger = createPgLedgerPort({ connectionString: '', pool })
    // Clear litter from runs killed between beforeEach and afterEach.
    await pool.query(
      `delete from workspaces
       where created_by = 'user_jobs_holds' and created_at < now() - interval '1 hour'`,
    )
  })

  afterAll(async () => {
    if (created.length > 0) {
      await pool.query('delete from workspaces where id = any($1::uuid[])', [created])
    }
    await pool.end()
  })

  beforeEach(async () => {
    const r = await pool.query<{ id: string }>(
      `insert into workspaces (name, slug, created_by)
       values ('jobs-holds-test', 'jhd-' || replace(gen_random_uuid()::text, '-', ''), 'user_jobs_holds')
       returning id`,
    )
    ws = r.rows[0]!.id
    created.push(ws)
    await ledger.apply({
      workspaceId: ws,
      entryType: 'GRANT',
      amount: 100,
      idempotencyKey: key('grant:signup'),
    })
  })

  afterEach(async () => {
    if (ws) await pool.query('delete from workspaces where id = $1', [ws])
    ws = ''
  })

  const openHold = async (stem: string, amount = 20) =>
    ledger.apply({
      workspaceId: ws,
      entryType: 'HOLD',
      amount,
      idempotencyKey: key(stem),
      actionType: 'plan_week',
      objectRef: stem,
      holdTtlSeconds: SHORT_TTL_SECONDS,
    })

  const heldFor = async (workspaceId: string) =>
    (
      await pool.query<{ balance_held: number }>(
        'select balance_held from credit_balances where workspace_id = $1',
        [workspaceId],
      )
    ).rows[0]!.balance_held

  const settlementsOf = async (holdId: string) =>
    (
      await pool.query<{ entry_type: string }>(
        'select entry_type from credit_ledger where settles_entry_id = $1',
        [holdId],
      )
    ).rows

  it('finds an unsettled hold once it is past expiry plus grace', async () => {
    const hold = await openHold('reap:found')
    await sleep(1200)

    const found = await createExpiredHoldSource({ pool, graceSeconds: 0 })()

    expect(found.map((h) => h.id)).toContain(hold.entry.id)
    const mine = found.find((h) => h.id === hold.entry.id)!
    expect(mine).toMatchObject({ workspaceId: ws, amount: 20, idempotencyKey: key('reap:found') })
  })

  it('leaves a hold inside the grace margin alone', async () => {
    // The money-critical case: a slow-but-alive run whose DEBIT is still coming must not
    // be reaped out from under it. Expired ~1s ago, grace 60s ⇒ not yet a candidate.
    const hold = await openHold('reap:grace')
    await sleep(1200)

    const found = await createExpiredHoldSource({ pool, graceSeconds: 60 })()

    expect(found.map((h) => h.id)).not.toContain(hold.entry.id)
  })

  it('ignores a hold that has already been settled', async () => {
    const hold = await openHold('reap:settled')
    await ledger.apply({
      workspaceId: ws,
      entryType: 'DEBIT',
      amount: 20,
      idempotencyKey: key('reap:settled:debit'),
      settlesEntryId: hold.entry.id,
    })
    await sleep(1200)

    const found = await createExpiredHoldSource({ pool, graceSeconds: 0 })()

    expect(found.map((h) => h.id)).not.toContain(hold.entry.id)
  })

  it('releases a stranded hold end-to-end, returning the credits to available', async () => {
    const hold = await openHold('reap:e2e')
    await sleep(1200)
    expect(await heldFor(ws)).toBe(20)

    const report = await sweepExpiredHolds({
      mode: 'on',
      listExpiredHolds: createExpiredHoldSource({ pool, graceSeconds: 0, workspaceId: ws }),
      apply: ledger.apply,
    })

    expect(report).toMatchObject({ scanned: 1, released: 1, alreadySettled: 0, failed: 0 })
    expect(await heldFor(ws)).toBe(0)
    const settlements = await settlementsOf(hold.entry.id)
    expect(settlements).toEqual([{ entry_type: 'RELEASE' }])
  })

  it('is idempotent — a second sweep replays the same key and does not double-release', async () => {
    await openHold('reap:twice')
    await sleep(1200)
    const source = createExpiredHoldSource({ pool, graceSeconds: 0, workspaceId: ws })

    const first = await sweepExpiredHolds({ mode: 'on', listExpiredHolds: source, apply: ledger.apply })
    const second = await sweepExpiredHolds({ mode: 'on', listExpiredHolds: source, apply: ledger.apply })

    expect(first.released).toBe(1)
    // The hold is settled now, so it is no longer a candidate at all.
    expect(second).toMatchObject({ scanned: 0, released: 0 })
    expect(await heldFor(ws)).toBe(0)
  })

  it('single-settlement holds against a late DEBIT racing the sweep', async () => {
    // The guarantee the reaper leans on: settles_entry_id is UNIQUE and the ledger fn
    // pre-checks under SELECT ... FOR UPDATE on the balance row, so a DEBIT arriving as
    // the sweep fires cannot both charge and refund. Exactly one settlement commits.
    const hold = await openHold('reap:race')
    await sleep(1200)

    const debit = ledger
      .apply({
        workspaceId: ws,
        entryType: 'DEBIT',
        amount: 20,
        idempotencyKey: key('reap:race:debit'),
        settlesEntryId: hold.entry.id,
      })
      .then(
        () => 'debit-won' as const,
        () => 'debit-lost' as const,
      )

    const sweep = sweepExpiredHolds({
      mode: 'on',
      listExpiredHolds: async () => [
        {
          id: hold.entry.id,
          workspaceId: ws,
          amount: 20,
          idempotencyKey: key('reap:race'),
        },
      ],
      apply: ledger.apply,
    })

    const [debitOutcome, report] = await Promise.all([debit, sweep])

    // Exactly one settlement row exists, whichever side won.
    const settlements = await settlementsOf(hold.entry.id)
    expect(settlements).toHaveLength(1)

    // The sweep accounts for its own outcome honestly: it either released, or it lost
    // the race and recorded that as already-settled — never as a failure.
    expect(report.failed).toBe(0)
    expect(report.released + report.alreadySettled).toBe(1)

    if (debitOutcome === 'debit-won') {
      expect(settlements[0]!.entry_type).toBe('DEBIT')
      expect(report.alreadySettled).toBe(1)
    } else {
      expect(settlements[0]!.entry_type).toBe('RELEASE')
      expect(report.released).toBe(1)
    }

    // Either way the hold is fully unwound — no credits stranded.
    expect(await heldFor(ws)).toBe(0)
  })

  it('derives the release key from the hold so it cannot collide with a failure RELEASE', async () => {
    const hold = await openHold('reap:keyshape')
    await sleep(1200)

    await sweepExpiredHolds({
      mode: 'on',
      listExpiredHolds: createExpiredHoldSource({ pool, graceSeconds: 0, workspaceId: ws }),
      apply: ledger.apply,
    })

    const r = await pool.query<{ idempotency_key: string }>(
      'select idempotency_key from credit_ledger where settles_entry_id = $1',
      [hold.entry.id],
    )
    expect(r.rows[0]!.idempotency_key).toBe(expiredReleaseKey(key('reap:keyshape')))
  })
})
