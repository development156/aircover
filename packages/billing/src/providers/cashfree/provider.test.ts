import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { PLAN_CATALOG } from '@sahoda/shared'
import { routedTransport, type Transport, type TransportRequest } from '../../transport'
import { createCashfreeProvider, isTransient } from './index'
import { CASHFREE_SANDBOX_BASE_URL, type CashfreeEnv } from './env'

const ENV: CashfreeEnv = {
  appId: 'test-app-id',
  secretKey: 'test-secret-key',
  env: 'sandbox',
  baseUrl: CASHFREE_SANDBOX_BASE_URL,
}

const TAGS = { workspace_id: 'ws-1', plan_id: 'starter', period: '2026-07' }

const createOrderOk = {
  match: { method: 'POST', urlIncludes: '/pg/orders' },
  response: {
    status: 200,
    body: {
      cf_order_id: '2149460581',
      order_id: 'sah_fixed-id',
      payment_session_id: 'session_abc123',
      order_status: 'ACTIVE',
      order_amount: PLAN_CATALOG.starter.priceInr,
    },
  },
}

const build = (routes: Parameters<typeof routedTransport>[0], over: Record<string, unknown> = {}) =>
  createCashfreeProvider({
    env: ENV,
    appBaseUrl: 'https://app.sahoda.test',
    transport: routedTransport(routes),
    newId: () => 'fixed-id',
    now: () => new Date(1_700_000_000_000),
    ...over,
  })

/** Capture requests so header/body assertions can inspect exactly what went out. */
const recording = (inner: Transport): { transport: Transport; calls: TransportRequest[] } => {
  const calls: TransportRequest[] = []
  return {
    calls,
    transport: async (req) => {
      calls.push(req)
      return inner(req)
    },
  }
}

const checkoutInput = {
  workspaceId: 'ws-1',
  planId: 'starter' as const,
  period: '2026-07',
  successUrl: 'https://app.sahoda.test/billing/done',
  cancelUrl: 'https://app.sahoda.test/billing',
}

describe('createCashfreeProvider — identity', () => {
  it('identifies as the cashfree rail in sandbox mode', () => {
    const p = build([createOrderOk])

    expect(p.id).toBe('cashfree')
    expect(p.mode).toBe('sandbox')
  })

  it('reports live mode for a live env', () => {
    const p = build([createOrderOk], { env: { ...ENV, env: 'live' } })

    expect(p.mode).toBe('live')
  })
})

describe('createCheckout', () => {
  it('POSTs to the orders endpoint with the pinned api version and auth headers', async () => {
    const rec = recording(routedTransport([createOrderOk]))
    const p = build([createOrderOk], { transport: rec.transport })

    await p.createCheckout(checkoutInput)

    const req = rec.calls[0]!
    expect(req.method).toBe('POST')
    expect(req.url).toBe(`${CASHFREE_SANDBOX_BASE_URL}/orders`)
    expect(req.headers?.['x-api-version']).toBe('2025-01-01')
    expect(req.headers?.['x-client-id']).toBe('test-app-id')
    expect(req.headers?.['x-client-secret']).toBe('test-secret-key')
  })

  it('sends an idempotency key so a lost ack replays instead of colliding with 409', async () => {
    const rec = recording(routedTransport([createOrderOk]))
    const p = build([createOrderOk], { transport: rec.transport })

    await p.createCheckout(checkoutInput)

    expect(rec.calls[0]?.headers?.['x-idempotency-key']).toBe('sah_fixed-id')
  })

  it('prices the order from PLAN_CATALOG, never from the caller', async () => {
    const rec = recording(routedTransport([createOrderOk]))
    const p = build([createOrderOk], { transport: rec.transport })

    await p.createCheckout(checkoutInput)

    const body = JSON.parse(rec.calls[0]!.body!)
    expect(body.order_amount).toBe(PLAN_CATALOG.starter.priceInr)
    expect(body.order_currency).toBe('INR')
  })

  /** The tags are the ONLY carrier of workspace/plan/period into the webhook. */
  it('attaches workspace, plan and period as order_tags', async () => {
    const rec = recording(routedTransport([createOrderOk]))
    const p = build([createOrderOk], { transport: rec.transport })

    await p.createCheckout(checkoutInput)

    expect(JSON.parse(rec.calls[0]!.body!).order_tags).toEqual(TAGS)
  })

  it('returns the session id and an app-owned bridge URL', async () => {
    const p = build([createOrderOk])

    const session = await p.createCheckout(checkoutInput)

    expect(session).toEqual({
      id: 'sah_fixed-id',
      sessionId: 'session_abc123',
      url: 'https://app.sahoda.test/billing/checkout/sah_fixed-id',
      mode: 'sandbox',
    })
  })

  it('does not double a trailing slash on the app base URL', async () => {
    const p = build([createOrderOk], { appBaseUrl: 'https://app.sahoda.test/' })

    expect((await p.createCheckout(checkoutInput)).url).toBe(
      'https://app.sahoda.test/billing/checkout/sah_fixed-id',
    )
  })

  it('rejects a malformed period before spending a network call', async () => {
    const rec = recording(routedTransport([createOrderOk]))
    const p = build([createOrderOk], { transport: rec.transport })

    await expect(p.createCheckout({ ...checkoutInput, period: '2026-7' })).rejects.toThrow()
    expect(rec.calls).toHaveLength(0)
  })

  it('surfaces a 409 duplicate order as a permanent error', async () => {
    const p = build([
      {
        match: { method: 'POST', urlIncludes: '/pg/orders' },
        response: {
          status: 409,
          body: {
            message: 'order with same id is already present',
            code: 'order_already_exists',
            type: 'invalid_request_error',
          },
        },
      },
    ])

    await expect(p.createCheckout(checkoutInput)).rejects.toThrow(/order_already_exists/)
  })

  /**
   * The request carries x-client-secret. An error that echoed the request would put the
   * merchant secret into every log line that records a failed checkout.
   */
  it('never puts the client secret in the thrown error', async () => {
    const p = build([
      {
        match: { method: 'POST', urlIncludes: '/pg/orders' },
        response: { status: 401, body: { message: 'authentication failed', code: 'auth_error' } },
      },
    ])

    await expect(p.createCheckout(checkoutInput)).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining('test-secret-key') as unknown as string,
      }),
    )
  })

  it('truncates a huge provider error body', async () => {
    const p = build([
      {
        match: { method: 'POST', urlIncludes: '/pg/orders' },
        response: { status: 500, body: { message: 'x'.repeat(5000) } },
      },
    ])

    await expect(p.createCheckout(checkoutInput)).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringMatching(/^.{0,400}$/s) as unknown as string,
      }),
    )
  })
})

describe('isTransient — retry classification', () => {
  it.each([408, 429, 500, 502, 503])('treats %d as transient', (s) => {
    expect(isTransient(s)).toBe(true)
  })

  it.each([400, 401, 404, 409, 422])('treats %d as permanent', (s) => {
    expect(isTransient(s)).toBe(false)
  })
})

describe('verifyWebhookSignature via the provider', () => {
  const body = '{"type":"PAYMENT_SUCCESS_WEBHOOK"}'
  const ts = '1700000000000'
  const sig = createHmac('sha256', ENV.secretKey)
    .update(ts + body)
    .digest('base64')

  it('verifies with the timestamp supplied through meta', () => {
    const p = build([createOrderOk])

    expect(p.verifyWebhookSignature(body, sig, { timestamp: ts })).toBe(true)
  })

  it('rejects when meta is omitted entirely', () => {
    const p = build([createOrderOk])

    expect(p.verifyWebhookSignature(body, sig)).toBe(false)
  })
})

const webhookBody = (tags: unknown): string =>
  JSON.stringify({
    data: {
      order: {
        order_id: 'sah_fixed-id',
        order_amount: PLAN_CATALOG.starter.priceInr,
        order_currency: 'INR',
        order_tags: tags,
      },
      payment: { cf_payment_id: '1453002795', payment_status: 'SUCCESS' },
    },
    type: 'PAYMENT_SUCCESS_WEBHOOK',
  })

describe('resolveWebhookEvent — the order_tags fallback', () => {
  const getOrderWithTags = {
    match: { method: 'GET', urlIncludes: '/pg/orders/' },
    response: {
      status: 200,
      body: { order_id: 'sah_fixed-id', order_status: 'PAID', order_tags: TAGS },
    },
  }

  it('parses directly when the webhook carried tags, with no extra call', async () => {
    const rec = recording(routedTransport([getOrderWithTags]))
    const p = build([getOrderWithTags], { transport: rec.transport })

    const event = await p.resolveWebhookEvent(webhookBody(TAGS))

    expect(event.workspaceId).toBe('ws-1')
    expect(rec.calls).toHaveLength(0)
  })

  /**
   * The echo of order_tags into the webhook is confirmed by Cashfree's SDK types but by no
   * published example. GET /orders/{id} returning tags IS documented with examples, so this is
   * the path that keeps the rail working if the echo turns out not to happen.
   */
  it('falls back to GET /orders when the webhook carried no tags', async () => {
    const rec = recording(routedTransport([getOrderWithTags]))
    const p = build([getOrderWithTags], { transport: rec.transport })

    const event = await p.resolveWebhookEvent(webhookBody(null))

    expect(event).toMatchObject({
      provider: 'cashfree',
      eventType: 'payment_succeeded',
      workspaceId: 'ws-1',
      planId: 'starter',
      period: '2026-07',
    })
    expect(rec.calls).toHaveLength(1)
    expect(rec.calls[0]?.url).toContain('/pg/orders/sah_fixed-id')
  })

  it('still enforces the amount check on a fallback-resolved event', async () => {
    const wrongAmount = JSON.stringify({
      data: {
        order: {
          order_id: 'sah_fixed-id',
          order_amount: 1,
          order_currency: 'INR',
          order_tags: null,
        },
        payment: { cf_payment_id: '1', payment_status: 'SUCCESS' },
      },
      type: 'PAYMENT_SUCCESS_WEBHOOK',
    })
    const p = build([getOrderWithTags])

    await expect(p.resolveWebhookEvent(wrongAmount)).rejects.toThrow(/amount/i)
  })

  it('throws when the order itself has no tags either', async () => {
    const p = build([
      {
        match: { method: 'GET', urlIncludes: '/pg/orders/' },
        response: { status: 200, body: { order_id: 'sah_fixed-id', order_tags: null } },
      },
    ])

    await expect(p.resolveWebhookEvent(webhookBody(null))).rejects.toThrow(/no order_tags/)
  })

  /** A genuine parse failure must not be retried as a network call. */
  it('does not fetch for a non-tags parse failure', async () => {
    const rec = recording(routedTransport([getOrderWithTags]))
    const p = build([getOrderWithTags], { transport: rec.transport })

    await expect(p.resolveWebhookEvent('not json')).rejects.toThrow()
    expect(rec.calls).toHaveLength(0)
  })
})

describe('fetchOrder', () => {
  it('returns the order status, tags and the SDK session the bridge page needs', async () => {
    // The bridge page (`/billing/checkout/{orderId}`) re-reads the order on every request and
    // hands `payment_session_id` to the Cashfree JS SDK. Dropping it here is the defect that
    // left the payment step unbuildable: the page had an order and nothing to pay with.
    const p = build([
      {
        match: { method: 'GET', urlIncludes: '/pg/orders/' },
        response: {
          status: 200,
          body: {
            order_id: 'o1',
            order_status: 'ACTIVE',
            order_tags: TAGS,
            payment_session_id: 'session_abc123',
          },
        },
      },
    ])

    expect(await p.fetchOrder('o1')).toEqual({
      orderId: 'o1',
      status: 'ACTIVE',
      tags: TAGS,
      paymentSessionId: 'session_abc123',
    })
  })

  it('reports a null session rather than inventing one when the provider omits it', async () => {
    const p = build([
      {
        match: { method: 'GET', urlIncludes: '/pg/orders/' },
        response: { status: 200, body: { order_id: 'o1', order_status: 'PAID', order_tags: TAGS } },
      },
    ])

    expect(await p.fetchOrder('o1')).toEqual({
      orderId: 'o1',
      status: 'PAID',
      tags: TAGS,
      paymentSessionId: null,
    })
  })

  it('throws a classified error on a 404', async () => {
    const p = build([
      {
        match: { method: 'GET', urlIncludes: '/pg/orders/' },
        response: { status: 404, body: { message: 'order not found', code: 'order_not_found' } },
      },
    ])

    await expect(p.fetchOrder('missing')).rejects.toThrow(/order_not_found/)
  })
})

/**
 * `raw` becomes the billing_webhook_events audit payload. On the fallback path it must record
 * what Cashfree actually delivered, not our tag-injected reconstruction — an audit row that
 * shows tags the provider never sent is a lie about the event.
 */
describe('resolveWebhookEvent — audit payload honesty', () => {
  const getOrderWithTags = {
    match: { method: 'GET', urlIncludes: '/pg/orders/' },
    response: {
      status: 200,
      body: { order_id: 'sah_fixed-id', order_status: 'PAID', order_tags: TAGS },
    },
  }

  it('keeps the delivered body verbatim and annotates the out-of-band resolution', async () => {
    const p = build([getOrderWithTags])
    const delivered = webhookBody(null)

    const event = await p.resolveWebhookEvent(delivered)
    const raw = event.raw as {
      data: { order: { order_tags: unknown } }
      _sahoda?: { orderTagsResolvedVia: string; resolvedTags: unknown }
    }

    // The order as Cashfree sent it — still tagless.
    expect(raw.data.order.order_tags).toBeNull()
    // The resolution recorded explicitly rather than smuggled into the order.
    expect(raw._sahoda?.orderTagsResolvedVia).toContain('GET /orders/sah_fixed-id')
    expect(raw._sahoda?.resolvedTags).toEqual(TAGS)
    // The derived fields are still correct.
    expect(event.workspaceId).toBe('ws-1')
  })

  it('leaves raw unannotated when tags arrived normally', async () => {
    const p = build([getOrderWithTags])

    const event = await p.resolveWebhookEvent(webhookBody(TAGS))

    expect((event.raw as { _sahoda?: unknown })._sahoda).toBeUndefined()
  })
})
