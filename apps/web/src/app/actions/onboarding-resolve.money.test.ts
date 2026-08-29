import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * WHICH LEDGER KEY THE PAID RESOLVE ACTUALLY USES.
 *
 * `resolve-object-ref.test.ts` proves the key is stable for a version. It cannot
 * prove the ACTION passes the right version, and that gap is not academic: a
 * mutation passing `activeVersion + 1` left every one of the 559 tests in this
 * area green while silently restoring the defect, because a key derived from a
 * version nobody has is a fresh key every time.
 *
 * So this asserts the wiring: the key the ledger receives is the one built from
 * the version of the brain the customer already has.
 */

const withCredits = vi.fn()
const runTask = vi.fn()
const activeBrandMemory = vi.fn()

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user-1' }) }))
vi.mock('@sahoda/billing', () => ({
  createWithCredits: () => (opts: unknown, fn: unknown) => withCredits(opts, fn),
  createPgLedgerPort: () => ({}),
  loadBillingEnv: () => ({ databaseUrl: 'postgres://x' }),
}))
vi.mock('@sahoda/mesh', () => ({
  createMesh: () => ({ runTask }),
  // Without this the action throws inside its own catch and the paid
  // assertions still pass, because `withCredits` is called before the throw.
  // A test that green-lights on a caught exception is not a test.
  brandGuidelinesTask: { def: { name: 'brand_guidelines' } },
}))
vi.mock('@/lib/onboarding/read-brain', () => ({
  activeBrandMemory: (...args: unknown[]) => activeBrandMemory(...args),
}))
vi.mock('@/lib/workspaces', () => ({
  getActiveWorkspace: async () => ({ id: 'ws-1', name: 'TRAINX' }),
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
  // The action refuses before any spend without these three, which is its own
  // guard and not what this file is about.
  form.set('model', 'service')
  form.set('regime', 'education')
  form.set('locale', 'IN')
  return resolveOnboarding(null, form)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  runTask.mockResolvedValue({ ok: true, data: {} })
  withCredits.mockImplementation(async (_opts: unknown, fn: (ctx: unknown) => Promise<unknown>) => {
    await fn({ actionType: 'brand_research', creditsCharged: 50 })
    return { ok: true, data: {}, balanceAfter: 0 }
  })
})

describe('the paid onboarding resolve', () => {
  it('keys the charge to the version of the brain the customer already has', async () => {
    activeBrandMemory.mockResolvedValue({ version: 7, payload: {}, source: 'resolved' })

    await callResolve()

    expect(withCredits).toHaveBeenCalledTimes(1)
    expect(withCredits.mock.calls[0]![0]).toMatchObject({
      workspaceId: 'ws-1',
      action: 'brand_research',
      objectRef: 'ws-1:brain-v7',
    })
  })

  /**
   * THE DEFECT, AS A TEST. Two paid attempts with nothing saved in between must
   * present the SAME key, because that is what makes the ledger replay the
   * charge instead of taking a second one.
   */
  it('presents the same key on a retry after an abandoned paid build', async () => {
    activeBrandMemory.mockResolvedValue({ version: 7, payload: {}, source: 'resolved' })

    await callResolve()
    await callResolve()

    const first = withCredits.mock.calls[0]![0] as { objectRef: string }
    const second = withCredits.mock.calls[1]![0] as { objectRef: string }
    expect(second.objectRef).toBe(first.objectRef)
  })

  /** And a saved brain opens the next charge, because that is a new purchase. */
  it('presents a new key once the brain they paid for has been saved', async () => {
    activeBrandMemory.mockResolvedValue({ version: 7, payload: {}, source: 'resolved' })
    await callResolve()

    activeBrandMemory.mockResolvedValue({ version: 8, payload: {}, source: 'resolved' })
    await callResolve()

    const first = withCredits.mock.calls[0]![0] as { objectRef: string }
    const second = withCredits.mock.calls[1]![0] as { objectRef: string }
    expect(second.objectRef).not.toBe(first.objectRef)
  })

  /** The first resolve is free and must never reach the ledger at all. */
  it('does not touch the ledger when there is no brain yet', async () => {
    activeBrandMemory.mockResolvedValue(null)

    await callResolve()

    expect(withCredits).not.toHaveBeenCalled()
    expect(runTask).toHaveBeenCalledTimes(1)
  })
})
