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
    const dup = await applyPlanGrant(paid({ eventId: 'evt-b' }))
    expect(dup.ok && dup.data.replayed).toBe(true)
    expect(await port.balance(ws)).toEqual({ total: 1500, held: 0 }) // NOT 3000

    // A new billing period is a fresh grant.
    const next = await applyPlanGrant(paid({ eventId: 'evt-c', period: '2026-08' }))
    expect(next.ok).toBe(true)
    if (!next.ok) throw new Error('expected ok')
    expect(next.data.replayed).toBe(false)
    expect(await port.balance(ws)).toEqual({ total: 3000, held: 0 })
  })
})
