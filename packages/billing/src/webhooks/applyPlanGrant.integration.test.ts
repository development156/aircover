import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'
import { createPgLedgerPort, type PgLedgerPort } from '../ledger/pg'
import { createApplyPlanGrant } from './applyPlanGrant'
import type { ParsedWebhookEvent } from '../providers/types'

loadEnv({ path: resolve(import.meta.dirname, '../../../../.env'), quiet: true })
const DB_URL = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? ''

describe.skipIf(!DB_URL)('applyPlanGrant against the real ledger', () => {
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
       values ('billing-grant-it', 'grant-it-' || replace(gen_random_uuid()::text, '-', ''), 'user_grant_it')
       returning id`,
    )
    ws = r.rows[0]!.id
  })
  afterEach(async () => {
    if (ws) await port.pool.query('delete from workspaces where id = $1', [ws])
  })

  const paid = (over: Partial<ParsedWebhookEvent>): ParsedWebhookEvent => ({
    provider: 'fixture',
    eventId: 'evt-real-1',
    eventType: 'payment_succeeded',
    workspaceId: ws,
    planId: 'starter',
    period: '2026-07',
    mode: 'fixture',
    raw: {},
    ...over,
  })

  it('grants once, replays a duplicate webhook (no double-grant), grants again next period', async () => {
    const applyPlanGrant = createApplyPlanGrant(port)

    const first = await applyPlanGrant(paid({ eventId: 'evt-a' }))
    expect(first.ok).toBe(true)
    if (!first.ok) throw new Error('expected ok')
    expect(first.data.granted).toBe(1500) // starter monthly credits
    expect(first.data.replayed).toBe(false)
    expect(await port.balance(ws)).toEqual({ total: 1500, held: 0 })

    // Same plan+period+workspace but a DIFFERENT provider event id → the ledger's
    // monthlyGrantKey still replays. (This is the safety net while billing_webhook_events
    // — provider-level dedup — is deferred behind the enum widening.)
    // Spend some of it FIRST, so the assertions below can actually discriminate. Asserting
    // balanceAfter === 1500 while the live balance is also 1500 pins nothing — it cannot tell
    // "the original entry's balance" from "a fresh read". After a HOLD+DEBIT of 400 the live
    // balance is 1100, so a stale 1500 is only explicable as the original row.
    const hold = await port.apply({
      workspaceId: ws,
      entryType: 'HOLD',
      amount: 400,
      idempotencyKey: 'spend:1',
    })
    await port.apply({
      workspaceId: ws,
      entryType: 'DEBIT',
      amount: 400,
      idempotencyKey: 'spend:1:debit',
      settlesEntryId: hold.entry.id,
    })
    expect(await port.balance(ws)).toEqual({ total: 1100, held: 0 })

    const dup = await applyPlanGrant(paid({ eventId: 'evt-b' }))
    expect(dup.ok && dup.data.replayed).toBe(true)
    if (!dup.ok) throw new Error('expected ok')
    // Owner ruling, pinned: on replay these describe the ORIGINAL grant, not one applied by this
    // delivery. balanceAfter is the ORIGINAL entry's balance — deliberately STALE, 1500 not the
    // current 1100. Only meaningful read alongside `replayed`.
    expect(dup.data.granted).toBe(1500)
    expect(dup.data.balanceAfter).toBe(1500)
    expect(await port.balance(ws)).toEqual({ total: 1100, held: 0 }) // no second grant

    // A new billing period is a fresh grant.
    const next = await applyPlanGrant(paid({ eventId: 'evt-c', period: '2026-08' }))
    expect(next.ok).toBe(true)
    if (!next.ok) throw new Error('expected ok')
    expect(next.data.replayed).toBe(false)
    // 1100 carried forward + 1500 for the new period (the 400 spent above stays spent).
    expect(next.data.balanceAfter).toBe(2600)
    expect(await port.balance(ws)).toEqual({ total: 2600, held: 0 })
  })
})
