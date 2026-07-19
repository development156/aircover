import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'
import { createPgLedgerPort, type PgLedgerPort } from '../ledger/pg'
import { createApplyPlanGrant } from './applyPlanGrant'
import { createProcessPaymentEvent, type ProcessResult } from './processPaymentEvent'
import { createPgWebhookEventStore } from './pgStore'
import { createFixtureProvider } from '../providers/fixture'
import type { Result } from '@sahoda/shared'
import type { ParsedWebhookEvent } from '../providers/types'

loadEnv({ path: resolve(import.meta.dirname, '../../../../.env'), quiet: true })
const DB_URL = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? ''

describe.skipIf(!DB_URL)(
  'webhook processing against the real billing_webhook_events + ledger',
  () => {
    let ledger: PgLedgerPort
    let process: (e: ParsedWebhookEvent) => Promise<Result<ProcessResult>>
    let ws: string
    const provider = createFixtureProvider()

    beforeAll(() => {
      ledger = createPgLedgerPort({ connectionString: DB_URL })
      const store = createPgWebhookEventStore(ledger.pool)
      const applyPlanGrant = createApplyPlanGrant(ledger)
      process = createProcessPaymentEvent({ store, applyPlanGrant })
    })
    afterAll(async () => {
      await ledger.close()
    })
    beforeEach(async () => {
      const r = await ledger.pool.query<{ id: string }>(
        `insert into workspaces (name, slug, created_by)
       values ('billing-wh-it', 'wh-it-' || replace(gen_random_uuid()::text, '-', ''), 'user_wh_it')
       returning id`,
      )
      ws = r.rows[0]!.id
    })
    afterEach(async () => {
      // billing_webhook_events has no workspace_id — clean it by our per-workspace event-id prefix.
      await ledger.pool.query(`delete from billing_webhook_events where event_id like $1`, [
        `${ws}:%`,
      ])
      if (ws) await ledger.pool.query('delete from workspaces where id = $1', [ws])
    })

    // Full path: emit a signed fixture webhook → verify → parse → the ParsedWebhookEvent to process.
    function build(suffix: string, period = '2026-07'): ParsedWebhookEvent {
      const { rawBody, signature } = provider.emitPaidEvent({
        workspaceId: ws,
        planId: 'starter',
        period,
        eventId: `${ws}:${suffix}`,
      })
      expect(provider.verifyWebhookSignature(rawBody, signature)).toBe(true)
      return provider.parseWebhookEvent(rawBody)
    }

    async function rowStatus(eventId: string): Promise<{ status: string; hasPayload: boolean }> {
      const r = await ledger.pool.query<{ status: string; payload: unknown }>(
        `select status, payload from billing_webhook_events where provider = 'fixture' and event_id = $1`,
        [eventId],
      )
      return { status: r.rows[0]!.status, hasPayload: r.rows[0]!.payload != null }
    }

    it('processes a paid event once: grant applied and the audit row marked processed', async () => {
      const event = build('evt-1')
      const result = await process(event)

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('expected ok')
      expect(result.data.status).toBe('processed')
      expect(result.data.grant?.granted).toBe(1500) // starter monthly credits
      expect(await ledger.balance(ws)).toEqual({ total: 1500, held: 0 })

      const row = await rowStatus(`${ws}:evt-1`)
      expect(row.status).toBe('processed')
      expect(row.hasPayload).toBe(true) // raw payload retained for audit
    })

    it('skips a duplicate delivery of the same event: no re-grant, a single audit row', async () => {
      const event = build('evt-dup')
      await process(event)
      const again = await process(event)

      expect(again.ok).toBe(true)
      if (!again.ok) throw new Error('expected ok')
      expect(again.data.status).toBe('duplicate')
      expect(again.data.grant).toBeNull()
      expect(await ledger.balance(ws)).toEqual({ total: 1500, held: 0 }) // NOT 3000

      const count = await ledger.pool.query<{ n: number }>(
        `select count(*)::int as n from billing_webhook_events where event_id = $1`,
        [`${ws}:evt-dup`],
      )
      expect(count.rows[0]!.n).toBe(1)
    })

    it('records a new audit row for a different event_id but the grant replays (two-layer idempotency)', async () => {
      await process(build('evt-a'))
      const second = await process(build('evt-b')) // different provider event id, same plan + period

      expect(second.ok).toBe(true)
      if (!second.ok) throw new Error('expected ok')
      expect(second.data.status).toBe('processed')
      // The events table let it through (new row), but the ledger's monthlyGrantKey replayed —
      // so the grant is applied exactly once even across distinct provider event ids.
      expect(second.data.grant?.replayed).toBe(true)
      expect(await ledger.balance(ws)).toEqual({ total: 1500, held: 0 })

      const count = await ledger.pool.query<{ n: number }>(
        `select count(*)::int as n from billing_webhook_events where event_id like $1`,
        [`${ws}:evt-%`],
      )
      expect(count.rows[0]!.n).toBe(2) // two audit rows
    })
  },
)
