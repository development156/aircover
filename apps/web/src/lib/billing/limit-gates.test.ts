import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { PlanId } from '@sahoda/shared'

/**
 * The mounted entitlements gate, tested against the REAL `createCheckEntitlement`
 * and the REAL `PLAN_CATALOG` — only the Postgres plan resolver is faked. Testing
 * this against a hand-written stand-in for the gate would prove that my stand-in
 * agrees with itself; the whole risk lives in `isAllowed`'s countable-vs-level
 * semantics, which is shipping code.
 *
 * ── THE SIBLING THIS FILE EXISTS FOR ──────────────────────────────────────────
 * `isAllowed` answers a WEAKER question when `currentUsage` is absent: `limit > 0`,
 * i.e. "does the plan grant any of these at all". For Free/`sites: 0` that refuses
 * — correctly, but by coincidence. For Starter (`sites: 1`) it returns true forever,
 * however many sites already exist. So a gate that forgets the count still closes
 * the headline hole (a free user spending 100 credits on a forbidden site) while
 * leaving every paid tier unbounded, and a test suite that only covers Free would
 * call that a pass. `starter, one site already` below is the test that does not.
 */

const WS_ID = '22222222-2222-4222-8222-222222222222'

const state = vi.hoisted(() => ({ planId: 'free' as PlanId, envThrows: false }))

vi.mock('@sahoda/billing', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sahoda/billing')>()
  return {
    ...original, // the real createCheckEntitlement — the thing under test
    loadBillingEnv: () => {
      if (state.envThrows) {
        throw new Error('@sahoda/billing: missing required env — SUPABASE_DB_URL')
      }
      return { databaseUrl: 'postgres://test' }
    },
    createPgPlanResolver: () => ({ resolvePlanId: () => Promise.resolve(state.planId) }),
  }
})

vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))

const { checkCountableLimit } = await import('./entitlements')

beforeEach(() => {
  state.planId = 'free'
  state.envThrows = false
})

describe('checkCountableLimit — sites', () => {
  test('free plan cannot generate a site at all, and the sentence names Starter', async () => {
    state.planId = 'free'

    const verdict = await checkCountableLimit(WS_ID, 'sites', 0)

    expect(verdict.kind).toBe('blocked')
    if (verdict.kind !== 'blocked') return
    expect(verdict.sentence).toMatch(/sites are on starter and above/i)
    // The obvious hand-written sentence names Growth. Starter allows 1 site, so
    // recommending Growth would ask for three times the price they need.
    expect(verdict.sentence).not.toMatch(/growth/i)
  })

  test('starter, one site already: refused — the sibling a missing count would admit', async () => {
    state.planId = 'starter'

    const verdict = await checkCountableLimit(WS_ID, 'sites', 1)

    // ⚠ MUTATION WITNESS. Drop `currentUsage` from the gate call in
    // `checkCountableLimit` and THIS test fails while the free-plan test above
    // still passes — `limit > 0` is `1 > 0` for Starter.
    expect(verdict.kind).toBe('blocked')
    if (verdict.kind !== 'blocked') return
    expect(verdict.sentence).toMatch(/your starter plan includes 1 site and you're using 1/i)
    expect(verdict.sentence).toMatch(/growth includes 3/i)
  })

  test('starter with no site yet: allowed, and the limit comes back for the caller', async () => {
    state.planId = 'starter'

    const verdict = await checkCountableLimit(WS_ID, 'sites', 0)

    expect(verdict).toEqual({ kind: 'allowed', limit: 1 })
  })

  test('growth at 2 of 3 is allowed; at 3 of 3 it is not', async () => {
    state.planId = 'growth'

    expect(await checkCountableLimit(WS_ID, 'sites', 2)).toEqual({ kind: 'allowed', limit: 3 })
    expect((await checkCountableLimit(WS_ID, 'sites', 3)).kind).toBe('blocked')
  })
})

describe('checkCountableLimit — channels', () => {
  test('free plan admits 2 channels and refuses the third', async () => {
    state.planId = 'free'

    expect(await checkCountableLimit(WS_ID, 'channels', 1)).toEqual({ kind: 'allowed', limit: 2 })
    const third = await checkCountableLimit(WS_ID, 'channels', 2)

    expect(third.kind).toBe('blocked')
    if (third.kind !== 'blocked') return
    expect(third.sentence).toMatch(/your free plan includes 2 channels and you're using 2/i)
    expect(third.sentence).toMatch(/starter includes 4/i)
  })
})

describe('checkCountableLimit — failing closed', () => {
  test('a missing SUPABASE_DB_URL degrades to "unknown" instead of throwing', async () => {
    // This function runs on the RENDER path of /sites and /connections, not only
    // inside a server action with a catch around it. `loadBillingEnv` throws by
    // design when the env is unset, and letting that escape would 500 two pages
    // that render fine without it — the cloud sandbox has no .env at all.
    state.envThrows = true
    // Re-imported: `getCheckEntitlement` memoizes its singleton, so an instance the
    // earlier tests already built would never call the env loader again.
    vi.resetModules()
    const fresh = await import('./entitlements')

    await expect(fresh.checkCountableLimit(WS_ID, 'sites', 0)).resolves.toEqual({ kind: 'unknown' })
  })

  test('an unresolvable plan is "unknown", never a plan sentence we did not read', async () => {
    // A plan id outside PLAN_CATALOG makes the real gate fail closed with
    // PROVIDER_ERROR. It must NOT surface as `blocked`: telling a customer their
    // plan forbids this, when the truth is we could not read their plan, sends
    // them to a pricing page for an outage that is ours.
    state.planId = 'enterprise' as PlanId

    const verdict = await checkCountableLimit(WS_ID, 'sites', 0)

    expect(verdict).toEqual({ kind: 'unknown' })
  })
})
