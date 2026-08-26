import { describe, expect, it } from 'vitest'
import {
  monthlyGrantKey,
  planChangeGrantKey,
  PLAN_CATALOG,
  type ApplyLedgerInput,
} from '@sahoda/shared'
import { createApplyPlanGrant } from './applyPlanGrant'
import { parseCashfreeWebhook, tagsToEventFields } from '../providers/cashfree/webhook'
import type { LedgerApplyResult, LedgerPort } from '../ledger/port'
import type { ParsedWebhookEvent } from '../providers/types'

/**
 * The mid-period upgrade, end to end through the parts that touch money.
 *
 * A plan change is the one purchase in this product whose amount is NOT a catalogue price,
 * so three separate things have to agree: what the order charges, what the webhook
 * reconciles against, and what the ledger grants. Each of them has a way of being wrong on
 * its own, and each one is money.
 */

const WS = '00000000-0000-4000-8000-000000000001'

function fakeLedger() {
  const calls: ApplyLedgerInput[] = []
  const applied = new Map<string, LedgerApplyResult>()
  let seq = 0
  const port: LedgerPort = {
    async apply(input) {
      calls.push(input)
      const existing = applied.get(input.idempotencyKey)
      if (existing) return { entry: existing.entry, replayed: true }
      seq += 1
      const result: LedgerApplyResult = {
        entry: { id: `entry-${seq}`, balanceAfter: 1000 + input.amount, amount: input.amount },
        replayed: false,
      }
      applied.set(input.idempotencyKey, result)
      return result
    },
    async balance() {
      return { total: 1000, held: 0 }
    },
    async latestHold() {
      return null
    },
  }
  return { port, calls }
}

const event = (over: Partial<ParsedWebhookEvent> = {}): ParsedWebhookEvent => ({
  provider: 'cashfree',
  eventId: 'PAYMENT_SUCCESS_WEBHOOK:1',
  eventType: 'payment_succeeded',
  workspaceId: WS,
  planId: 'growth',
  period: '2026-08',
  mode: 'sandbox',
  raw: {},
  ...over,
})

describe('the grant for a plan change', () => {
  /**
   * THE MONEY BUG THIS EXISTS TO STOP.
   *
   * `monthlyGrantKey` is (plan, period, workspace) with no change in it. Upgrading to a plan
   * that already granted this month would replay: the ledger returns `replayed: true`, grants
   * nothing, and the route reports success for a payment that produced no credits. Two
   * upgrades in one month is not exotic — it is what a growing customer does.
   */
  it('is keyed on the CHANGE, so a second upgrade in one month is not a replay', async () => {
    const fake = fakeLedger()
    const apply = createApplyPlanGrant(fake.port)

    // A normal monthly purchase of Growth lands first.
    await apply(event())
    expect(fake.calls[0]?.idempotencyKey).toBe(monthlyGrantKey('growth', '2026-08', WS))

    // Then an upgrade to Growth in the same period. Under monthlyGrantKey this would replay
    // and grant nothing.
    const upgrade = await apply(event({ planChange: { changeId: 'chg-1', credits: 1_750 } }))
    expect(upgrade.ok).toBe(true)
    if (!upgrade.ok) return
    expect(upgrade.data.replayed).toBe(false)
    expect(upgrade.data.granted).toBe(1_750)
    expect(fake.calls[1]?.idempotencyKey).toBe(planChangeGrantKey('chg-1'))
    expect(fake.calls[1]?.amount).toBe(1_750)
  })

  it('still replays a REDELIVERY of the same change', async () => {
    const fake = fakeLedger()
    const apply = createApplyPlanGrant(fake.port)
    const e = event({ planChange: { changeId: 'chg-1', credits: 1_750 } })
    await apply(e)
    const again = await apply(e)
    expect(again.ok && again.data.replayed).toBe(true)
    // One entry, not two.
    expect(fake.calls.filter((c) => c.idempotencyKey === planChangeGrantKey('chg-1'))).toHaveLength(
      2,
    )
  })

  it('grants the PRORATED credits, not the plan’s full monthly allotment', async () => {
    const fake = fakeLedger()
    const res = await createApplyPlanGrant(fake.port)(
      event({ planChange: { changeId: 'chg-2', credits: 1_750 } }),
    )
    expect(res.ok && res.data.granted).toBe(1_750)
    expect(PLAN_CATALOG.growth.monthlyCredits).toBe(4_000)
  })

  it('records the change id on the entry, so a ledger row explains itself', async () => {
    const fake = fakeLedger()
    await createApplyPlanGrant(fake.port)(event({ planChange: { changeId: 'chg-3', credits: 10 } }))
    expect(fake.calls[0]?.meta).toMatchObject({ planChangeId: 'chg-3' })
  })

  /**
   * An upgrade in the last minutes of a period prorates to nothing. `apply_ledger_entry`
   * rejects a zero amount outright, so this must never reach it.
   */
  it('writes no entry at all when the prorated credits round to zero', async () => {
    const fake = fakeLedger()
    const res = await createApplyPlanGrant(fake.port)(
      event({ planChange: { changeId: 'chg-4', credits: 0 } }),
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.granted).toBe(0)
    // NOT zero. The balance is not zero — we simply did not touch it, and a zero here would
    // be a figure no query can produce.
    expect(res.data.balanceAfter).toBeNull()
    expect(fake.calls).toEqual([])
  })
})

describe('the order tags a plan change travels in', () => {
  const body = (tags: Record<string, string>, amount: number) =>
    JSON.stringify({
      type: 'PAYMENT_SUCCESS_WEBHOOK',
      data: {
        order: {
          order_id: 'sah_1',
          order_amount: amount,
          order_currency: 'INR',
          order_tags: tags,
        },
        payment: { cf_payment_id: 99, payment_status: 'SUCCESS' },
      },
    })

  const BASE = { workspace_id: WS, plan_id: 'growth', period: '2026-08' }
  const CHANGE = { change_id: 'chg-1', change_credits: '1750', change_amount_inr: '500' }

  it('reads the three plan-change tags back off the wire as numbers', () => {
    // Cashfree types order_tags as map[string]string, so they leave as strings and must
    // arrive as numbers or the reconciliation below compares '500' to 500.
    const fields = tagsToEventFields({ ...BASE, ...CHANGE })
    expect(fields.planChange).toEqual({ changeId: 'chg-1', credits: 1750, amountInr: 500 })
  })

  it('refuses a PARTIAL set rather than falling back to a full month', () => {
    // A partial set means the order was written by a version of this code that disagrees
    // with this one. Guessing the missing field is how a grant gets the wrong amount.
    expect(() => tagsToEventFields({ ...BASE, change_id: 'chg-1' })).toThrow(/partial plan change/)
    expect(() =>
      tagsToEventFields({ ...BASE, change_id: 'chg-1', change_credits: '1750' }),
    ).toThrow(/partial plan change/)
  })

  it('leaves an ordinary purchase untouched', () => {
    const fields = tagsToEventFields(BASE)
    expect(fields.planChange).toBeUndefined()
  })

  it('reconciles against the TAGGED amount, because a prorated order is not the plan price', () => {
    const parsed = parseCashfreeWebhook(body({ ...BASE, ...CHANGE }, 500), { mode: 'sandbox' })
    expect(parsed.planChange).toEqual({ changeId: 'chg-1', credits: 1750 })
    // The catalogue price would have rejected this order outright.
    expect(PLAN_CATALOG.growth.priceInr).toBe(3999)
  })

  it('REFUSES an order whose amount disagrees with its own plan-change tag', () => {
    expect(() =>
      parseCashfreeWebhook(body({ ...BASE, ...CHANGE }, 1), { mode: 'sandbox' }),
    ).toThrow(/does not match the tagged plan-change amount/)
  })

  /**
   * The bound that survives a bug of ours. Nobody outside can author order_tags — they are
   * echoed back inside a signature-verified body — but "an attacker cannot set this" and "our
   * own proration cannot compute this wrongly" are different claims, and only the first is true.
   */
  it('REFUSES a change granting more than the plan’s own monthly allotment', () => {
    const greedy = { ...CHANGE, change_credits: String(PLAN_CATALOG.growth.monthlyCredits + 1) }
    expect(() =>
      parseCashfreeWebhook(body({ ...BASE, ...greedy }, 500), { mode: 'sandbox' }),
    ).toThrow(/above the growth monthly allotment/)
  })

  it('still holds an ORDINARY order to the catalogue price', () => {
    // The existing guard must not have been weakened by adding the plan-change branch.
    expect(() => parseCashfreeWebhook(body(BASE, 1), { mode: 'sandbox' })).toThrow(
      /does not match the growth plan amount/,
    )
    const fine = parseCashfreeWebhook(body(BASE, 3999), { mode: 'sandbox' })
    expect(fine.eventType).toBe('payment_succeeded')
  })
})
