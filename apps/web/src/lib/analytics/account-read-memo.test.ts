import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LIVE_READ_TTL_MS, resetLiveReadCache } from '@/lib/analytics/read-cache'

/**
 * One account reading per workspace, account and window, for ten minutes.
 *
 * ── THE COST THIS PINS ───────────────────────────────────────────────────────
 * /home and /analytics each asked Instagram twice on every render, and nothing
 * remembered the answer between renders, refreshes or teammates. The reading is
 * now memoised on the live read itself, keyed so it can never cross a workspace,
 * and stamped with when it was asked so the screen can say so.
 *
 * Driven through a fake client that counts calls. The ordering guarantees
 * (`not-connected` before the transport is consulted) live in
 * `not-connected-vs-unreadable.test.ts` and are untouched by this.
 */

vi.mock('server-only', () => ({}))

const activeWorkspace = vi.fn()
const scopeForWorkspace = vi.fn()
const followerHistory = vi.fn()
const accountInsights = vi.fn()

vi.mock('@/lib/workspaces', () => ({
  activeWorkspaceRead: async () => {
    const w = await activeWorkspace()
    return w ? { status: 'ok', workspace: w } : { status: 'none' }
  },
}))
vi.mock('@/lib/zernio/scope', () => ({
  scopeForWorkspace: (...a: unknown[]) => scopeForWorkspace(...a),
}))
vi.mock('@/lib/zernio/server', () => ({
  zernioClientReads: () => ({
    instagramFollowerHistory: (...a: unknown[]) => followerHistory(...a),
    instagramAccountInsights: (...a: unknown[]) => accountInsights(...a),
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => {
    throw new Error('the memo path never needs the database')
  },
}))

const { readInstagramAnalytics } = await import('@/lib/analytics/account-insights')

const AT = new Date('2026-09-03T10:00:00.000Z')

const HISTORY = {
  dataDelay: '24 hours',
  metrics: { follower_count: { values: [{ date: '2026-09-01', value: 120 }] } },
}
const INSIGHTS = { dataDelay: '48 hours', metrics: { reach: { total: 40 } } }

beforeEach(() => {
  vi.clearAllMocks()
  resetLiveReadCache()
  activeWorkspace.mockResolvedValue({ id: 'ws_1' })
  scopeForWorkspace.mockResolvedValue({ account: 'acc_1' })
  followerHistory.mockResolvedValue(HISTORY)
  accountInsights.mockResolvedValue(INSIGHTS)
})

describe('the account reading is reused inside the TTL', () => {
  it('makes the two calls once for two renders, and both carry the time it asked', async () => {
    const first = await readInstagramAnalytics(AT)
    const second = await readInstagramAnalytics(new Date(AT.getTime() + LIVE_READ_TTL_MS - 1))

    expect(followerHistory).toHaveBeenCalledTimes(1)
    expect(accountInsights).toHaveBeenCalledTimes(1)
    expect(first).toMatchObject({ kind: 'ready', readAt: '2026-09-03T10:00:00.000Z' })
    expect(second).toMatchObject({ kind: 'ready', readAt: '2026-09-03T10:00:00.000Z' })
    if (second.kind !== 'ready') throw new Error('expected ready')
    expect(second.followers).toEqual([{ date: '2026-09-01', value: 120 }])
    expect(second.insights).toEqual([{ label: 'Reach', value: 40 }])
  })

  it('asks again once the TTL has passed, and the stamp moves with it', async () => {
    await readInstagramAnalytics(AT)
    const later = new Date(AT.getTime() + LIVE_READ_TTL_MS)
    const again = await readInstagramAnalytics(later)

    expect(followerHistory).toHaveBeenCalledTimes(2)
    expect(again).toMatchObject({ kind: 'ready', readAt: later.toISOString() })
  })

  /** The key carries the workspace: one tenant's reading is never another's. */
  it('never serves one workspace the reading made for another', async () => {
    await readInstagramAnalytics(AT)
    activeWorkspace.mockResolvedValue({ id: 'ws_2' })
    await readInstagramAnalytics(AT)
    expect(followerHistory).toHaveBeenCalledTimes(2)
  })

  /** And the account: a reconnected account starts from a fresh reading. */
  it('never serves one account the reading made for another', async () => {
    await readInstagramAnalytics(AT)
    scopeForWorkspace.mockResolvedValue({ account: 'acc_2' })
    await readInstagramAnalytics(AT)
    expect(followerHistory).toHaveBeenCalledTimes(2)
  })

  /** And the window: a render on a new day asks for that day's thirty days. */
  it('asks again when the day window has moved, even inside the TTL', async () => {
    await readInstagramAnalytics(new Date('2026-09-03T23:50:00.000Z'))
    // Five minutes on, same day: the reading is reused.
    await readInstagramAnalytics(new Date('2026-09-03T23:55:00.000Z'))
    expect(followerHistory).toHaveBeenCalledTimes(1)
    // Fourteen minutes on from the first read, so still inside the TTL by the
    // clock, but across midnight UTC: `until` is a different date and the
    // thirty-day window this render asks for is not the one that was answered.
    await readInstagramAnalytics(new Date('2026-09-04T00:04:00.000Z'))
    expect(followerHistory).toHaveBeenCalledTimes(2)
  })

  /** A failed pair is a failed pair for THIS render. It is not remembered, and it is not invented. */
  it('does not remember an unreadable answer: the next render asks again and can recover', async () => {
    accountInsights.mockRejectedValueOnce(new Error('boom'))
    expect((await readInstagramAnalytics(AT)).kind).toBe('unreadable')

    const next = await readInstagramAnalytics(new Date(AT.getTime() + 1000))
    expect(next.kind).toBe('ready')
    expect(accountInsights).toHaveBeenCalledTimes(2)
  })
})
