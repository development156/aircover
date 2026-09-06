import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DEMO_FALLBACK_PAYLOAD } from '@sahoda/shared'

/**
 * A resolved brain that was never confirmed is not lost, and is not built twice.
 *
 * MEASURED 2026-09-05 (docs/51 Q-01): three successful model calls, zero
 * `brand_memory` rows, then the daily free limit refused a fourth. The brain
 * lived only in the browser between the build and the reveal's confirm. Now
 * `resolveOnboarding` parks every real result server-side and hands the parked
 * one back on the next press instead of running the model again.
 */

const withCredits = vi.fn()
const runTask = vi.fn()
const readActiveBrandMemory = vi.fn()
const savePendingBrain = vi.fn()
const readPendingBrain = vi.fn()
const fixedWindowAllow = vi.fn()

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user-1' }) }))
vi.mock('@sahoda/billing', () => ({
  createWithCredits: () => (opts: unknown, fn: unknown) => withCredits(opts, fn),
  createPgLedgerPort: () => ({}),
  loadBillingEnv: () => ({ databaseUrl: 'postgres://x' }),
}))
vi.mock('@sahoda/mesh', () => ({
  createMesh: () => ({ runTask }),
  brandGuidelinesTask: { def: { name: 'brand_guidelines' } },
}))
vi.mock('@/lib/onboarding/read-brain', () => ({
  readActiveBrandMemory: (...args: unknown[]) => readActiveBrandMemory(...args),
}))
vi.mock('@/lib/onboarding/pending-brain', () => ({
  savePendingBrain: (...args: unknown[]) => savePendingBrain(...args),
  readPendingBrain: (...args: unknown[]) => readPendingBrain(...args),
}))
vi.mock('@/lib/workspaces', () => ({
  workspaceForWrite: async () => ({ ok: true, workspace: { id: 'ws-1', name: 'TRAINX' } }),
}))
vi.mock('@/lib/ops/rate-limit', () => ({
  fixedWindowAllow: (...args: unknown[]) => fixedWindowAllow(...args),
}))
vi.mock('@/lib/actions/revalidate-balance', () => ({ revalidateBalance: vi.fn() }))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

async function callResolve() {
  const { resolveOnboarding } = await import('./onboarding-resolve')
  const form = new FormData()
  form.set('name', 'TRAINX')
  form.set('positioning', 'online courses')
  form.set('audience', 'people learning a trade')
  form.set('model', 'service')
  form.set('regime', 'education')
  form.set('locale', 'IN')
  return resolveOnboarding(null, form)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  readActiveBrandMemory.mockResolvedValue({ status: 'none' })
  readPendingBrain.mockResolvedValue(null)
  fixedWindowAllow.mockResolvedValue({ allowed: true, count: 1, unmeasured: false })
  runTask.mockResolvedValue({ ok: true, data: DEMO_FALLBACK_PAYLOAD })
  withCredits.mockImplementation(async (_opts: unknown, fn: (ctx: unknown) => Promise<unknown>) => {
    await fn({ actionType: 'brand_research', creditsCharged: 50 })
    return { ok: true, data: {}, balanceAfter: 0 }
  })
})

describe('a real result is parked', () => {
  it('after a free build', async () => {
    const state = await callResolve()

    expect(state).toMatchObject({ ok: true, kind: 'free' })
    expect(savePendingBrain).toHaveBeenCalledTimes(1)
    expect(savePendingBrain).toHaveBeenCalledWith('ws-1', {
      brain: DEMO_FALLBACK_PAYLOAD,
      source: 'resolved',
    })
  })

  it('after a paid build', async () => {
    readActiveBrandMemory.mockResolvedValue({
      status: 'ok',
      brain: { version: 2, payload: {}, source: 'resolved' },
    })
    await callResolve()

    expect(withCredits).toHaveBeenCalledTimes(1)
    expect(savePendingBrain).toHaveBeenCalledWith('ws-1', {
      brain: DEMO_FALLBACK_PAYLOAD,
      source: 'resolved',
    })
  })

  it('but a sample is not: a fallback is not a brain worth coming back for', async () => {
    runTask.mockResolvedValue({ ok: true, data: DEMO_FALLBACK_PAYLOAD, fallback: true })
    const state = await callResolve()

    expect(state).toMatchObject({ ok: true, kind: 'fallback' })
    expect(savePendingBrain).not.toHaveBeenCalled()
  })

  it('and neither is a failure', async () => {
    runTask.mockResolvedValue({ ok: false, error: { message: 'model down' } })
    const state = await callResolve()

    expect(state).toMatchObject({ ok: false })
    expect(savePendingBrain).not.toHaveBeenCalled()
  })
})

describe('a parked brain comes back on the next press', () => {
  it('without running the model, without spending, and without touching the daily limit', async () => {
    readPendingBrain.mockResolvedValue({ brain: DEMO_FALLBACK_PAYLOAD, source: 'resolved' })
    const state = await callResolve()

    expect(state).toEqual({ ok: true, kind: 'free', brain: DEMO_FALLBACK_PAYLOAD, resumed: true })
    expect(runTask).not.toHaveBeenCalled()
    expect(withCredits).not.toHaveBeenCalled()
    expect(fixedWindowAllow).not.toHaveBeenCalled()
  })

  it('even for a workspace whose next build would otherwise be charged', async () => {
    readActiveBrandMemory.mockResolvedValue({
      status: 'ok',
      brain: { version: 2, payload: {}, source: 'resolved' },
    })
    readPendingBrain.mockResolvedValue({ brain: DEMO_FALLBACK_PAYLOAD, source: 'resolved' })
    const state = await callResolve()

    expect(state).toMatchObject({ ok: true, resumed: true })
    expect(withCredits).not.toHaveBeenCalled()
  })
})

describe('the daily free limit', () => {
  it('answers a refusal that says it cannot be retried today, not a generic error', async () => {
    fixedWindowAllow.mockResolvedValue({ allowed: false, count: 4, unmeasured: false })
    const state = await callResolve()

    expect(state).toMatchObject({ ok: false, kind: 'limit' })
    expect((state as { message: string }).message).toMatch(/tomorrow/i)
    expect(runTask).not.toHaveBeenCalled()
  })
})
