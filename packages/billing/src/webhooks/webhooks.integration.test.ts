import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { LIVE_DB_URL } from '../test-helpers/live-env'
import { createPgLedgerPort, type PgLedgerPort } from '../ledger/pg'
import { createApplyPlanGrant } from './applyPlanGrant'
import { createProcessPaymentEvent, type ProcessResult } from './processPaymentEvent'
import { createPgWebhookEventStore } from './pgStore'
import { createFixtureProvider } from '../providers/fixture'
import type { Result } from '@sahoda/shared'
import type { ParsedWebhookEvent, PaymentEventType } from '../providers/types'


describe.skipIf(!LIVE_DB_URL)(
  'webhook processing against the real billing_webhook_events + ledger',
  () => {
    let ledger: PgLedgerPort
    let process: (e: ParsedWebhookEvent) => Promise<Result<ProcessResult>>
    let ws: string
    const provider = createFixtureProvider()

    beforeAll(() => {
      ledger = createPgLedgerPort({ connectionString: LIVE_DB_URL })
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
    function build(
      suffix: string,
      period = '2026-07',
      eventType: PaymentEventType = 'payment_succeeded',
    ): ParsedWebhookEvent {
      const { rawBody, signature } = provider.emitEvent({
        workspaceId: ws,
        planId: 'starter',
        period,
        eventId: `${ws}:${suffix}`,
        eventType,
      })
      expect(provider.verifyWebhookSignature(rawBody, signature)).toBe(true)
      const parsed = provider.parseWebhookEvent(rawBody)
      expect(parsed.eventType).toBe(eventType) // the double really did mint the event we asked for
      return parsed
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

      // Spend 400 before the replay, so `balanceAfter` below can discriminate: with the live
      // balance still at 1500 the assertion cannot tell the original entry from a fresh read.
      const hold = await ledger.apply({
        workspaceId: ws,
        entryType: 'HOLD',
        amount: 400,
        idempotencyKey: 'wh-spend:1',
      })
      await ledger.apply({
        workspaceId: ws,
        entryType: 'DEBIT',
        amount: 400,
        idempotencyKey: 'wh-spend:1:debit',
        settlesEntryId: hold.entry.id,
      })

      const second = await process(build('evt-b')) // different provider event id, same plan + period

      expect(second.ok).toBe(true)
      if (!second.ok) throw new Error('expected ok')
      expect(second.data.status).toBe('processed')
      // The events table let it through (new row), but the ledger's monthlyGrantKey replayed —
      // so the grant is applied exactly once even across distinct provider event ids.
      expect(second.data.grant?.replayed).toBe(true)
      // Owner ruling: on replay these describe the ORIGINAL grant, not a second one. Note
      // balanceAfter is 1500 — the balance as of that original entry — while the live balance is
      // 1100. It is deliberately STALE; read it only alongside `replayed`.
      expect(second.data.grant?.granted).toBe(1500)
      expect(second.data.grant?.balanceAfter).toBe(1500)
      expect(await ledger.balance(ws)).toEqual({ total: 1100, held: 0 })

      const count = await ledger.pool.query<{ n: number }>(
        `select count(*)::int as n from billing_webhook_events where event_id like $1`,
        [`${ws}:evt-%`],
      )
      expect(count.rows[0]!.n).toBe(2) // two audit rows
    })

    /**
     * The regression that a fixture double limited to `emitPaidEvent` could not express.
     * With the real applyPlanGrant behind it, a failed payment used to come back !ok with a
     * VALIDATION_ERROR, land a 'failed' audit row, and — because pgStore only treats
     * 'processed' as terminal — get re-driven on every redelivery, forever.
     */
    it.each([
      ['a failed payment', 'payment_failed' as const],
      ['an unrecognized event', 'unknown' as const],
    ])(
      '%s is handled and terminal: no grant, no failure row, no redelivery loop',
      async (_label, eventType) => {
        const event = build('evt-nogrant', '2026-07', eventType)
        const result = await process(event)

        expect(result.ok).toBe(true) // a non-2xx here is what made the provider redeliver
        if (!result.ok) throw new Error('expected ok')
        expect(result.data.status).toBe('ignored')
        expect(result.data.grant).toBeNull()
        expect(await ledger.balance(ws)).toEqual({ total: 0, held: 0 }) // nothing minted

        // Terminal, and honest: 'processed' (it WAS handled), never 'failed'.
        const row = await rowStatus(`${ws}:evt-nogrant`)
        expect(row.status).toBe('processed')

        // Redelivery is now a duplicate, not another trip through the grant.
        const again = await process(event)
        expect(again.ok).toBe(true)
        if (!again.ok) throw new Error('expected ok')
        expect(again.data.status).toBe('duplicate')
        expect(await ledger.balance(ws)).toEqual({ total: 0, held: 0 })
      },
    )

    it('a failed payment does not block the later successful one for the same plan+period', async () => {
      await process(build('evt-fail', '2026-07', 'payment_failed'))
      const paid = await process(build('evt-paid', '2026-07'))

      expect(paid.ok).toBe(true)
      if (!paid.ok) throw new Error('expected ok')
      expect(paid.data.status).toBe('processed')
      expect(paid.data.grant?.granted).toBe(1500)
      expect(paid.data.grant?.replayed).toBe(false) // the failure consumed no grant key
      expect(await ledger.balance(ws)).toEqual({ total: 1500, held: 0 })
    })
  },
)
