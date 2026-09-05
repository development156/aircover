import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `startPlanUpgrade` — audit finding Q-06.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────────
 * Every call opened a fresh Cashfree order: `orderId` came from `newId()` (a
 * `randomUUID()` inside the provider) and `changeId` from a bare `randomUUID()`
 * right here, so nothing about the request repeated when the SAME upgrade was
 * requested twice. The only thing stopping a double-click was the client
 * disabling its own button — not a server guarantee, and not something a
 * retried form submission or a slow network honours.
 *
 * ── WHAT THIS FILE PROVES ────────────────────────────────────────────────────
 * Two back-to-back `startPlanUpgrade` calls for the identical workspace/plan
 * land on the SAME provider order: `createCheckout` fires once, the second
 * call's `fetchOrder` finds that order already open and payable, and the
 * result it returns points at the identical checkout target (`sessionId`,
 * `url`) with `reused: true` naming it as such — never a second, silent order.
 *
 * The fake rail below mimics the one property the real `CashfreeProvider`
 * contract has to keep for this guard to work: `createCheckout` is called with
 * whatever `newId` the caller injected, and `fetchOrder` answers from what
 * `createCheckout` actually created — never a canned always-empty stub, which
 * would let this test pass with no dedup guard behind it at all.
 */

const WORKSPACE = '33333333-3333-4333-8333-333333333333'

const state = vi.hoisted(() => ({
  orders: new Map<string, { status: string; paymentSessionId: string | null }>(),
  currentNewId: (): string => 'unset',
}))

beforeEach(() => {
  vi.clearAllMocks()
  state.orders.clear()
  state.currentNewId = () => 'unset'
})

// ── the seams ────────────────────────────────────────────────────────────────

const auth = vi.fn(async () => ({ userId: 'user_1' }))
vi.mock('@clerk/nextjs/server', () => ({ auth: () => auth() }))

const workspaceForWrite = vi.fn(async () => ({
  ok: true as const,
  workspace: { id: WORKSPACE },
}))
vi.mock('@/lib/workspaces', () => ({ workspaceForWrite: () => workspaceForWrite() }))

const readSubscription = vi.fn(async () => ({
  status: 'ok' as const,
  data: {
    workspaceId: WORKSPACE,
    planId: 'starter' as const,
    status: 'active' as const,
    currentPeriodStart: '2026-09-01T00:00:00.000Z',
    currentPeriodEnd: '2026-10-01T00:00:00.000Z',
    cancelAtPeriodEnd: false,
    pendingPlanId: null,
    pendingPlanEffectiveAt: null,
    graceEndsAt: null,
    dunningAttempts: 0,
    lastFailureAt: null,
    lastFailureCode: null,
  },
}))
vi.mock('@/lib/billing/read', () => ({
  readSubscription: () => readSubscription(),
  readUsage: async () => ({ status: 'ok', data: {} }),
}))

vi.mock('@/lib/billing/window', () => ({
  billingWindow: () => ({
    start: new Date('2026-09-01T00:00:00.000Z'),
    end: new Date('2026-10-01T00:00:00.000Z'),
    currentPeriodPaid: true,
    derivedFromCalendar: false,
  }),
}))

// A single billing period for every call in this file, so two calls in the same test
// cannot land on different order ids for the reason the real bug never could: the
// calendar rolling over mid-test. `startPlanUpgrade` computes `new Date()` itself and is
// not given a clock to inject — pinning the PERIOD here is the deterministic seam.
vi.mock('@/lib/wallet/checkout-state', () => ({
  currentBillingPeriod: () => '2026-09',
}))

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

const createCashfreeProvider = vi.fn((opts: { newId?: () => string }) => {
  state.currentNewId = opts.newId ?? (() => 'random-fallback-id')
  return {
    id: 'cashfree',
    mode: 'live' as const,
    createCheckout,
    fetchOrder,
    verifyWebhookSignature: () => true,
    parseWebhookEvent: () => {
      throw new Error('not used by this test')
    },
    resolveWebhookEvent: async () => {
      throw new Error('not used by this test')
    },
  }
})

vi.mock('@sahoda/billing', () => ({
  computeProration: () => ({
    kind: 'upgrade' as const,
    fromPlanId: 'starter' as const,
    toPlanId: 'growth' as const,
    effectiveAt: '2026-09-05T00:00:00.000Z',
    immediate: true,
    unusedBasisPoints: 0,
    remainderChargePaise: 150000,
    unusedCreditPaise: 0,
    amountDuePaise: 150000,
    creditsGranted: 500,
  }),
  downgradeImpact: () => null,
  createCashfreeProvider: (opts: { newId?: () => string }) => createCashfreeProvider(opts),
  loadCashfreeEnv: () => ({
    appId: 'app_test',
    secretKey: 'secret_test',
    env: 'live' as const,
    baseUrl: 'https://api.cashfree.com/pg',
  }),
}))

vi.mock('@/lib/env', () => ({ env: { NEXT_PUBLIC_APP_URL: 'https://app.sahoda.test' } }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/observability/report', () => ({ reportServerError: () => {} }))

const { startPlanUpgrade } = await import('./billing')

// ── the test ─────────────────────────────────────────────────────────────────

describe('startPlanUpgrade — a second call for the same upgrade', () => {
  it('creates exactly one provider order and hands the second call the first one back', async () => {
    const first = await startPlanUpgrade('growth')
    const second = await startPlanUpgrade('growth')

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (!first.ok || !second.ok) return

    // The property that decays silently: a regression back to `randomUUID()`-per-call
    // still returns `ok: true` from both calls, so a truthiness check on `ok` alone would
    // stay green while the fix it is meant to guard disappears.
    expect(createCheckout).toHaveBeenCalledTimes(1)

    expect(first.simulated).toBe(false)
    expect(second.simulated).toBe(false)
    if (first.simulated || second.simulated) return

    // Same checkout target, byte for byte — not just "both succeeded".
    expect(second.sessionId).toBe(first.sessionId)
    expect(second.url).toBe(first.url)

    // The result NAMES which one it is, so a caller can tell a customer "this upgrade is
    // already open" instead of silently reusing without saying so.
    expect(first.reused).toBe(false)
    expect(second.reused).toBe(true)
  })

  it('looks up the SAME order id both times, derived from workspace + plan + period', async () => {
    await startPlanUpgrade('growth')
    await startPlanUpgrade('growth')

    expect(fetchOrder).toHaveBeenCalledTimes(2)
    const [firstOrderId] = fetchOrder.mock.calls[0]!
    const [secondOrderId] = fetchOrder.mock.calls[1]!
    expect(secondOrderId).toBe(firstOrderId)
  })
})
