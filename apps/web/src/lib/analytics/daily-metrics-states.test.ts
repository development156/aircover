import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * "NOTHING IS CONNECTED" AND "WE COULD NOT READ IT" ARE DIFFERENT SENTENCES.
 *
 * The sibling of `not-connected-vs-unreadable.test.ts`, for the live posting
 * read. The failure it pins is the one that arrives with this endpoint and not
 * with the others: `GET /analytics/daily-metrics` answers HTTP 402
 * `analytics_addon_required` on a legacy plan. That is a refusal, so it throws,
 * and the tempting catch is "we could not ask, so nothing must be connected".
 *
 * It is the inverse of the truth. The accounts ARE connected; the plan does not
 * carry the add-on. Reporting it as `not-connected` sends somebody to
 * /connections to reconnect an account that is already connected, which is
 * exactly the impossible remedy `e2e/no-impossible-remedy.spec.ts` exists to
 * refuse.
 */

vi.mock('server-only', () => ({}))

const activeWorkspaceRead = vi.fn()
const profileForWorkspace = vi.fn()
const zernioClientReads = vi.fn()

class FakeScopeError extends Error {}

vi.mock('@/lib/workspaces', () => ({ activeWorkspaceRead: () => activeWorkspaceRead() }))
vi.mock('@/lib/zernio/scope', () => ({
  ScopeError: FakeScopeError,
  profileForWorkspace: (...args: unknown[]) => profileForWorkspace(...args),
}))
vi.mock('@/lib/zernio/server', () => ({ zernioClientReads: () => zernioClientReads() }))

const VIEW = { from: '2026-08-01', to: '2026-08-30' }

async function load() {
  return (await import('@/lib/analytics/daily-metrics')).readDailyMetrics
}

describe('readDailyMetrics keeps its three answers apart', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    activeWorkspaceRead.mockResolvedValue({ status: 'ok', workspace: { id: 'ws_1' } })
    profileForWorkspace.mockResolvedValue('profile_1')
    zernioClientReads.mockReturnValue({ dailyMetrics: vi.fn() })
  })

  test('an account with no Zernio profile is not-connected, and no read goes out', async () => {
    const dailyMetrics = vi.fn()
    zernioClientReads.mockReturnValue({ dailyMetrics })
    profileForWorkspace.mockRejectedValue(new FakeScopeError('no profile'))

    expect(await (await load())(VIEW)).toEqual({ kind: 'not-connected' })
    expect(dailyMetrics).not.toHaveBeenCalled()
  })

  test('the add-on refusal is unreadable, NEVER not-connected', async () => {
    // 402 `analytics_addon_required`. The one that inverts if the catch is lazy.
    zernioClientReads.mockReturnValue({
      dailyMetrics: () => Promise.reject(new Error('HTTP 402 analytics_addon_required')),
    })

    const result = await (await load())(VIEW)
    expect(result.kind).toBe('unreadable')
    expect(result.kind).not.toBe('not-connected')
  })

  test('a workspace read that FAILED is not a workspace with nothing connected', async () => {
    activeWorkspaceRead.mockResolvedValue({ status: 'unreadable' })
    expect((await (await load())(VIEW)).kind).toBe('unreadable')
  })

  test('an account that has not made a workspace yet is not-connected', async () => {
    activeWorkspaceRead.mockResolvedValue({ status: 'none' })
    expect((await (await load())(VIEW)).kind).toBe('not-connected')
  })

  test('no publishing key in this environment is ours, and earns no retry', async () => {
    // Nothing about the customer's accounts was established, so nothing about
    // them may be claimed — AND reloading cannot conjure an environment
    // variable, so this may not be `unreadable`, whose sentence offers one.
    zernioClientReads.mockReturnValue(null)
    const result = await (await load())(VIEW)
    expect(result.kind).toBe('not-configured')
    expect(result.kind).not.toBe('unreadable')
    expect(result.kind).not.toBe('not-connected')
  })

  test('a good read carries the window and the attribution it asked for', async () => {
    const dailyMetrics = vi.fn().mockResolvedValue({
      dailyData: [
        {
          date: '2026-08-01',
          postCount: 1,
          platforms: {},
          metrics: { likes: 3, comments: null },
        },
      ],
      platformBreakdown: [],
    })
    zernioClientReads.mockReturnValue({ dailyMetrics })

    const result = await (await load())(VIEW)
    expect(result.kind).toBe('ready')
    // `received`, explicitly, never Zernio's `publish` default: the two answer
    // different questions on the same axis.
    expect(dailyMetrics).toHaveBeenCalledWith('profile_1', {
      fromDate: '2026-08-01',
      toDate: '2026-08-30',
      attribution: 'received',
    })
  })
})
