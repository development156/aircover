import { describe, it, expect, beforeEach } from 'vitest'
import { createHmac } from 'node:crypto'
import { PLAN_CATALOG, monthlyGrantKey } from '@sahoda/shared'
import {
  createApplyPlanGrant,
  createPgLedgerPort,
  createPgWebhookEventStore,
  createProcessPaymentEvent,
} from '@sahoda/billing/server-webhook'

import { createCashfreeWebhookHandler } from '@/lib/billing/cashfree-webhook'

/**
 * THE ACCEPT HALF, PROVEN BY OUTCOME AT THE ROUTE BOUNDARY.
 *
 * Every assertion here is about `app.apply_ledger_entry` — which rows the database was asked
 * to write — and NOT about response codes. That distinction is the whole point of the file.
 * A webhook endpoint that answers 401 to a forgery while still having written a GRANT is a
 * catastrophe that a status-code test reports as a pass, and a webhook that answers 200 to a
 * real payment without granting anything is the same catastrophe wearing the opposite mask.
 * Only the ledger knows which happened.
 *
 * So this wires the REAL billing internals — `createPgLedgerPort`, `createPgWebhookEventStore`,
 * `createApplyPlanGrant`, `createProcessPaymentEvent` — over a fake `pg` Pool that records
 * every statement. Nothing about the path from signature to SQL is stubbed; the only thing
 * replaced is the socket. The negative cases assert ZERO queries of any kind, not merely zero
 * grants: the audit-row INSERT in `pgStore.claim` runs BEFORE the grant, so it is the
 * statement that would appear first if verify-before-any-work were ever reordered.
 */

const SECRET = 'cf-test-secret'
/** fixture.ts:14 — a source literal in a PUBLIC repository. */
const FIXTURE_SECRET = 'fixture-webhook-secret'

const NOW = new Date('2026-08-08T12:00:00.000Z')
const TS = String(NOW.getTime())

const WORKSPACE_ID = '3f1c8a52-1d3e-4b7a-9c0f-2a5e7d9b4c11'
const PLAN = 'starter' as const
const PERIOD = '2026-08'
const CF_PAYMENT_ID = 'pay_77421'

/** A Cashfree PAYMENT_SUCCESS_WEBHOOK. Amount is read from the catalog, never hardcoded — */
/** `assertOrderMatchesPlan` rejects a success whose order_amount disagrees with the plan. */
function successBody(): string {
  return JSON.stringify({
    type: 'PAYMENT_SUCCESS_WEBHOOK',
    event_time: '2026-08-08T12:00:00+05:30',
    data: {
      order: {
        order_id: 'sah_ord_1',
        order_amount: PLAN_CATALOG[PLAN].priceInr,
        order_currency: 'INR',
        order_tags: { workspace_id: WORKSPACE_ID, plan_id: PLAN, period: PERIOD },
      },
      payment: {
        cf_payment_id: CF_PAYMENT_ID,
        payment_status: 'SUCCESS',
        payment_amount: PLAN_CATALOG[PLAN].priceInr,
      },
    },
  })
}

/** Cashfree: Base64(HMAC_SHA256(timestamp + rawBody, merchantSecretKey)). */
const signCashfree = (raw: string, secret: string, ts = TS): string =>
  createHmac('sha256', secret)
    .update(ts + raw)
    .digest('base64')

/** The fixture double's ENTIRELY DIFFERENT algorithm: hex digest of the body alone. */
const signFixture = (raw: string): string =>
  createHmac('sha256', FIXTURE_SECRET).update(raw).digest('hex')

interface RecordedQuery {
  text: string
  values: unknown[]
}

/**
 * The `pg.Pool` type, borrowed through billing's own signature rather than imported from
 * 'pg'. apps/web has no `@types/pg` — it never talks to Postgres directly — and adding the
 * dependency just to name a type in a test would be the tail wagging the dog.
 */
type PoolLike = NonNullable<Parameters<typeof createPgLedgerPort>[0]['pool']>

/**
 * A `pg` Pool that records statements instead of dialing a socket.
 *
 * `on` is required because `guardPoolErrors` attaches an idle-client error listener the
 * moment the port is built — a bare object without it throws before any test runs.
 */
function recordingPool(): { pool: PoolLike; queries: RecordedQuery[] } {
  const queries: RecordedQuery[] = []

  const query = async (text: string, values: unknown[] = []): Promise<{ rows: unknown[] }> => {
    queries.push({ text, values })

    if (text.includes('insert into billing_webhook_events')) {
      return { rows: [{ id: 'wh_row_1' }] }
    }
    if (text.includes('apply_ledger_entry')) {
      return {
        rows: [
          {
            res: {
              entry: { id: 'ledger_entry_1', balance_after: PLAN_CATALOG[PLAN].monthlyCredits },
              replayed: false,
            },
          },
        ],
      }
    }
    // The status UPDATEs return nothing anyone reads.
    return { rows: [] }
  }

  return { pool: { query, on: () => {}, end: async () => {} } as unknown as PoolLike, queries }
}

function handlerOver(pool: PoolLike): (request: Request) => Promise<Response> {
  const ledger = createPgLedgerPort({ connectionString: 'postgres://unused', pool })
  return createCashfreeWebhookHandler({
    secretKey: SECRET,
    mode: 'sandbox',
    now: () => NOW,
    process: createProcessPaymentEvent({
      store: createPgWebhookEventStore(pool),
      applyPlanGrant: createApplyPlanGrant(ledger),
    }),
  })
}

function post(rawBody: string, headers: Record<string, string>): Request {
  return new Request('https://app.sahoda.test/api/webhooks/cashfree', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: rawBody,
  })
}

const ledgerCalls = (queries: RecordedQuery[]): RecordedQuery[] =>
  queries.filter((q) => q.text.includes('apply_ledger_entry'))

describe('POST /api/webhooks/cashfree — a correctly signed payment', () => {
  let pool: PoolLike
  let queries: RecordedQuery[]

  beforeEach(() => {
    ;({ pool, queries } = recordingPool())
  })

  it('writes exactly one app.apply_ledger_entry GRANT, with the plan catalog amount', async () => {
    const raw = successBody()
    await handlerOver(pool)(
      post(raw, {
        'x-webhook-signature': signCashfree(raw, SECRET),
        'x-webhook-timestamp': TS,
      }),
    )

    const calls = ledgerCalls(queries)
    expect(calls).toHaveLength(1)

    // Positional order is the RPC's own: (workspace, entryType, amount, key, actionType,
    // objectRef, modelTier, cogs, settlesEntryId, holdTtlSeconds, actor, meta).
    const [workspaceId, entryType, amount, idempotencyKey] = calls[0]!.values
    expect(workspaceId).toBe(WORKSPACE_ID)
    expect(entryType).toBe('GRANT')
    expect(amount).toBe(PLAN_CATALOG[PLAN].monthlyCredits)
    expect(idempotencyKey).toBe(monthlyGrantKey(PLAN, PERIOD, WORKSPACE_ID))
  })

  it('attributes the entry to the provider and stamps the honest mode on its meta', async () => {
    const raw = successBody()
    await handlerOver(pool)(
      post(raw, {
        'x-webhook-signature': signCashfree(raw, SECRET),
        'x-webhook-timestamp': TS,
      }),
    )

    const values = ledgerCalls(queries)[0]!.values
    expect(values[10]).toBe('provider:cashfree')
    expect(values[11]).toEqual({
      eventId: `PAYMENT_SUCCESS_WEBHOOK:${CF_PAYMENT_ID}`,
      planId: PLAN,
      period: PERIOD,
      mode: 'sandbox',
    })
  })

  it('records the audit row BEFORE the grant, keyed for (provider, event_id) replay dedup', async () => {
    const raw = successBody()
    await handlerOver(pool)(
      post(raw, {
        'x-webhook-signature': signCashfree(raw, SECRET),
        'x-webhook-timestamp': TS,
      }),
    )

    const claimIndex = queries.findIndex((q) =>
      q.text.includes('insert into billing_webhook_events'),
    )
    const grantIndex = queries.findIndex((q) => q.text.includes('apply_ledger_entry'))
    expect(claimIndex).toBeGreaterThanOrEqual(0)
    expect(claimIndex).toBeLessThan(grantIndex)
    expect(queries[claimIndex]!.values.slice(0, 2)).toEqual([
      'cashfree',
      `PAYMENT_SUCCESS_WEBHOOK:${CF_PAYMENT_ID}`,
    ])
  })
})

/**
 * THE REJECT HALF.
 *
 * Each of these asserts `queries` is EMPTY — the endpoint reached no database at all. A
 * rejection that still inserted an audit row would mean parsing and DB work happened before
 * the signature decided anything, which is the ordering bug the branded `LiveVerifiedBody`
 * exists to make unrepresentable. This is the runtime witness for that type-level guarantee.
 */
describe('POST /api/webhooks/cashfree — anything unverified touches no ledger', () => {
  it('grants nothing for an UNSIGNED payload', async () => {
    const { pool, queries } = recordingPool()
    const raw = successBody()

    await handlerOver(pool)(post(raw, { 'x-webhook-timestamp': TS }))

    expect(ledgerCalls(queries)).toEqual([])
    expect(queries).toEqual([])
  })

  it('grants nothing for a payload signed with the WRONG SECRET', async () => {
    const { pool, queries } = recordingPool()
    const raw = successBody()

    await handlerOver(pool)(
      post(raw, {
        'x-webhook-signature': signCashfree(raw, 'not-the-merchant-secret'),
        'x-webhook-timestamp': TS,
      }),
    )

    expect(ledgerCalls(queries)).toEqual([])
    expect(queries).toEqual([])
  })

  /**
   * The credit-forgery path this endpoint exists to close. `fixture-webhook-secret` is a
   * source literal in a public repo, so anyone can produce this signature. Honouring it would
   * be a month of credits on demand — sign {workspace_id, plan_id, period} and collect.
   *
   * Both halves of the fixture's scheme are rejected here: its SECRET, and its ALGORITHM
   * (hex digest over the body alone, no timestamp).
   */
  it('grants nothing for a FIXTURE-SIGNED payload', async () => {
    const { pool, queries } = recordingPool()
    const raw = successBody()

    await handlerOver(pool)(post(raw, { 'x-webhook-signature': signFixture(raw) }))

    expect(ledgerCalls(queries)).toEqual([])
    expect(queries).toEqual([])
  })

  it('grants nothing when the fixture secret is fed through the CASHFREE algorithm either', async () => {
    const { pool, queries } = recordingPool()
    const raw = successBody()

    await handlerOver(pool)(
      post(raw, {
        'x-webhook-signature': signCashfree(raw, FIXTURE_SECRET),
        'x-webhook-timestamp': TS,
      }),
    )

    expect(queries).toEqual([])
  })

  /**
   * Cashfree does not replay-protect its webhooks — a captured signature stays valid forever
   * — so the timestamp window is the only thing between an intercepted delivery and a replay.
   */
  it('grants nothing for a correctly signed but STALE payload', async () => {
    const { pool, queries } = recordingPool()
    const raw = successBody()
    const stale = String(NOW.getTime() - 6 * 60_000)

    await handlerOver(pool)(
      post(raw, {
        'x-webhook-signature': signCashfree(raw, SECRET, stale),
        'x-webhook-timestamp': stale,
      }),
    )

    expect(queries).toEqual([])
  })

  /**
   * The body is signed over its EXACT bytes, so an attacker who edits the tags to point the
   * grant at their own workspace invalidates the signature they copied.
   */
  it('grants nothing when the workspace in a captured payload is swapped', async () => {
    const { pool, queries } = recordingPool()
    const raw = successBody()
    const signature = signCashfree(raw, SECRET)
    const tampered = raw.replace(WORKSPACE_ID, '00000000-0000-4000-8000-000000000000')

    await handlerOver(pool)(
      post(tampered, { 'x-webhook-signature': signature, 'x-webhook-timestamp': TS }),
    )

    expect(queries).toEqual([])
  })

  /**
   * An unset secret must never verify. HMAC-ing against "" is a real check against a key the
   * whole world also has.
   */
  it('grants nothing — and answers 503, not 401 — when no secret is configured', async () => {
    const { pool, queries } = recordingPool()
    const raw = successBody()
    const ledger = createPgLedgerPort({ connectionString: 'postgres://unused', pool })
    const handler = createCashfreeWebhookHandler({
      secretKey: '',
      mode: 'sandbox',
      now: () => NOW,
      process: createProcessPaymentEvent({
        store: createPgWebhookEventStore(pool),
        applyPlanGrant: createApplyPlanGrant(ledger),
      }),
    })

    const res = await handler(
      post(raw, { 'x-webhook-signature': signCashfree(raw, SECRET), 'x-webhook-timestamp': TS }),
    )

    expect(queries).toEqual([])
    // 503 distinguishes "this endpoint is not provisioned" from "your signature is wrong",
    // so a misconfiguration is not silently indistinguishable from an attack in the logs.
    expect(res.status).toBe(503)
  })
})

/**
 * These are about the ORDER of work, which is the invariant the whole design rests on. They
 * are the one place response codes are asserted, because the redelivery contract is expressed
 * in status codes and getting it wrong either loses a payment or hammers us forever.
 */
describe('POST /api/webhooks/cashfree — delivery contract', () => {
  it('answers 200 once a verified success has granted', async () => {
    const { pool } = recordingPool()
    const raw = successBody()
    const res = await handlerOver(pool)(
      post(raw, { 'x-webhook-signature': signCashfree(raw, SECRET), 'x-webhook-timestamp': TS }),
    )
    expect(res.status).toBe(200)
  })

  it('answers 401 to a forgery without naming which check failed', async () => {
    const { pool } = recordingPool()
    const raw = successBody()
    const res = await handlerOver(pool)(post(raw, { 'x-webhook-signature': signFixture(raw) }))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ ok: false, error: 'invalid_signature' })
  })

  /**
   * A verified failure/drop grants nothing and is NOT an error. It must terminate with a 200:
   * `processPaymentEvent` marks the row processed, and a non-2xx would make Cashfree redeliver
   * an event that will never grant, forever.
   */
  it('answers 200 and grants nothing for a verified FAILED payment', async () => {
    const { pool, queries } = recordingPool()
    const raw = JSON.stringify({
      type: 'PAYMENT_FAILED_WEBHOOK',
      data: {
        order: {
          order_id: 'sah_ord_2',
          order_amount: PLAN_CATALOG[PLAN].priceInr,
          order_currency: 'INR',
          order_tags: { workspace_id: WORKSPACE_ID, plan_id: PLAN, period: PERIOD },
        },
        payment: { cf_payment_id: 'pay_failed', payment_status: 'FAILED' },
      },
    })

    const res = await handlerOver(pool)(
      post(raw, { 'x-webhook-signature': signCashfree(raw, SECRET), 'x-webhook-timestamp': TS }),
    )

    expect(res.status).toBe(200)
    expect(ledgerCalls(queries)).toEqual([])
    // …but it IS audited, unlike a forgery, which reaches no database at all.
    expect(queries.some((q) => q.text.includes('insert into billing_webhook_events'))).toBe(true)
  })

  /**
   * `webhook.ts` documents a tags-missing delivery as RECOVERABLE via GET /pg/orders/{id}.
   * That recovery lives on `resolveWebhookEvent` behind the MAIN barrel, which this route may
   * not import (the fixture rides in on that barrel). So the honest answer is a 502: Cashfree
   * redelivers, which buys time to resolve it, and it is never silently dropped as a 400.
   */
  it('answers 502 — not 400 — when a verified delivery carries no order_tags', async () => {
    const { pool, queries } = recordingPool()
    const raw = JSON.stringify({
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      data: {
        order: { order_id: 'sah_ord_3', order_amount: PLAN_CATALOG[PLAN].priceInr },
        payment: { cf_payment_id: 'pay_notags' },
      },
    })

    const res = await handlerOver(pool)(
      post(raw, { 'x-webhook-signature': signCashfree(raw, SECRET), 'x-webhook-timestamp': TS }),
    )

    expect(res.status).toBe(502)
    expect(queries).toEqual([])
  })

  it('answers 400 to a verified body that is not JSON at all', async () => {
    const { pool, queries } = recordingPool()
    const raw = 'not json'
    const res = await handlerOver(pool)(
      post(raw, { 'x-webhook-signature': signCashfree(raw, SECRET), 'x-webhook-timestamp': TS }),
    )
    expect(res.status).toBe(400)
    expect(queries).toEqual([])
  })

  /**
   * `applyPlanGrant` returning `replayed: true` on a first-seen event id means the ledger
   * already holds a grant for this (plan, period, workspace) — so a genuinely SECOND payment
   * produced no credits. That is real money with nothing to show for it, and the route must
   * surface it for refund/support rather than pass it off as a clean success.
   */
  it('reports a grant that replayed instead of silently returning success', async () => {
    const { pool } = recordingPool()
    const replayingPool = {
      query: async (text: string, values: unknown[] = []) => {
        if (text.includes('insert into billing_webhook_events')) return { rows: [{ id: 'wh_2' }] }
        if (text.includes('apply_ledger_entry')) {
          return {
            rows: [
              {
                res: {
                  entry: { id: 'e1', balance_after: PLAN_CATALOG[PLAN].monthlyCredits },
                  replayed: true,
                },
              },
            ],
          }
        }
        return { rows: [] }
      },
      on: () => {},
      end: async () => {},
    } as unknown as PoolLike
    void pool

    const notes: string[] = []
    const raw = successBody()
    const handler = createCashfreeWebhookHandler({
      secretKey: SECRET,
      mode: 'sandbox',
      now: () => NOW,
      onNotice: (note) => notes.push(note.kind),
      process: createProcessPaymentEvent({
        store: createPgWebhookEventStore(replayingPool),
        applyPlanGrant: createApplyPlanGrant(
          createPgLedgerPort({ connectionString: 'postgres://unused', pool: replayingPool }),
        ),
      }),
    })

    const res = await handler(
      post(raw, { 'x-webhook-signature': signCashfree(raw, SECRET), 'x-webhook-timestamp': TS }),
    )

    expect(res.status).toBe(200)
    expect(notes).toContain('grant_replayed')
  })
})
