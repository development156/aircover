import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WRITE_NO_WORKSPACE, WRITE_WORKSPACE_UNREADABLE } from '@/lib/workspaces'

/**
 * THE THREE WAYS THE FREE BUILD WAS UNBOUNDED, each pinned.
 *
 *  1. A read that FAILED was routed as "no brain", i.e. free. A Supabase
 *     hiccup turned a 50-credit build into a free model call.
 *  2. Nothing counted free builds, so a person who never kept one could loop
 *     a real model call at zero credits.
 *  3. The free path returned the mesh's own sentence to the customer:
 *     "model output hit the 4096-token ceiling for brand_guidelines".
 *
 * And the workspace refusal: a failed workspace read used to answer "Create a
 * workspace first", a remedy for a workspace the customer already has.
 */

const state = vi.hoisted(() => ({
  brain: { status: 'none' } as
    { status: 'none' } | { status: 'unreadable' } | { status: 'ok'; brain: { version: number } },
  workspace: { ok: true, workspace: { id: 'ws-1', name: 'TRAINX' } } as
    { ok: true; workspace: { id: string; name: string } } | { ok: false; message: string },
  refuseKeys: ((_key: string) => false) as (key: string) => boolean,
  limiterKeys: [] as string[],
}))

const runTask = vi.fn()
const withCredits = vi.fn()

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
  readActiveBrandMemory: async () => state.brain,
}))
vi.mock('@/lib/workspaces', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/workspaces')>()),
  workspaceForWrite: async () => state.workspace,
}))
vi.mock('@/lib/ops/rate-limit', () => ({
  fixedWindowAllow: async (key: string) => {
    state.limiterKeys.push(key)
    return { allowed: !state.refuseKeys(key), count: 1, unmeasured: false }
  },
}))
vi.mock('@/lib/actions/revalidate-balance', () => ({ revalidateBalance: vi.fn() }))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { resolveOnboarding } = await import('./onboarding-resolve')

function form(): FormData {
  const data = new FormData()
  data.set('name', 'TRAINX')
  data.set('model', 'service')
  data.set('regime', 'education')
  data.set('locale', 'IN')
  return data
}

const MESH_SENTENCE = 'model output hit the 4096-token ceiling for brand_guidelines and was cut off'

beforeEach(() => {
  vi.clearAllMocks()
  state.brain = { status: 'none' }
  state.workspace = { ok: true, workspace: { id: 'ws-1', name: 'TRAINX' } }
  state.refuseKeys = () => false
  state.limiterKeys = []
  runTask.mockResolvedValue({ ok: true, data: {} })
})

describe('a brain read that failed', () => {
  it('refuses with a retry sentence and runs nothing: never free, never charged', async () => {
    state.brain = { status: 'unreadable' }

    const result = await resolveOnboarding(null, form())

    expect(result.ok).toBe(false)
    expect(result).toMatchObject({ kind: 'error' })
    if (!result.ok) {
      expect(result.message).toMatch(/could not read your saved brand brain/i)
      expect(result.message).toMatch(/nothing was charged/i)
      expect(result.message).not.toMatch(/create a workspace/i)
    }
    expect(runTask).not.toHaveBeenCalled()
    expect(withCredits).not.toHaveBeenCalled()
  })
})

describe('the free build is bounded', () => {
  it('asks a daily window keyed on the person and on the workspace before the model runs', async () => {
    const result = await resolveOnboarding(null, form())

    expect(result).toMatchObject({ ok: true, kind: 'free' })
    expect(state.limiterKeys).toContain('resolve:free:day:u:user-1')
    expect(state.limiterKeys).toContain('resolve:free:day:w:ws-1')
  })

  it('the fourth free build in a day is refused, and the model is not called', async () => {
    state.refuseKeys = (key) => key === 'resolve:free:day:w:ws-1'

    const result = await resolveOnboarding(null, form())

    expect(result).toMatchObject({ ok: false, kind: 'error' })
    if (!result.ok) {
      expect(result.message).toMatch(/3 times today/)
      expect(result.message).toMatch(/nothing was charged/i)
    }
    expect(runTask).not.toHaveBeenCalled()
    expect(withCredits).not.toHaveBeenCalled()
  })

  it('a workspace hop does not reopen the window: the user key still refuses', async () => {
    state.refuseKeys = (key) => key.startsWith('resolve:free:day:u:')
    state.workspace = { ok: true, workspace: { id: 'ws-2', name: 'Again' } }

    const result = await resolveOnboarding(null, form())

    expect(result.ok).toBe(false)
    expect(runTask).not.toHaveBeenCalled()
  })

  it('the charged path is not subject to the free window', async () => {
    state.brain = { status: 'ok', brain: { version: 4 } }
    state.refuseKeys = (key) => key.startsWith('resolve:free:')
    withCredits.mockImplementation(async (_o: unknown, fn: (ctx: unknown) => Promise<unknown>) => {
      await fn({ actionType: 'brand_research', creditsCharged: 50 })
      return { ok: true, data: { data: {}, balanceAfter: 0 } }
    })

    await resolveOnboarding(null, form())

    expect(withCredits).toHaveBeenCalledTimes(1)
    expect(state.limiterKeys).toEqual([])
  })
})

describe('the customer never reads a mesh sentence', () => {
  it('maps a free-path model error to the shared sentence', async () => {
    runTask.mockResolvedValue({
      ok: false,
      error: { code: 'PROVIDER_ERROR', message: MESH_SENTENCE },
    })

    const result = await resolveOnboarding(null, form())

    expect(result).toMatchObject({ ok: false, kind: 'error' })
    if (!result.ok) {
      expect(result.message).not.toContain(MESH_SENTENCE)
      expect(result.message).not.toMatch(/token|ceiling|brand_guidelines|mesh|provider/i)
      expect(result.message).toBe('Could not resolve your Brand Brain. Try again.')
    }
  })
})

describe('the workspace refusal names the arm', () => {
  it('a failed workspace read never says "Create a workspace first"', async () => {
    state.workspace = { ok: false, message: WRITE_WORKSPACE_UNREADABLE }

    const result = await resolveOnboarding(null, form())

    expect(result).toMatchObject({ ok: false, kind: 'error', message: WRITE_WORKSPACE_UNREADABLE })
    if (!result.ok) expect(result.message).not.toMatch(/create a workspace/i)
    expect(runTask).not.toHaveBeenCalled()
  })

  it('no workspace at all still says to create one', async () => {
    state.workspace = { ok: false, message: WRITE_NO_WORKSPACE }

    const result = await resolveOnboarding(null, form())

    expect(result).toMatchObject({ ok: false, kind: 'error', message: WRITE_NO_WORKSPACE })
  })
})
