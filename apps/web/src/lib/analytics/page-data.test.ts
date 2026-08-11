import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { MetricAvailability } from '@sahoda/publishing'
import type { VariantStatusRow } from '@/lib/posts/variant-status'

/**
 * WHICH POPULATION the comparison is drawn from.
 *
 * Every coverage figure on the analytics page is a fraction, and this module decides
 * its denominator. Get the denominator wrong and nothing downstream can tell: a page
 * that scoped itself to "channels that reported" would print "All 3 channels
 * reported" over a workspace with eight published channels, and every refusal in
 * `compare.ts` would still be working perfectly.
 */

const posts = { listPosts: vi.fn(), listVariantStates: vi.fn() }
const metrics = { listPostMetrics: vi.fn() }
const account = { readInstagramAnalytics: vi.fn() }

vi.mock('@/lib/posts/read', () => ({
  listPosts: () => posts.listPosts(),
  listVariantStates: (ids: string[]) => posts.listVariantStates(ids),
}))
vi.mock('@/lib/analytics/post-metrics', () => ({
  listPostMetrics: (...args: unknown[]) => metrics.listPostMetrics(...args),
}))
vi.mock('@/lib/analytics/account-insights', () => ({
  readInstagramAnalytics: () => account.readInstagramAnalytics(),
}))

const { readAnalyticsPage, ANALYTICS_METRIC_CALLS } = await import('@/lib/analytics/page-data')

const NOW = new Date('2026-08-11T14:10:00.000Z')

const post = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  workspace_id: 'ws-1',
  title: `Post ${id}`,
  body: null,
  status: 'published',
  channels: ['instagram'],
  scheduled_at: null,
  origin: 'user',
  created_by: null,
  created_at: '2026-08-10T00:00:00.000Z',
  updated_at: '2026-08-10T00:00:00.000Z',
  ...over,
})

const variant = (over: Partial<VariantStatusRow> = {}): VariantStatusRow => ({
  channel: 'instagram',
  status: 'published',
  permalink: null,
  platformPostId: 'id-1',
  simulated: false,
  errorMessage: null,
  errorCode: null,
  retryable: false,
  ...over,
})

const notLoaded: MetricAvailability = { kind: 'unavailable', reason: 'not-loaded' }

beforeEach(() => {
  vi.clearAllMocks()
  account.readInstagramAnalytics.mockResolvedValue({ kind: 'not-connected' })
  posts.listPosts.mockResolvedValue([post('p1')])
  posts.listVariantStates.mockResolvedValue(new Map([['p1', [variant()]]]))
  metrics.listPostMetrics.mockImplementation(
    async (byPost: ReadonlyMap<string, readonly VariantStatusRow[]>) =>
      new Map(
        [...byPost].map(([id, rows]) => [
          id,
          rows.map((r) => ({ channel: r.channel, state: notLoaded })),
        ]),
      ),
  )
})

describe('the denominator includes the rows with nothing to say', () => {
  /**
   * The scoping rule, stated as a test because it is invisible once it is wrong.
   * A published channel whose metrics never arrived is a REAL gap in the picture,
   * and dropping it here would make every coverage line read "all reported".
   */
  it('keeps a published channel that reported nothing', async () => {
    const data = await readAnalyticsPage(NOW)
    expect(data.rows).toHaveLength(1)
    expect(data.rows[0]?.state).toEqual(notLoaded)
    expect(data.hasPublished).toBe(true)
  })

  it('keeps a published channel with no platform id at all', async () => {
    posts.listVariantStates.mockResolvedValue(
      new Map([['p1', [variant({ platformPostId: null })]]]),
    )
    const data = await readAnalyticsPage(NOW)
    expect(data.rows).toHaveLength(1)
  })

  /** Drafts and failures never published, so they are not gaps in a measurement. */
  it('leaves out channels that never published', async () => {
    posts.listVariantStates.mockResolvedValue(
      new Map([
        [
          'p1',
          [
            variant({ channel: 'instagram' }),
            variant({ channel: 'x', status: 'draft' as never }),
            variant({ channel: 'gbp', status: 'failed' as never }),
          ],
        ],
      ]),
    )
    const data = await readAnalyticsPage(NOW)
    expect(data.rows.map((r) => r.channel)).toEqual(['instagram'])
  })

  it('counts only posts with something published', async () => {
    posts.listPosts.mockResolvedValue([post('p1'), post('p2')])
    posts.listVariantStates.mockResolvedValue(
      new Map([
        ['p1', [variant()]],
        ['p2', [variant({ status: 'draft' as never })]],
      ]),
    )
    const data = await readAnalyticsPage(NOW)
    expect(data.posts.map((p) => p.id)).toEqual(['p1'])
  })

  it('says nothing has published rather than showing an empty comparison', async () => {
    posts.listVariantStates.mockResolvedValue(
      new Map([['p1', [variant({ status: 'draft' as never })]]]),
    )
    const data = await readAnalyticsPage(NOW)
    expect(data.hasPublished).toBe(false)
    expect(data.rows).toEqual([])
  })
})

describe('the page reads more than a list does, and says how many', () => {
  it('asks for its own, larger ceiling', async () => {
    await readAnalyticsPage(NOW)
    expect(metrics.listPostMetrics).toHaveBeenCalledWith(
      expect.anything(),
      NOW,
      ANALYTICS_METRIC_CALLS,
    )
    // A cap that quietly halved the population would make every total on this
    // page a subtotal. It is higher than the list's 6 and the detail view's 8.
    expect(ANALYTICS_METRIC_CALLS).toBeGreaterThan(8)
  })
})

describe('one failing read never empties the other half', () => {
  it('keeps the posts when the account read rejects', async () => {
    account.readInstagramAnalytics.mockRejectedValue(new Error('zernio down'))
    const data = await readAnalyticsPage(NOW)
    expect(data.rows).toHaveLength(1)
    expect(data.account).toEqual({ kind: 'unreadable' })
  })

  it('keeps the account when the posts read rejects', async () => {
    posts.listPosts.mockRejectedValue(new Error('db down'))
    account.readInstagramAnalytics.mockResolvedValue({ kind: 'reconnect' })
    const data = await readAnalyticsPage(NOW)
    expect(data.account).toEqual({ kind: 'reconnect' })
    expect(data.hasPublished).toBe(false)
  })

  /**
   * The assertion this test used to be missing.
   *
   * `account` was scoped inside the same `try` as the post reads, so a throw from
   * `listVariantStates` reached a catch with no account value in hand and returned a
   * hardcoded `unreadable` — telling a customer with a perfectly healthy Instagram
   * connection that we couldn't read their account. Asserting only `rows: []` passed
   * straight through it.
   */
  it('degrades to empty posts WITHOUT relabelling a healthy account read', async () => {
    account.readInstagramAnalytics.mockResolvedValue({ kind: 'ready', followers: [] })
    posts.listVariantStates.mockRejectedValue(new Error('boom'))

    const data = await readAnalyticsPage(NOW)
    expect(data.rows).toEqual([])
    expect(data.hasPublished).toBe(false)
    expect(data.account).toMatchObject({ kind: 'ready' })
  })
})

describe('a post with no title still has something to be called', () => {
  it('falls back to a trimmed body, then to a placeholder', async () => {
    posts.listPosts.mockResolvedValue([post('p1', { title: null, body: '  LINUX  ' })])
    expect((await readAnalyticsPage(NOW)).rows[0]?.title).toBe('LINUX')

    posts.listPosts.mockResolvedValue([post('p1', { title: null, body: null })])
    expect((await readAnalyticsPage(NOW)).rows[0]?.title).toBe('Untitled post')
  })
})
