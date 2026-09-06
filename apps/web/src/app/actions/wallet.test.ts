/**
 * `startCheckout` — the wallet half of audit finding Q-06.
 *
 * The provider is a fake that keeps the orders it created: `createCheckout`
 * mints under whatever `newId` the action injected and records the order as
 * ACTIVE; `fetchOrder` answers from that record or throws the 404 shape. The
 * proof is the count: two calls, one order. Before the change this file's first
 * test failed with 2 (a fresh `randomUUID()` each press).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const WORKSPACE = '11111111-1111-4111-8111-111111111111'

const state = vi.hoisted(() => ({
  orders: new Map<string, { status: string; paymentSessionId: string | null }>(),
  currentNewId: (): string => 'unset',
}))

beforeEach(() => {
  vi.clearAllMocks()
  state.orders.clear()
  state.currentNewId = () => 'unset'
})

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_1' }) }))
vi.mock('@/lib/workspaces', () => ({
  workspaceForWrite: async () => ({ ok: true as const, workspace: { id: WORKSPACE } }),
}))
vi.mock('@/lib/wallet/checkout-state', () => ({ currentBillingPeriod: () => '2026-09' }))
vi.mock('@/lib/env', () => ({ env: { NEXT_PUBLIC_APP_URL: 'https://app.sahoda.test' } }))
vi.mock('@/lib/observability/report', () => ({ reportServerError: () => {} }))

const createCheckout = vi.fn(async () => {
  const orderId = `sah_${state.currentNewId()}`
  const paymentSessionId = `session_${orderId}`
  state.orders.set(orderId, { status: 'ACTIVE', paymentSessionId })
  return {
    id: orderId,
    sessionId: paymentSessionId,
    url: `https://app.sahoda.test/billing/checkout/${orderId}`,
    mode: 'live' as const,
  }
})

const fetchOrder = vi.fn(async (orderId: string) => {
  const found = state.orders.get(orderId)
  if (!found) {
    const err = new Error(`cashfree get order failed (404): NOT_FOUND, no order ${orderId}`)
    Object.assign(err, { status: 404, code: 'NOT_FOUND', transient: false })
    throw err
  }
  return { orderId, status: found.status, tags: null, paymentSessionId: found.paymentSessionId }
})

vi.mock('@sahoda/billing', () => ({
  createCashfreeProvider: (opts: { newId?: () => string }) => {
    state.currentNewId = opts.newId ?? (() => 'random-fallback-id')
    return { id: 'cashfree', mode: 'live' as const, createCheckout, fetchOrder }
  },
  loadCashfreeEnv: () => ({
    appId: 'app_test',
    secretKey: 'secret_test',
    env: 'live' as const,
    baseUrl: 'https://api.cashfree.com/pg',
  }),
}))

const { startCheckout } = await import('./wallet')

describe('startCheckout — a second press for the same pack', () => {
  it('creates exactly one provider order and hands the second call the first one back', async () => {
    const first = await startCheckout('starter')
    const second = await startCheckout('starter')

    expect(createCheckout).toHaveBeenCalledTimes(1)
    expect(state.orders.size).toBe(1)
    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(second.sessionId).toBe(first.sessionId)
    expect(second.reused).toBe(true)
    expect(first.reused).toBeUndefined()
  })

  it('derives the id from workspace + pack + period, and prefixes it as a top-up', async () => {
    await startCheckout('starter')
    await startCheckout('starter')
    expect(fetchOrder).toHaveBeenCalledTimes(2)
    const [a] = fetchOrder.mock.calls[0]!
    const [b] = fetchOrder.mock.calls[1]!
    expect(a).toBe(b)
    expect(a).toMatch(/^sah_top_[0-9a-f]{24}$/)
  })

  it('a different pack is a different order', async () => {
    await startCheckout('starter')
    await startCheckout('growth')
    expect(createCheckout).toHaveBeenCalledTimes(2)
    expect(state.orders.size).toBe(2)
  })

  it('a PAID order is not reused: the next press opens a fresh order under a fresh id', async () => {
    const first = await startCheckout('starter')
    expect(first.ok).toBe(true)
    if (!first.ok) return
    state.orders.set(first.sessionId, { status: 'PAID', paymentSessionId: null })

    const second = await startCheckout('starter')
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(createCheckout).toHaveBeenCalledTimes(2)
    expect(second.sessionId).not.toBe(first.sessionId)
    expect(second.sessionId).not.toMatch(/^sah_top_/)
  })

  it('a concurrent loser (409 on create) reads the winner back instead of failing', async () => {
    // Both calls saw 404 on the pre-check; the second create collides.
    const pre = await startCheckout('starter')
    expect(pre.ok).toBe(true)
    fetchOrder.mockImplementationOnce(async () => {
      const err = new Error('gone between check and create')
      Object.assign(err, { status: 404 })
      throw err
    })
    createCheckout.mockImplementationOnce(async () => {
      const err = new Error('cashfree create order failed (409): order_id already exists')
      Object.assign(err, { status: 409 })
      throw err
    })
    const loser = await startCheckout('starter')
    expect(loser.ok).toBe(true)
    if (!loser.ok || !pre.ok) return
    expect(loser.sessionId).toBe(pre.sessionId)
    expect(loser.reused).toBe(true)
  })
})
