import { createHmac, randomUUID } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { PLAN_CATALOG } from '@sahoda/shared'
import {
  createApplyPlanGrant,
  createPgLedgerPort,
  createPgWebhookEventStore,
  createProcessPaymentEvent,
  type PgLedgerPort,
} from '@sahoda/billing/server-webhook'

import { createCashfreeWebhookHandler } from '@/lib/billing/cashfree-webhook'

/**
 * The Cashfree webhook, end to end, against a REAL database.
 *
 * ── WHY THIS EXISTS ALONGSIDE route.test.ts ──────────────────────────────────
 * `route.test.ts` drives the same handler over a RECORDING POOL: a fake that answers
 * every statement from a literal and asserts on the SQL that was issued. That is the
 * right tool for "which statements, in which order", and it proves the admission gate.
 *
 * It cannot prove idempotency. Its fake `insert into billing_webhook_events` returns the
 * same `{ id: 'wh_row_1' }` row every time with no already-processed flag, and its fake
 * `apply_ledger_entry` returns `replayed: false` unconditionally — so a second delivery
 * takes the first-delivery branch by construction. "Deliver it twice and prove the second
 * changes nothing" is a claim about ROWS, and only rows can settle it.
 *
 * So this suite delivers real signed bytes to the real handler over a real connection,
 * and then READS THE ROWS BACK. A mutation returning without error is not evidence.
 *
 * ── THE DATABASE THIS IS ALLOWED TO USE ──────────────────────────────────────
 * `SAHODA_PGBOX_URL`, and nothing else. The account has exactly ONE Supabase project and
 * it is production, so every suite in this repository that writes is gated away from it
 * (`packages/billing/src/test-helpers/forbidden-target.ts`). A DISTINCT variable name is
 * the point: `SUPABASE_DB_URL` and `DATABASE_URL` are both set in the repo environment
 * and both name production, so a gate reading either could be satisfied by simply
 * existing. Nothing sets this one by accident.
 *
 * Belt and braces, the value is refused if it names a Supabase host at all — a throwaway
 * box is by definition not the managed project, and that rule needs no ref literal to
 * drift out of date.
 *
 *   packages/db/scripts/pgbox.mjs  boots one and applies every migration.
 */
const RAW_BOX_URL = process.env.SAHODA_PGBOX_URL ?? ''
const BOX_URL = /supabase/i.test(RAW_BOX_URL) ? '' : RAW_BOX_URL

/** The merchant secret. Cashfree signs webhooks with the SAME key it authenticates with. */
const SECRET = 'pgbox-merchant-secret'
const PLAN = 'starter' as const
const PERIOD = '2026-07'

/** Base64(HMACSHA256(timestamp . payload, secret)) — the documented 2025-01-01 algorithm. */
function sign(rawBody: string, timestamp: string): string {
  return createHmac('sha256', SECRET)
    .update(timestamp + rawBody)
    .digest('base64')
}

interface Delivery {
  rawBody: string
  timestamp: string
  signature: string
}

describe.skipIf(!BOX_URL)('POST /api/webhooks/cashfree against a real ledger', () => {
  let ledger: PgLedgerPort
  let handle: (request: Request) => Promise<Response>
  /** A SECOND connection, opened independently, used only to read. */
  let reader: PgLedgerPort
  let ws: string

  beforeAll(() => {
    ledger = createPgLedgerPort({ connectionString: BOX_URL })
    reader = createPgLedgerPort({ connectionString: BOX_URL })
    handle = createCashfreeWebhookHandler({
      secretKey: SECRET,
      mode: 'sandbox',
      process: createProcessPaymentEvent({
        store: createPgWebhookEventStore(ledger.pool),
        applyPlanGrant: createApplyPlanGrant(ledger),
      }),
    })
  })

  afterAll(async () => {
    await ledger.close()
    await reader.close()
  })

  beforeEach(async () => {
    const r = await ledger.pool.query<{ id: string }>(
      `insert into workspaces (name, slug, created_by)
       values ('cf-route-it', 'cf-route-' || replace(gen_random_uuid()::text, '-', ''), 'user_cf_it')
       returning id`,
    )
    ws = r.rows[0]!.id
  })

  afterEach(async () => {
    // billing_webhook_events carries no workspace_id, so it is cleaned by the event-id
    // prefix every delivery in this suite is built with.
    await ledger.pool.query(`delete from billing_webhook_events where payload::text like $1`, [
      `%${ws}%`,
    ])
    await ledger.pool.query('delete from workspaces where id = $1', [ws])
  })

  /**
   * One delivery, signed once.
   *
   * The timestamp and signature are computed HERE and returned, so a replay can reuse the
   * exact bytes and the exact headers. Re-signing with a fresh timestamp would be a
   * DIFFERENT delivery, and would prove something else entirely.
   */
  function delivery(opts: {
    paymentId: string
    amountInr?: number
    type?: string
    planChange?: { changeId: string; credits: number }
  }): Delivery {
    const amount = opts.amountInr ?? PLAN_CATALOG[PLAN].priceInr
    const body = {
      type: opts.type ?? 'PAYMENT_SUCCESS_WEBHOOK',
      event_time: '2026-07-15T10:00:00+05:30',
      data: {
        order: {
          order_id: `sah_${opts.paymentId}`,
          order_amount: amount,
          order_currency: 'INR',
          order_tags: {
            workspace_id: ws,
            plan_id: PLAN,
            period: PERIOD,
            ...(opts.planChange
              ? {
                  change_id: opts.planChange.changeId,
                  change_credits: String(opts.planChange.credits),
                  change_amount_inr: String(amount),
                }
              : {}),
          },
        },
        payment: {
          cf_payment_id: opts.paymentId,
          payment_status: 'SUCCESS',
          payment_amount: amount,
        },
      },
    }

    const rawBody = JSON.stringify(body)
    // Milliseconds. The window is ±5 minutes and `now` is the real clock here, so a
    // fixed literal would make this suite start failing five minutes after it was written.
    const timestamp = String(Date.now())
    return { rawBody, timestamp, signature: sign(rawBody, timestamp) }
  }

  const post = (d: Delivery): Request =>
    new Request('https://app.sahoda.test/api/webhooks/cashfree', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-webhook-signature': d.signature,
        'x-webhook-timestamp': d.timestamp,
      },
      body: d.rawBody,
    })

  /** Ledger entries for the workspace, read over the OTHER connection. */
  async function entries(): Promise<
    Array<{ entry_type: string; amount: number; idempotency_key: string; actor: string }>
  > {
    const r = await reader.pool.query<{
      entry_type: string
      amount: number
      idempotency_key: string
      actor: string
    }>(
      `select entry_type, amount, idempotency_key, actor
         from credit_ledger where workspace_id = $1 order by created_at`,
      [ws],
    )
    return r.rows
  }

  /**
   * The materialized balance, read over the OTHER connection with a plain SELECT.
   *
   * Deliberately NOT `ledger.balance()` and deliberately not the same pool: the grant was
   * written by the `app.apply_ledger_entry` RPC, so reading the projection it maintains,
   * from a different connection, is a genuinely independent surface. Reading back through
   * the thing that did the writing proves only that it remembers its own argument.
   */
  async function balanceRow(): Promise<{ total: number; held: number } | null> {
    const r = await reader.pool.query<{ balance_total: number; balance_held: number }>(
      `select balance_total, balance_held from credit_balances where workspace_id = $1`,
      [ws],
    )
    const row = r.rows[0]
    return row ? { total: Number(row.balance_total), held: Number(row.balance_held) } : null
  }

  async function auditRows(): Promise<Array<{ event_id: string; status: string }>> {
    const r = await reader.pool.query<{ event_id: string; status: string }>(
      `select event_id, status from billing_webhook_events
        where provider = 'cashfree' and payload::text like $1`,
      [`%${ws}%`],
    )
    return r.rows
  }

  it('grants the plan allotment once, and the balance reads back from a surface that did not write it', async () => {
    const res = await handle(post(delivery({ paymentId: `pay_${randomUUID()}` })))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, status: 'processed' })

    const rows = await entries()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.entry_type).toBe('GRANT')
    expect(rows[0]!.amount).toBe(PLAN_CATALOG[PLAN].monthlyCredits)
    expect(rows[0]!.actor).toBe('provider:cashfree')

    // The independent read.
    await expect(balanceRow()).resolves.toEqual({
      total: PLAN_CATALOG[PLAN].monthlyCredits,
      held: 0,
    })
  })

  it('is idempotent to the byte: the SAME delivery twice changes nothing the second time', async () => {
    const d = delivery({ paymentId: `pay_${randomUUID()}` })

    const first = await handle(post(d))
    expect(first.status).toBe(200)
    await expect(first.json()).resolves.toEqual({ ok: true, status: 'processed' })

    const afterFirst = await balanceRow()
    const entriesAfterFirst = await entries()

    // A REPLAY, not a re-signature: the same body, the same timestamp, the same signature.
    // Re-signing with a fresh timestamp would test a second delivery instead. And the
    // replay must land inside the ±5 minute window — outside it the handler answers 401
    // and "nothing changed" would be true for the wrong reason entirely.
    const second = await handle(post(d))
    expect(second.status).toBe(200)
    await expect(second.json()).resolves.toEqual({ ok: true, status: 'duplicate' })

    expect(await entries()).toEqual(entriesAfterFirst)
    expect(await balanceRow()).toEqual(afterFirst)
    // One event, one audit row — the provider-level dedup, not just the ledger's.
    expect(await auditRows()).toHaveLength(1)
  })

  it('a genuinely different payment for the same plan+period is caught by the ledger, not the audit table', async () => {
    await handle(post(delivery({ paymentId: `pay_${randomUUID()}` })))
    const afterFirst = await balanceRow()

    // A new cf_payment_id → a new event id → a NEW audit row. The second layer of
    // idempotency (monthlyGrantKey) is what stops the credits doubling.
    const second = await handle(post(delivery({ paymentId: `pay_${randomUUID()}` })))
    expect(second.status).toBe(200)
    await expect(second.json()).resolves.toEqual({ ok: true, status: 'processed' })

    expect(await auditRows()).toHaveLength(2)
    expect(await entries()).toHaveLength(1)
    expect(await balanceRow()).toEqual(afterFirst)
  })

  it('keys an upgrade on its change id, so a second change in the same month still grants', async () => {
    // A full month first, so the monthly key for (starter, 2026-07) is already taken.
    await handle(post(delivery({ paymentId: `pay_${randomUUID()}` })))

    const changeId = `chg_${randomUUID()}`
    const res = await handle(
      post(
        delivery({
          paymentId: `pay_${randomUUID()}`,
          amountInr: 200,
          planChange: { changeId, credits: 400 },
        }),
      ),
    )
    expect(res.status).toBe(200)

    const rows = await entries()
    expect(rows).toHaveLength(2)
    expect(rows[1]!.amount).toBe(400)
    // The key names the CHANGE. On monthlyGrantKey this would have replayed and granted
    // nothing for a real payment.
    expect(rows[1]!.idempotency_key).toContain(changeId)

    await expect(balanceRow()).resolves.toEqual({
      total: PLAN_CATALOG[PLAN].monthlyCredits + 400,
      held: 0,
    })
  })

  it('writes no ledger row for a failed payment, and does not block the later success', async () => {
    const failed = await handle(
      post(delivery({ paymentId: `pay_${randomUUID()}`, type: 'PAYMENT_FAILED_WEBHOOK' })),
    )
    expect(failed.status).toBe(200)
    await expect(failed.json()).resolves.toEqual({ ok: true, status: 'ignored' })
    expect(await entries()).toHaveLength(0)
    expect(await balanceRow()).toBeNull()

    const paid = await handle(post(delivery({ paymentId: `pay_${randomUUID()}` })))
    expect(paid.status).toBe(200)
    expect(await entries()).toHaveLength(1)
  })

  it('a forged signature reaches no row at all', async () => {
    const d = delivery({ paymentId: `pay_${randomUUID()}` })
    const forged = {
      ...d,
      signature: createHmac('sha256', 'not-the-secret')
        .update(d.timestamp + d.rawBody)
        .digest('base64'),
    }

    const res = await handle(post(forged))

    expect(res.status).toBe(401)
    expect(await entries()).toHaveLength(0)
    expect(await auditRows()).toHaveLength(0)
    expect(await balanceRow()).toBeNull()
  })
})
