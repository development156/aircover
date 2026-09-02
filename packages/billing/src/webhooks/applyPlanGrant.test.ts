import { describe, it, expect } from 'vitest'
import { monthlyGrantKey, PLAN_CATALOG, type ApplyLedgerInput } from '@sahoda/shared'
import { createApplyPlanGrant, purchaseGrantKey } from './applyPlanGrant'
import type { LedgerApplyResult, LedgerPort } from '../ledger/port'
import type { ParsedWebhookEvent } from '../providers/types'

class RecordingPort implements LedgerPort {
  readonly calls: ApplyLedgerInput[] = []
  async apply(input: ApplyLedgerInput): Promise<LedgerApplyResult> {
    this.calls.push(input)
    return {
      entry: { id: 'e1', balanceAfter: input.amount, amount: input.amount },
      replayed: false,
    }
  }
  async latestHold(): Promise<null> {
    throw new Error('unused')
  }
  async balance(): Promise<never> {
    throw new Error('unused')
  }
}

const paidEvent = (over: Partial<ParsedWebhookEvent> = {}): ParsedWebhookEvent => ({
  provider: 'fixture',
  eventId: 'evt-1',
  eventType: 'payment_succeeded',
  workspaceId: 'ws-1',
  planId: 'starter',
  period: '2026-07',
  mode: 'fixture',
  raw: {},
  ...over,
})

const deps = { newTraceId: () => 'trace-fixed' }

describe('applyPlanGrant', () => {
  it('GRANTs the plan catalog monthly credits, keyed on the month AND the payment', async () => {
    const port = new RecordingPort()
    const applyPlanGrant = createApplyPlanGrant(port, deps)

    const result = await applyPlanGrant(paidEvent())

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.data.granted).toBe(PLAN_CATALOG.starter.monthlyCredits) // 1500
    expect(port.calls).toHaveLength(1)
    const call = port.calls[0]!
    expect(call.entryType).toBe('GRANT')
    expect(call.amount).toBe(1500)
    expect(call.idempotencyKey).toBe(purchaseGrantKey(paidEvent()))
    // The monthly key is the readable prefix; the provider + event id is what names the payment.
    expect(call.idempotencyKey).toBe(
      `${monthlyGrantKey('starter', '2026-07', 'ws-1')}:fixture:evt-1`,
    )
  })

  /**
   * billing-ledger-4. Keyed on the bare month, a customer who bought Starter twice in one
   * month was charged twice and credited once. The key must change when the PAYMENT changes
   * and stay put when the same payment is delivered again.
   */
  it('a second payment for the same plan+period gets a DIFFERENT key; a redelivery gets the SAME one', async () => {
    const port = new RecordingPort()
    const applyPlanGrant = createApplyPlanGrant(port, deps)

    await applyPlanGrant(paidEvent({ eventId: 'PAYMENT_SUCCESS_WEBHOOK:pay_1' }))
    await applyPlanGrant(paidEvent({ eventId: 'PAYMENT_SUCCESS_WEBHOOK:pay_2' }))
    await applyPlanGrant(paidEvent({ eventId: 'PAYMENT_SUCCESS_WEBHOOK:pay_1' }))

    const keys = port.calls.map((c) => c.idempotencyKey)
    expect(keys[0]).not.toBe(keys[1])
    expect(keys[2]).toBe(keys[0])
    expect(keys[1]).toContain('PAYMENT_SUCCESS_WEBHOOK:pay_2')
  })

  it('the same event id under a different provider is a different key', () => {
    const a = purchaseGrantKey(paidEvent({ provider: 'fixture', eventId: 'e' }))
    const b = purchaseGrantKey(paidEvent({ provider: 'cashfree', eventId: 'e' }))
    expect(a).not.toBe(b)
  })

  it('does not source the grant amount from action pricing (uses PLAN_CATALOG)', async () => {
    const port = new RecordingPort()
    const applyPlanGrant = createApplyPlanGrant(port, deps)
    await applyPlanGrant(paidEvent({ planId: 'growth' }))
    expect(port.calls[0]!.amount).toBe(PLAN_CATALOG.growth.monthlyCredits) // 5000
  })

  it('rejects a non-paid event without touching the ledger', async () => {
    const port = new RecordingPort()
    const applyPlanGrant = createApplyPlanGrant(port, deps)

    const result = await applyPlanGrant(paidEvent({ eventType: 'payment_failed' }))

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected err')
    expect(result.error.code).toBe('VALIDATION_ERROR')
    expect(port.calls).toHaveLength(0)
  })

  it('returns an err Result (does not reject) when the GRANT write throws', async () => {
    const port = new RecordingPort()
    port.apply = async () => {
      throw new Error('ledger: connection reset')
    }
    const applyPlanGrant = createApplyPlanGrant(port, deps)

    const result = await applyPlanGrant(paidEvent())

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected err')
    expect(result.error.code).toBe('PROVIDER_ERROR')
    expect(result.error.traceId).toBe('trace-fixed')
  })

  it('propagates the replayed flag from the ledger', async () => {
    const port = new RecordingPort()
    // Force a replayed response.
    port.apply = async (input) => ({
      entry: { id: 'e1', balanceAfter: 1500, amount: input.amount },
      replayed: true,
    })
    const applyPlanGrant = createApplyPlanGrant(port, deps)
    const result = await applyPlanGrant(paidEvent())
    expect(result.ok && result.data.replayed).toBe(true)
  })
})

/**
 * The grant boundary is where the period format contract actually has to hold. Providers
 * validate their own wire shapes, but the grant key is built HERE and the period also bounds
 * the subscription row — so an unpadded or malformed period reaching this point would stamp a
 * wrong period on both. Reject before the ledger is touched.
 */
describe('applyPlanGrant — period format contract', () => {
  it.each([
    ['an unpadded month', '2026-7'],
    ['month 13', '2026-13'],
    ['a full date', '2026-07-01'],
    ['an empty period', ''],
  ])('rejects %s with VALIDATION_ERROR and never touches the ledger', async (_l, period) => {
    const port = new RecordingPort()
    const applyPlanGrant = createApplyPlanGrant(port, deps)

    const result = await applyPlanGrant(paidEvent({ period }))

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected err')
    expect(result.error.code).toBe('VALIDATION_ERROR')
    expect(port.calls).toHaveLength(0)
  })

  it('still accepts a well-formed period', async () => {
    const port = new RecordingPort()
    const applyPlanGrant = createApplyPlanGrant(port, deps)

    const result = await applyPlanGrant(paidEvent({ period: '2026-01' }))

    expect(result.ok).toBe(true)
    expect(port.calls[0]?.idempotencyKey).toBe(
      `${monthlyGrantKey('starter', '2026-01', 'ws-1')}:fixture:evt-1`,
    )
  })

  /**
   * planId indexes PLAN_CATALOG. It is typed PlanId, but the lookup sits outside the try
   * block, so a value that slipped past a provider's parse would throw a raw TypeError out
   * of a function contracted never to reject (PR#1 advisory).
   */
  it('returns a typed error rather than rejecting on an unknown planId', async () => {
    const port = new RecordingPort()
    const applyPlanGrant = createApplyPlanGrant(port, deps)

    const bogus = paidEvent({ planId: 'enterprise' as ParsedWebhookEvent['planId'] })
    const result = await applyPlanGrant(bogus)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected err')
    expect(result.error.code).toBe('VALIDATION_ERROR')
    expect(port.calls).toHaveLength(0)
  })
})
