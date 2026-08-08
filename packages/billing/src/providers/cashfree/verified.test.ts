import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifyCashfreeWebhook,
  parseVerifiedCashfreeWebhook,
  type LiveVerifiedBody,
} from './verified'

const SECRET = 'cf-sandbox-secret'
/** The fixture double's secret — a source literal in a PUBLIC repo (fixture.ts:14). */
const FIXTURE_SECRET = 'fixture-webhook-secret'

const NOW = new Date('2026-08-08T12:00:00.000Z')
const TS = String(NOW.getTime())

function body(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'PAYMENT_SUCCESS_WEBHOOK',
    data: {
      order: {
        order_id: 'ord_1',
        order_amount: 1499,
        order_currency: 'INR',
        order_tags: { workspace_id: 'ws-1', plan_id: 'growth', period: '2026-08' },
      },
      payment: { cf_payment_id: 'pay_1', payment_amount: 1499, payment_status: 'SUCCESS' },
    },
    ...overrides,
  })
}

const sign = (raw: string, secret: string, ts = TS): string =>
  createHmac('sha256', secret)
    .update(ts + raw)
    .digest('base64')

describe('verifyCashfreeWebhook — the only way to mint a LiveVerifiedBody', () => {
  it('returns a verified body for a correctly signed payload', () => {
    const raw = body()
    const v = verifyCashfreeWebhook({
      rawBody: raw,
      signature: sign(raw, SECRET),
      timestamp: TS,
      secretKey: SECRET,
      now: NOW,
    })
    expect(v).not.toBeNull()
    expect(String(v)).toBe(raw)
  })

  /**
   * THE FORGERY PATH THIS MODULE EXISTS TO CLOSE.
   *
   * fixture.ts:14 hardcodes `fixture-webhook-secret`, and this repository is public.
   * Anyone can sign `{workspace_id, plan_id, period}` with it. If a public webhook
   * endpoint ever honoured a fixture signature, that is free credits on demand.
   */
  it('REJECTS a payload signed with the fixture secret', () => {
    const raw = body()
    expect(
      verifyCashfreeWebhook({
        rawBody: raw,
        signature: sign(raw, FIXTURE_SECRET),
        timestamp: TS,
        secretKey: SECRET,
        now: NOW,
      }),
    ).toBeNull()
  })

  it('REJECTS the fixture’s own algorithm (hex HMAC over the body alone, no timestamp)', () => {
    const raw = body()
    const fixtureStyle = createHmac('sha256', FIXTURE_SECRET).update(raw).digest('hex')
    expect(
      verifyCashfreeWebhook({
        rawBody: raw,
        signature: fixtureStyle,
        timestamp: TS,
        secretKey: SECRET,
        now: NOW,
      }),
    ).toBeNull()
  })

  it('REJECTS an unsigned payload', () => {
    const raw = body()
    for (const signature of ['', '   ', 'null', 'undefined']) {
      expect(
        verifyCashfreeWebhook({
          rawBody: raw,
          signature,
          timestamp: TS,
          secretKey: SECRET,
          now: NOW,
        }),
      ).toBeNull()
    }
  })

  it('REJECTS a missing timestamp rather than signing the body alone', () => {
    const raw = body()
    expect(
      verifyCashfreeWebhook({
        rawBody: raw,
        signature: sign(raw, SECRET),
        timestamp: undefined,
        secretKey: SECRET,
        now: NOW,
      }),
    ).toBeNull()
  })

  it('REJECTS a tampered body — the amount cannot be edited after signing', () => {
    const raw = body()
    const signature = sign(raw, SECRET)
    const tampered = raw.replace('"order_amount":1499', '"order_amount":1')
    expect(
      verifyCashfreeWebhook({
        rawBody: tampered,
        signature,
        timestamp: TS,
        secretKey: SECRET,
        now: NOW,
      }),
    ).toBeNull()
  })

  it('REJECTS an empty secret rather than verifying against ""', () => {
    const raw = body()
    expect(
      verifyCashfreeWebhook({
        rawBody: raw,
        signature: sign(raw, ''),
        timestamp: TS,
        secretKey: '',
        now: NOW,
      }),
    ).toBeNull()
  })
})

describe('parse cannot run before verify — enforced by the type, not by code order', () => {
  it('accepts a LiveVerifiedBody', () => {
    const raw = body()
    const v = verifyCashfreeWebhook({
      rawBody: raw,
      signature: sign(raw, SECRET),
      timestamp: TS,
      secretKey: SECRET,
      now: NOW,
    })
    expect(v).not.toBeNull()
    const event = parseVerifiedCashfreeWebhook(v as LiveVerifiedBody, { mode: 'sandbox' })
    expect(event.eventType).toBe('payment_succeeded')
    expect(event.workspaceId).toBe('ws-1')
    expect(event.planId).toBe('growth')
    expect(event.provider).toBe('cashfree')
  })

  it('will not accept a raw string — verify-before-parse is a compile error', () => {
    // @ts-expect-error a plain string is not a LiveVerifiedBody; only verifyCashfreeWebhook mints one
    expect(() => parseVerifiedCashfreeWebhook(body(), { mode: 'sandbox' })).toBeTypeOf('function')
  })
})
