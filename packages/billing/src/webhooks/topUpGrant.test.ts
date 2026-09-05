import { describe, expect, it, vi } from 'vitest'
import { inrForCredits, topUpGrantKey } from '@sahoda/shared'

import { createApplyPlanGrant } from './applyPlanGrant'
import { parseCashfreeWebhook } from '../providers/cashfree/webhook'
import type { LedgerPort } from '../ledger/port'
import type { ParsedWebhookEvent } from '../providers/types'

/**
 * A BOUGHT PACK OF CREDITS, END TO END FROM THE WEBHOOK.
 *
 * The properties under test are the ones that cost real money if they break:
 * the entry is a TOPUP for exactly what was paid for, it is keyed on the payment
 * so two identical purchases both land, and an order whose amount disagrees with
 * its tags grants nothing at all.
 */
function port(): { port: LedgerPort; applied: unknown[] } {
  const applied: unknown[] = []
  return {
    applied,
    port: {
      apply: vi.fn(async (input: unknown) => {
        applied.push(input)
        return { entry: { balanceAfter: 4321 }, replayed: false }
      }),
    } as unknown as LedgerPort,
  }
}

const event = (over: Partial<ParsedWebhookEvent> = {}): ParsedWebhookEvent => ({
  provider: 'cashfree',
  eventId: 'PAYMENT_SUCCESS_WEBHOOK:1',
  eventType: 'payment_succeeded',
  workspaceId: '11111111-1111-1111-1111-111111111111',
  planId: 'starter',
  period: '2026-09',
  mode: 'sandbox',
  topUp: { orderId: 'sah_abc', credits: 2000 },
  raw: {},
  ...over,
})

describe('granting a bought pack', () => {
  it('writes a TOPUP for the credits paid for, keyed on the payment', async () => {
    const { port: p, applied } = port()
    const res = await createApplyPlanGrant(p)(event())

    expect(res.ok).toBe(true)
    expect(applied).toHaveLength(1)
    expect(applied[0]).toMatchObject({
      entryType: 'TOPUP',
      amount: 2000,
      idempotencyKey: topUpGrantKey('sah_abc'),
    })
  })

  it('does not grant the plan its monthly credits as well', async () => {
    const { port: p, applied } = port()
    await createApplyPlanGrant(p)(event())
    // starter grants 1500 a month. A pack of 2000 must not become 3500, and must
    // not become 1500 either — the plan is context on this order, not the product.
    expect((applied[0] as { amount: number }).amount).toBe(2000)
  })

  it('gives two identical purchases two different keys', async () => {
    const { port: p, applied } = port()
    const grant = createApplyPlanGrant(p)
    await grant(event({ topUp: { orderId: 'sah_one', credits: 2000 } }))
    await grant(event({ topUp: { orderId: 'sah_two', credits: 2000 } }))
    const keys = applied.map((a) => (a as { idempotencyKey: string }).idempotencyKey)
    expect(new Set(keys).size).toBe(2)
  })
})

/** The order body Cashfree posts, with whatever tags a case needs. */
function body(tags: Record<string, string>, amount: number): string {
  return JSON.stringify({
    type: 'PAYMENT_SUCCESS_WEBHOOK',
    data: {
      order: {
        order_id: 'sah_abc',
        order_amount: amount,
        order_currency: 'INR',
        order_tags: tags,
      },
      payment: { cf_payment_id: 99 },
    },
  })
}

const TAGS = {
  workspace_id: '11111111-1111-1111-1111-111111111111',
  plan_id: 'starter',
  period: '2026-09',
}

describe('reconciling what was actually charged', () => {
  it('accepts an order whose amount is the rate times the credits', () => {
    const parsed = parseCashfreeWebhook(
      body({ ...TAGS, topup_credits: '2000', topup_amount_inr: '500' }, inrForCredits(2000)),
    )
    expect(parsed.topUp).toEqual({ orderId: 'sah_abc', credits: 2000 })
  })

  it('refuses an order that took less than the credits cost', () => {
    expect(() =>
      parseCashfreeWebhook(body({ ...TAGS, topup_credits: '2000', topup_amount_inr: '500' }, 1)),
    ).toThrow(/does not match/)
  })

  it('refuses tags that price the credits at anything but the rate', () => {
    expect(() =>
      parseCashfreeWebhook(body({ ...TAGS, topup_credits: '2000', topup_amount_inr: '1' }, 1)),
    ).toThrow(/the rate says/)
  })

  it('refuses a quantity the product does not sell', () => {
    expect(() =>
      parseCashfreeWebhook(body({ ...TAGS, topup_credits: '3', topup_amount_inr: '1' }, 1)),
    ).toThrow(/unsellable/)
  })

  it('refuses half a top-up, rather than guessing the missing half', () => {
    expect(() => parseCashfreeWebhook(body({ ...TAGS, topup_credits: '2000' }, 500))).toThrow(
      /partial top-up/,
    )
  })

  it('refuses an order tagged as both a plan change and a pack', () => {
    expect(() =>
      parseCashfreeWebhook(
        body(
          {
            ...TAGS,
            topup_credits: '2000',
            topup_amount_inr: '500',
            change_id: 'chg_1',
            change_credits: '100',
            change_amount_inr: '500',
          },
          500,
        ),
      ),
    ).toThrow(/both a plan change and a top-up/)
  })
})
