import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { openDbUnderTest, type DbUnderTest } from '../test-helpers/db-under-test'
import { createPgLedgerPort, type PgLedgerPort } from '../ledger/pg'
import { createApplyPlanGrant } from './applyPlanGrant'
import { createProcessPaymentEvent, type ProcessResult } from './processPaymentEvent'
import { createPgWebhookEventStore } from './pgStore'
import { createPgPlanResolver, LIVE_SUBSCRIPTION_STATUSES } from '../entitlements/pg'
import { createFixtureProvider } from '../providers/fixture'
import type { Result } from '@sahoda/shared'
import type { ParsedWebhookEvent, PaymentEventType } from '../providers/types'

/**
 * Ported off `describe.skipIf(!LIVE_DB_URL)` on 2026-08-20.
 *
 * The skip meant these had NEVER executed: the only DSN the repo has is
 * production's and the opt-in guarding it is off by default and should stay off.
 * `vitest --reporter=json` reported packages/billing as 270 passed / 26 SKIPPED,
 * and vitest reports a suite that ran nothing exactly as it reports one that
 * passed. They now run against PGlite built from packages/db's real migration
 * files, and against the live database when SAHODA_ALLOW_LIVE_TESTS=1.
 */
describe('webhook processing against the real billing_webhook_events + ledger', () => {
  let db: DbUnderTest
  let ledger: PgLedgerPort
  let process: (e: ParsedWebhookEvent) => Promise<Result<ProcessResult>>
  let ws: string
  const provider = createFixtureProvider()

  beforeAll(async () => {
    db = await openDbUnderTest()
    ledger = createPgLedgerPort({
      connectionString: db.connectionString,
      ...(db.kind === 'pglite' ? { pool: db.pool } : {}),
    })
    const store = createPgWebhookEventStore(ledger.pool)
    const applyPlanGrant = createApplyPlanGrant(ledger)
    process = createProcessPaymentEvent({ store, applyPlanGrant })
  })
  afterAll(async () => {
    await ledger.close()
    await db.close()
  })

  it('is running against a real Postgres, and says which one', () => {
    expect(['pglite', 'live']).toContain(db.kind)
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

  /**
   * billing-ledger-4. A plain purchase used to be keyed on monthlyGrantKey (plan, period,
   * workspace), so a customer who bought Starter on the 3rd and bought it AGAIN on the 20th was
   * charged twice and credited once: the ledger replayed the first grant and the route answered
   * 200. The key now names the payment, so real money always produces credits.
   */
  it('a second real payment for the same plan+period grants AGAIN (two GRANT rows, not a replay)', async () => {
    await process(build('evt-a'))

    // Spend 400 between the two payments so the second balance can only be explained by a
    // second grant: 1500 - 400 + 1500 = 2600, whereas a replay would leave 1100.
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

    const second = await process(build('evt-b')) // a different payment, same plan + period

    expect(second.ok).toBe(true)
    if (!second.ok) throw new Error('expected ok')
    expect(second.data.status).toBe('processed')
    expect(second.data.grant?.replayed).toBe(false)
    expect(second.data.grant?.granted).toBe(1500)
    expect(second.data.grant?.balanceAfter).toBe(2600)
    expect(await ledger.balance(ws)).toEqual({ total: 2600, held: 0 })

    const grants = await ledger.pool.query<{ idempotency_key: string; amount: number }>(
      `select idempotency_key, amount from credit_ledger
        where workspace_id = $1 and entry_type = 'GRANT' order by seq`,
      [ws],
    )
    expect(grants.rows.map((r) => r.amount)).toEqual([1500, 1500])
    // Two distinct keys, each naming its own payment.
    expect(new Set(grants.rows.map((r) => r.idempotency_key)).size).toBe(2)
    expect(grants.rows[0]!.idempotency_key).toContain(`${ws}:evt-a`)
    expect(grants.rows[1]!.idempotency_key).toContain(`${ws}:evt-b`)

    const count = await ledger.pool.query<{ n: number }>(
      `select count(*)::int as n from billing_webhook_events where event_id like $1`,
      [`${ws}:evt-%`],
    )
    expect(count.rows[0]!.n).toBe(2) // two audit rows
  })

  /**
   * The crash window: the grant landed but the process died before the audit row was marked
   * processed. The redelivery carries the SAME event id, so pgStore re-drives it and the ledger
   * must replay (same key) rather than grant a second time for one payment.
   */
  it('re-driving the same event after a crash replays the grant instead of granting twice', async () => {
    const event = build('evt-crash')
    await process(event)
    // Simulate "grant written, markProcessed never ran".
    await ledger.pool.query(
      `update billing_webhook_events set status = 'received', processed_at = null
        where provider = 'fixture' and event_id = $1`,
      [`${ws}:evt-crash`],
    )

    const again = await process(event)

    expect(again.ok).toBe(true)
    if (!again.ok) throw new Error('expected ok')
    expect(again.data.status).toBe('processed')
    expect(again.data.grant?.replayed).toBe(true)
    expect(await ledger.balance(ws)).toEqual({ total: 1500, held: 0 }) // NOT 3000
    expect((await rowStatus(`${ws}:evt-crash`)).status).toBe('processed')
  })

  /**
   * billing-ledger-2. Credits arrived but nothing ever wrote a `subscriptions` row, so
   * entitlements (`createPgPlanResolver`) and the plan screen kept a paying customer on Free:
   * 0 sites, 2 channels, and a proration next month computed from Free again.
   */
  describe('the subscription row a payment must leave behind', () => {
    async function liveRow(): Promise<{
      plan_id: string
      status: string
      provider: string
      current_period_start: Date | null
      current_period_end: Date | null
    } | null> {
      const r = await ledger.pool.query<{
        plan_id: string
        status: string
        provider: string
        current_period_start: Date | null
        current_period_end: Date | null
      }>(
        `select plan_id, status, provider, current_period_start, current_period_end
           from subscriptions
          where workspace_id = $1 and status = any($2::text[])`,
        [ws, [...LIVE_SUBSCRIPTION_STATUSES]],
      )
      expect(r.rows.length).toBeLessThanOrEqual(1)
      return r.rows[0] ?? null
    }

    it('a processed payment_succeeded leaves one live active row for the paid plan and period', async () => {
      expect(await liveRow()).toBeNull()

      const result = await process(build('evt-sub'))
      expect(result.ok && result.data.status).toBe('processed')

      const row = await liveRow()
      expect(row).not.toBeNull()
      expect(row!.plan_id).toBe('starter')
      expect(row!.status).toBe('active')
      expect(row!.provider).toBe('fixture')
      expect(new Date(row!.current_period_start!).toISOString()).toBe('2026-07-01T00:00:00.000Z')
      expect(new Date(row!.current_period_end!).toISOString()).toBe('2026-08-01T00:00:00.000Z')
    })

    it('the entitlements resolver then resolves the PAID plan, not free', async () => {
      const resolver = createPgPlanResolver({
        connectionString: db.connectionString,
        pool: ledger.pool,
      })
      expect(await resolver.resolvePlanId(ws)).toBe('free')

      await process(build('evt-ent'))

      expect(await resolver.resolvePlanId(ws)).toBe('starter')
    })

    it('a second payment in the same period keeps ONE live row (the partial unique index holds)', async () => {
      await process(build('evt-s1'))
      await process(build('evt-s2'))

      const n = await ledger.pool.query<{ n: number }>(
        `select count(*)::int as n from subscriptions where workspace_id = $1`,
        [ws],
      )
      expect(n.rows[0]!.n).toBe(1)
      expect((await liveRow())!.status).toBe('active')
    })

    it('a mid-period plan change moves the live row to the new plan', async () => {
      await process(build('evt-base'))
      expect((await liveRow())!.plan_id).toBe('starter')

      const { rawBody } = provider.emitEvent({
        workspaceId: ws,
        planId: 'growth',
        period: '2026-07',
        eventId: `${ws}:evt-upgrade`,
        eventType: 'payment_succeeded',
      })
      const upgrade: ParsedWebhookEvent = {
        ...provider.parseWebhookEvent(rawBody),
        planChange: { changeId: `${ws}:chg-1`, credits: 1200 },
      }
      const result = await process(upgrade)
      expect(result.ok && result.data.status).toBe('processed')

      const row = await liveRow()
      expect(row!.plan_id).toBe('growth')
      expect(row!.status).toBe('active')
    })

    it('a paid-for later period rolls the row forward, and a late webhook for an older period does not roll it back', async () => {
      await process(build('evt-jul', '2026-07'))
      await process(build('evt-aug', '2026-08'))
      let row = await liveRow()
      expect(new Date(row!.current_period_end!).toISOString()).toBe('2026-09-01T00:00:00.000Z')

      await process(build('evt-jun-late', '2026-06'))
      row = await liveRow()
      expect(new Date(row!.current_period_end!).toISOString()).toBe('2026-09-01T00:00:00.000Z')
    })

    it('a payment that lands during dunning reactivates the row and clears the dunning state', async () => {
      await ledger.pool.query(
        `insert into subscriptions (workspace_id, plan_id, status, provider, grace_ends_at, dunning_attempts, last_failure_at, last_failure_code)
         values ($1, 'starter', 'past_due', 'fixture', now() + interval '3 days', 2, now(), 'CARD_DECLINED')`,
        [ws],
      )

      await process(build('evt-recover'))

      const r = await ledger.pool.query<{
        status: string
        grace_ends_at: Date | null
        dunning_attempts: number
        last_failure_code: string | null
      }>(
        `select status, grace_ends_at, dunning_attempts, last_failure_code
           from subscriptions where workspace_id = $1`,
        [ws],
      )
      expect(r.rows).toHaveLength(1)
      expect(r.rows[0]).toEqual({
        status: 'active',
        grace_ends_at: null,
        dunning_attempts: 0,
        last_failure_code: null,
      })
    })
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
})
