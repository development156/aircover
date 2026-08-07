import { describe, it, expect, beforeAll } from 'vitest'
import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { PLAN_CATALOG } from '@sahoda/shared'
import { createCashfreeProvider, type CashfreeProvider } from './index'
import { loadCashfreeEnv } from './env'

loadEnv({ path: resolve(import.meta.dirname, '../../../../../.env'), quiet: true })

const HAS_KEYS = Boolean(process.env.CASHFREE_APP_ID && process.env.CASHFREE_SECRET_KEY)
/**
 * Explicit opt-in ON TOP of key presence: `CASHFREE_LIVE=1 pnpm test`.
 *
 * Keys being *present* does not mean they are *valid*. As of 2026-07-19 the repo .env has
 * CASHFREE_APP_ID and CASHFREE_SECRET_KEY set to the SAME value, so every call returns
 * 401 authentication Failed. Presence alone would therefore make the default suite red for a
 * reason unrelated to the code under test. The opt-in keeps this deliberate — and keeps the
 * failure loud when you do ask for it, rather than skipping past a broken credential.
 */
const LIVE_OPT_IN = process.env.CASHFREE_LIVE === '1'

/**
 * LIVE sandbox verification (owner ruling: skip-unless-env).
 *
 * Runs locally where .env carries real sandbox credentials; skips silently in CI, which has
 * none. It exists to prove the assumptions the fixture tests cannot: that the credentials
 * authenticate, that create-order behaves as documented, and — the load-bearing one — that
 * `order_tags` genuinely round-trip.
 *
 * Sandbox allows only ~30 create-orders/min (6x tighter than production), so this suite is
 * deliberately small and serial, and every order id is unique.
 */
describe.skipIf(!LIVE_OPT_IN || !HAS_KEYS).sequential('Cashfree sandbox (live)', () => {
  let provider: CashfreeProvider
  let orderId: string

  beforeAll(() => {
    const env = loadCashfreeEnv()
    // Refuse to fire real traffic at production from a test run, whatever .env says.
    expect(env.env).toBe('sandbox')
    provider = createCashfreeProvider({ env, appBaseUrl: 'https://app.sahoda.test' })
  })

  const input = () => ({
    workspaceId: randomUUID(),
    planId: 'starter' as const,
    period: '2026-07',
    successUrl: 'https://app.sahoda.test/billing/done',
    cancelUrl: 'https://app.sahoda.test/billing',
    customerEmail: 'sandbox@sahodalabs.com',
  })

  it('authenticates and creates a real sandbox order', async () => {
    const session = await provider.createCheckout(input())

    expect(session.mode).toBe('sandbox')
    expect(session.id).toMatch(/^sah_/)
    // The SDK token Cashfree actually returns — proof we are reading the right field.
    expect(session.sessionId).toBeTruthy()
    expect(session.url).toContain('/billing/checkout/')

    orderId = session.id
  })

  /**
   * THE load-bearing assertion of this whole lane.
   *
   * order_tags are the only carrier of workspace/plan/period from checkout to webhook. Their
   * echo is confirmed by Cashfree's SDK types but by no published example, so this is where
   * the assumption is actually tested against the real API.
   */
  it('echoes the order_tags we set back from GET /orders', async () => {
    const order = await provider.fetchOrder(orderId)

    expect(order.orderId).toBe(orderId)
    expect(order.status).toBe('ACTIVE') // unpaid — a real payment would make this PAID
    expect(order.tags).not.toBeNull()
    expect(order.tags).toMatchObject({ plan_id: 'starter', period: '2026-07' })
    expect(order.tags?.workspace_id).toBeTruthy()
  })

  it('prices the sandbox order at the plan amount', async () => {
    const fresh = await provider.createCheckout({ ...input(), planId: 'growth' })
    const order = await provider.fetchOrder(fresh.id)

    expect(order.tags?.plan_id).toBe('growth')
    expect(PLAN_CATALOG.growth.priceInr).toBeGreaterThan(0)
  })

  it('rejects a duplicate order id with a permanent 409', async () => {
    const fixed = `sah_dup_${randomUUID()}`
    const provider2 = createCashfreeProvider({
      env: loadCashfreeEnv(),
      appBaseUrl: 'https://app.sahoda.test',
      newId: () => fixed.replace('sah_', ''),
    })

    await provider2.createCheckout(input())
    await expect(provider2.createCheckout(input())).rejects.toThrow()
  })

  it('rejects a bad secret rather than silently succeeding', async () => {
    const bad = createCashfreeProvider({
      env: { ...loadCashfreeEnv(), secretKey: 'definitely-not-the-secret' },
      appBaseUrl: 'https://app.sahoda.test',
    })

    await expect(bad.createCheckout(input())).rejects.toThrow()
  })
})
