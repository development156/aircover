import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { VariantStatusRow } from '@/lib/posts/variant-status'

/**
 * WHAT THE PAGE READS LIVE, and what it must never read again.
 *
 * Until 2026-09-03 this module asked Zernio about every published channel, up to
 * 24 calls a render, to build a comparison table the page had stopped rendering
 * five days earlier. The tests here used to pin that population and that cap.
 * They now pin the opposite: `hasPublished` is decided from `post_variants`
 * alone, and no per-post metric read happens on this path at all.
 *
 * `post-metrics` is mocked as a COUNTER rather than left out, so that a future
 * import of it from this module shows up as a failed assertion and not as a
 * quiet return of the 24 calls.
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
  readPostMetrics: (...args: unknown[]) => metrics.listPostMetrics(...args),
}))
vi.mock('@/lib/analytics/account-insights', () => ({
  readInstagramAnalytics: () => account.readInstagramAnalytics(),
}))

const { readAnalyticsPage } = await import('@/lib/analytics/page-data')

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
  gateRefusal: null,
  retryable: false,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  account.readInstagramAnalytics.mockResolvedValue({ kind: 'not-connected' })
  posts.listPosts.mockResolvedValue([post('p1')])
  posts.listVariantStates.mockResolvedValue(new Map([['p1', [variant()]]]))
})

describe('hasPublished is a fact about channels, not about metrics', () => {
  /**
   * The scoping rule that used to define a table's denominator now defines one
   * flag, and it is the same rule: PUBLISHED is what counts. A published channel
   * that reported nothing has still published.
   */
  it('is true for a published channel that has reported nothing', async () => {
    const data = await readAnalyticsPage(NOW)
    expect(data.hasPublished).toBe(true)
  })

  it('is true for a published channel with no platform id at all', async () => {
    posts.listVariantStates.mockResolvedValue(
      new Map([['p1', [variant({ platformPostId: null })]]]),
    )
    expect((await readAnalyticsPage(NOW)).hasPublished).toBe(true)
  })

  /** Drafts and failures never published, so they do not count. */
  it('ignores channels that never published', async () => {
    posts.listVariantStates.mockResolvedValue(
      new Map([
        [
          'p1',
          [
            variant({ channel: 'x', status: 'draft' as never }),
            variant({ channel: 'gbp', status: 'failed' as never }),
          ],
        ],
      ]),
    )
    expect((await readAnalyticsPage(NOW)).hasPublished).toBe(false)
  })

  it('is true when any one post has published, whatever the others did', async () => {
    posts.listPosts.mockResolvedValue([post('p1'), post('p2')])
    posts.listVariantStates.mockResolvedValue(
      new Map([
        ['p1', [variant({ status: 'draft' as never })]],
        ['p2', [variant()]],
      ]),
    )
    expect((await readAnalyticsPage(NOW)).hasPublished).toBe(true)
  })

  it('says nothing has published for a workspace of drafts', async () => {
    posts.listVariantStates.mockResolvedValue(
      new Map([['p1', [variant({ status: 'draft' as never })]]]),
    )
    expect((await readAnalyticsPage(NOW)).hasPublished).toBe(false)
  })

  it('says nothing has published for a workspace with no posts, without asking about variants', async () => {
    posts.listPosts.mockResolvedValue([])
    expect((await readAnalyticsPage(NOW)).hasPublished).toBe(false)
    expect(posts.listVariantStates).not.toHaveBeenCalled()
  })
})

describe('the page makes no per-post metric read', () => {
  /**
   * The finding this pins (data-perf-3): 24 live Zernio calls a render, six
   * serial rounds, for a table the page no longer drew. Zero is the number.
   */
  it('never calls listPostMetrics, however many channels have published', async () => {
    posts.listPosts.mockResolvedValue(Array.from({ length: 30 }, (_, i) => post(`p${i}`)))
    posts.listVariantStates.mockResolvedValue(
      new Map(
        Array.from({ length: 30 }, (_, i) => [
          `p${i}`,
          [variant({ platformPostId: `id-${i}` }), variant({ channel: 'linkedin' })],
        ]),
      ),
    )
    const data = await readAnalyticsPage(NOW)
    expect(data.hasPublished).toBe(true)
    expect(metrics.listPostMetrics).not.toHaveBeenCalled()
  })

  /**
   * The shape is the guarantee: a `rows` or `posts` field here would mean the
   * per-post population was computed again, and with it the reads. The account
   * mock is what it is because the account half is the ONE live read left.
   */
  it('returns only the account and the flag, and nothing per post', async () => {
    const data = await readAnalyticsPage(NOW)
    expect(Object.keys(data).sort()).toEqual(['account', 'hasPublished'])
  })
})

describe('one failing read never empties the other half', () => {
  it('keeps the flag when the account read rejects', async () => {
    account.readInstagramAnalytics.mockRejectedValue(new Error('zernio down'))
    const data = await readAnalyticsPage(NOW)
    expect(data.hasPublished).toBe(true)
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
   * connection that we couldn't read their account.
   */
  it('degrades to "nothing published" WITHOUT relabelling a healthy account read', async () => {
    account.readInstagramAnalytics.mockResolvedValue({ kind: 'ready', followers: [] })
    posts.listVariantStates.mockRejectedValue(new Error('boom'))

    const data = await readAnalyticsPage(NOW)
    expect(data.hasPublished).toBe(false)
    expect(data.account).toMatchObject({ kind: 'ready' })
  })
})
