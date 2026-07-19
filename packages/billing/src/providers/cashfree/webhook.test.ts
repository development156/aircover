import { describe, expect, it } from 'vitest'
import { PLAN_CATALOG } from '@sahoda/shared'
import { CashfreeTagsMissingError, parseCashfreeWebhook, tagsToEventFields } from './webhook'

const TAGS = { workspace_id: 'ws-1', plan_id: 'starter', period: '2026-07' }

/**
 * Shaped on the verbatim PAYMENT_SUCCESS_WEBHOOK example from the official 2025-01-01 docs
 * (trimmed to the fields billing reads, plus the order_tags we set at create-order).
 */
interface BodyOverrides {
  type?: string
  /** Replaces the whole `data.order` subtree. */
  order?: Record<string, unknown>
  /** Replaces the whole `data.payment` subtree. */
  payment?: Record<string, unknown>
}

const successBody = (over: BodyOverrides = {}): string =>
  JSON.stringify({
    data: {
      order: over.order ?? {
        order_id: 'sah_ws-1_2026-07',
        order_amount: PLAN_CATALOG.starter.priceInr,
        order_currency: 'INR',
        order_tags: TAGS,
      },
      payment: over.payment ?? {
        cf_payment_id: '1453002795',
        payment_status: 'SUCCESS',
        payment_amount: PLAN_CATALOG.starter.priceInr,
        payment_currency: 'INR',
      },
      customer_details: { customer_id: 'ws-1', customer_phone: '9908734801' },
    },
    event_time: '2026-07-19T11:16:10+05:30',
    type: over.type ?? 'PAYMENT_SUCCESS_WEBHOOK',
  })

describe('parseCashfreeWebhook — event mapping', () => {
  it('maps a success webhook to a normalized payment_succeeded event', () => {
    const event = parseCashfreeWebhook(successBody())

    expect(event).toMatchObject({
      provider: 'cashfree',
      eventType: 'payment_succeeded',
      workspaceId: 'ws-1',
      planId: 'starter',
      period: '2026-07',
      mode: 'sandbox',
    })
  })

  /**
   * Cashfree sends no per-delivery event id, and its retry policy (2/10/30 min, up to 10)
   * redelivers the identical payload. cf_payment_id is stable across those retries, so
   * `${type}:${cf_payment_id}` is the billing_webhook_events (provider, event_id) key that
   * makes redelivery a no-op rather than a second grant.
   */
  it('derives a replay-stable eventId from type and cf_payment_id', () => {
    expect(parseCashfreeWebhook(successBody()).eventId).toBe('PAYMENT_SUCCESS_WEBHOOK:1453002795')
  })

  it('gives success and failure of the same payment distinct event ids', () => {
    const failed = successBody({
      type: 'PAYMENT_FAILED_WEBHOOK',
      payment: { cf_payment_id: '1453002795', payment_status: 'FAILED' },
    })

    expect(parseCashfreeWebhook(successBody()).eventId).not.toBe(
      parseCashfreeWebhook(failed).eventId,
    )
  })

  it.each([
    ['PAYMENT_FAILED_WEBHOOK', 'payment_failed'],
    ['PAYMENT_USER_DROPPED_WEBHOOK', 'payment_failed'],
  ])('maps %s to %s', (type, expected) => {
    const body = successBody({
      type,
      payment: { cf_payment_id: '99', payment_status: 'FAILED' },
    })

    expect(parseCashfreeWebhook(body).eventType).toBe(expected)
  })

  it('maps an unrecognised type to unknown rather than throwing', () => {
    const body = successBody({
      type: 'SOME_FUTURE_WEBHOOK',
      payment: { cf_payment_id: '99', payment_status: 'SUCCESS' },
    })

    expect(parseCashfreeWebhook(body).eventType).toBe('unknown')
  })

  it('labels mode from the configured environment', () => {
    expect(parseCashfreeWebhook(successBody(), { mode: 'live' }).mode).toBe('live')
  })

  it('retains the parsed payload as raw for the audit row', () => {
    const event = parseCashfreeWebhook(successBody())

    expect((event.raw as { type: string }).type).toBe('PAYMENT_SUCCESS_WEBHOOK')
  })
})

describe('parseCashfreeWebhook — order_tags are load-bearing', () => {
  /**
   * A Cashfree webhook carries no workspace/plan/period of its own; they survive only as the
   * order_tags we set at create-order. Their absence is a hard failure: fabricating a grant
   * target would credit the wrong workspace. The dedicated error type lets the async resolver
   * recover via GET /orders/{id}, which IS documented to return tags.
   */
  it('throws CashfreeTagsMissingError when order_tags is null', () => {
    const body = successBody({
      order: { order_id: 'o1', order_amount: 499, order_tags: null },
    })

    expect(() => parseCashfreeWebhook(body)).toThrow(CashfreeTagsMissingError)
  })

  it('throws CashfreeTagsMissingError when order_tags is absent entirely', () => {
    const body = successBody({ order: { order_id: 'o1', order_amount: 499 } })

    expect(() => parseCashfreeWebhook(body)).toThrow(CashfreeTagsMissingError)
  })

  it('exposes the order id on the error so the fallback can fetch it', () => {
    const body = successBody({
      order: { order_id: 'o-abc', order_amount: 499, order_tags: null },
    })

    try {
      parseCashfreeWebhook(body)
      throw new Error('expected a throw')
    } catch (e) {
      expect(e).toBeInstanceOf(CashfreeTagsMissingError)
      expect((e as CashfreeTagsMissingError).orderId).toBe('o-abc')
    }
  })

  it('throws on incomplete tags rather than defaulting a missing one', () => {
    const body = successBody({
      order: { order_id: 'o1', order_amount: 499, order_tags: { workspace_id: 'ws-1' } },
    })

    expect(() => parseCashfreeWebhook(body)).toThrow()
  })

  it('rejects a tag period that breaks the format contract', () => {
    const body = successBody({
      order: {
        order_id: 'o1',
        order_amount: PLAN_CATALOG.starter.priceInr,
        order_tags: { ...TAGS, period: '2026-7' },
      },
    })

    expect(() => parseCashfreeWebhook(body)).toThrow()
  })

  it('rejects an unknown plan id in the tags', () => {
    const body = successBody({
      order: {
        order_id: 'o1',
        order_amount: 499,
        order_tags: { ...TAGS, plan_id: 'enterprise' },
      },
    })

    expect(() => parseCashfreeWebhook(body)).toThrow()
  })
})

describe('parseCashfreeWebhook — amount reconciliation', () => {
  /**
   * Defence in depth behind the signature: the granted credits are derived from plan_id, so a
   * tag/amount mismatch would hand out an agency grant for a starter payment.
   */
  it('rejects an order_amount that does not match the tagged plan price', () => {
    const body = successBody({
      order: { order_id: 'o1', order_amount: 1, order_currency: 'INR', order_tags: TAGS },
    })

    expect(() => parseCashfreeWebhook(body)).toThrow(/amount/i)
  })

  /**
   * order_amount and payment_amount legitimately differ when an offer applies (the official
   * example shows order 2 / payment 1). The check must use order_amount — the amount WE set —
   * or a discounted payment would be rejected as fraudulent.
   */
  it('accepts a payment_amount below order_amount (an offer was applied)', () => {
    const body = successBody({
      order: {
        order_id: 'o1',
        order_amount: PLAN_CATALOG.starter.priceInr,
        order_tags: TAGS,
      },
      payment: { cf_payment_id: '1', payment_status: 'SUCCESS', payment_amount: 1 },
    })

    expect(() => parseCashfreeWebhook(body)).not.toThrow()
  })

  it('does not enforce the amount on a failed payment', () => {
    const body = successBody({
      type: 'PAYMENT_FAILED_WEBHOOK',
      order: { order_id: 'o1', order_amount: 1, order_tags: TAGS },
      payment: { cf_payment_id: '1', payment_status: 'FAILED' },
    })

    expect(() => parseCashfreeWebhook(body)).not.toThrow()
  })

  it('rejects a non-INR order currency', () => {
    const body = successBody({
      order: {
        order_id: 'o1',
        order_amount: PLAN_CATALOG.starter.priceInr,
        order_currency: 'USD',
        order_tags: TAGS,
      },
    })

    expect(() => parseCashfreeWebhook(body)).toThrow(/currency/i)
  })
})

describe('parseCashfreeWebhook — malformed input', () => {
  it.each([
    ['not JSON', 'not json at all'],
    ['an empty body', ''],
    ['a JSON array', '[]'],
    ['a body with no type', '{"data":{}}'],
    ['a body with no payment', '{"type":"PAYMENT_SUCCESS_WEBHOOK","data":{"order":{}}}'],
  ])('throws on %s', (_l, body) => {
    expect(() => parseCashfreeWebhook(body)).toThrow()
  })
})

describe('tagsToEventFields', () => {
  it('parses a valid tag set', () => {
    expect(tagsToEventFields(TAGS)).toEqual({
      workspaceId: 'ws-1',
      planId: 'starter',
      period: '2026-07',
    })
  })

  it('throws on a malformed tag set', () => {
    expect(() => tagsToEventFields({ workspace_id: 'ws-1' })).toThrow()
  })
})
