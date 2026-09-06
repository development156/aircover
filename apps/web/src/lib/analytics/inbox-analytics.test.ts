import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * The inbox analytics tab's own version of the house rule
 * `not-connected-vs-unreadable.test.ts` pins on the account-insights sibling:
 * "no account connected" must never be reported as "we could not read", and a
 * failed connection COUNT (`null`) must never be read as zero accounts.
 */

vi.mock('server-only', () => ({}))

const activeWorkspace = vi.fn()
const countAccounts = vi.fn()
const profileForWorkspace = vi.fn()
const zernioClientReads = vi.fn()

vi.mock('@/lib/workspaces', () => ({
  activeWorkspaceRead: async () => {
    const w = await activeWorkspace()
    return w ? { status: 'ok', workspace: w } : { status: 'none' }
  },
}))
vi.mock('@/lib/inbox/read', () => ({
  countAccounts: (...a: unknown[]) => countAccounts(...a),
}))
vi.mock('@/lib/zernio/scope', () => ({
  profileForWorkspace: (...a: unknown[]) => profileForWorkspace(...a),
}))
vi.mock('@/lib/zernio/server', () => ({ zernioClientReads: () => zernioClientReads() }))

async function load() {
  const [subject, publishing] = await Promise.all([
    import('@/lib/analytics/inbox-analytics'),
    import('@sahoda/publishing'),
  ])
  return { readInboxAnalytics: subject.readInboxAnalytics, ScopeError: publishing.ScopeError }
}

const AT = new Date('2026-09-06T00:00:00Z')
const FILTER = { days: 30 as const, platform: null, accountId: null }

describe('a missing connection is not a failed read', () => {
  beforeEach(() => {
    vi.resetModules()
    activeWorkspace.mockResolvedValue({ id: 'ws_1', name: 'Test', slug: 'test' })
    countAccounts.mockReset()
    profileForWorkspace.mockReset()
    zernioClientReads.mockReset()
  })

  test('reports not-connected when no account is connected, without consulting the transport', async () => {
    const { readInboxAnalytics } = await load()
    countAccounts.mockResolvedValue(0)
    zernioClientReads.mockReturnValue({ inboxVolume: vi.fn() })

    const result = await readInboxAnalytics(FILTER, AT)
    expect(result.kind).toBe('not-connected')
    expect(zernioClientReads).not.toHaveBeenCalled()
  })

  test('a failed connection count is unreadable, never not-connected', async () => {
    // countAccounts returning null means "we did not find out", per
    // src/lib/inbox/read.ts. Reading it as zero would invert the sentence.
    const { readInboxAnalytics } = await load()
    countAccounts.mockResolvedValue(null)

    const result = await readInboxAnalytics(FILTER, AT)
    expect(result.kind).toBe('unreadable')
  })

  test('says not-configured, not unreadable, when there is an account but no key', async () => {
    const { readInboxAnalytics } = await load()
    countAccounts.mockResolvedValue(1)
    zernioClientReads.mockReturnValue(null)

    const result = await readInboxAnalytics(FILTER, AT)
    expect(result.kind).toBe('not-configured')
  })

  test('reports unreadable when the profile lookup throws unexpectedly', async () => {
    const { readInboxAnalytics } = await load()
    countAccounts.mockResolvedValue(1)
    zernioClientReads.mockReturnValue({})
    profileForWorkspace.mockRejectedValue(new Error('db down'))

    const result = await readInboxAnalytics(FILTER, AT)
    expect(result.kind).toBe('unreadable')
  })

  test('reports not-connected when scoping throws a ScopeError', async () => {
    const { readInboxAnalytics, ScopeError } = await load()
    countAccounts.mockResolvedValue(1)
    zernioClientReads.mockReturnValue({})
    profileForWorkspace.mockRejectedValue(new ScopeError('no zernio profile'))

    const result = await readInboxAnalytics(FILTER, AT)
    expect(result.kind).toBe('not-connected')
  })

  test('reads every panel in one Promise.all and returns ready with the shaped data', async () => {
    const { readInboxAnalytics } = await load()
    countAccounts.mockResolvedValue(2)
    profileForWorkspace.mockResolvedValue('profile_scoped')

    const volume = {
      from: '2026-08-07',
      to: '2026-09-06',
      summary: { received: 10, sent: 8, read: 6, failed: 0, uniqueConversations: 3 },
      timeseries: [],
      byPlatform: [],
    }
    const heatmap = { from: '2026-08-07', to: '2026-09-06', buckets: [] }
    const sources = { from: '2026-08-07', to: '2026-09-06', sources: [] }
    const responseTime = { from: '2026-08-07', to: '2026-09-06', summary: null, histogram: [] }
    const topAccounts = { from: '2026-08-07', to: '2026-09-06', accounts: [] }

    let concurrent = 0
    let sawConcurrent = false
    const track = async <T>(value: T): Promise<T> => {
      concurrent += 1
      if (concurrent > 1) sawConcurrent = true
      await Promise.resolve()
      concurrent -= 1
      return value
    }

    zernioClientReads.mockReturnValue({
      inboxVolume: () => track(volume),
      inboxHeatmap: () => track(heatmap),
      inboxSourceBreakdown: () => track(sources),
      inboxResponseTime: () => track(responseTime),
      inboxTopAccounts: () => track(topAccounts),
    })

    const result = await readInboxAnalytics(FILTER, AT)
    expect(result.kind).toBe('ready')
    if (result.kind === 'ready') {
      expect(result.volume.summary.received).toBe(10)
    }
    expect(sawConcurrent).toBe(true)
  })

  test('resolves the fromDate from the window, 30 days back', async () => {
    const { readInboxAnalytics } = await load()
    countAccounts.mockResolvedValue(1)
    profileForWorkspace.mockResolvedValue('profile_scoped')

    const inboxVolume = vi.fn().mockResolvedValue({
      from: '',
      to: null,
      summary: { received: 0, sent: 0, read: 0, failed: 0, uniqueConversations: 0 },
      timeseries: [],
      byPlatform: [],
    })
    zernioClientReads.mockReturnValue({
      inboxVolume,
      inboxHeatmap: vi.fn().mockResolvedValue({ from: '', to: null, buckets: [] }),
      inboxSourceBreakdown: vi.fn().mockResolvedValue({ from: '', to: null, sources: [] }),
      inboxResponseTime: vi
        .fn()
        .mockResolvedValue({ from: '', to: null, summary: null, histogram: [] }),
      inboxTopAccounts: vi.fn().mockResolvedValue({ from: '', to: null, accounts: [] }),
    })

    await readInboxAnalytics(FILTER, AT)
    expect(inboxVolume.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ fromDate: '2026-08-07' }),
    )
  })
})
