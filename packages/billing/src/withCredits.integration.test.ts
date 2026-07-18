import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'
import { availableCredits, holdKey } from '@sahoda/shared'
import { createPgLedgerPort, type PgLedgerPort } from './ledger/pg'
import { createWithCredits } from './withCredits'

// Secrets live in the repo-root .env; dotenv reads it at runtime (fs, not the Read tool).
loadEnv({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true })
const DB_URL = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? ''

// Real-DB tests against the live ledger function — skipped when no DB URL is present.
describe.skipIf(!DB_URL)('withCredits against the real ledger', () => {
  let port: PgLedgerPort
  let ws: string

  beforeAll(() => {
    port = createPgLedgerPort({ connectionString: DB_URL })
  })
  afterAll(async () => {
    await port.close()
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

  it('advances the attempt on a retry after a settled run (fresh hold, charged again)', async () => {
    await grant(100)
    const withCredits = createWithCredits(port)
    const opts = { workspaceId: ws, action: 'caption_rewrite' as const, objectRef: 'c1' }

    const first = await withCredits(opts, async () => 'a')
    const second = await withCredits(opts, async () => 'b')

    expect(first.ok && second.ok).toBe(true)
    expect(await port.balance(ws)).toEqual({ total: 98, held: 0 }) // two caption_rewrite @1
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
