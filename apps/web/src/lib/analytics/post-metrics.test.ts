import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VariantStatusRow } from '@/lib/posts/variant-status'

/**
 * The ORCHESTRATION, not the classification.
 *
 * `analytics-state.test.ts` covers what a given response means. This covers the
 * layer around it: that every row gets a verdict, that a failure anywhere degrades
 * to an honest state instead of throwing, and that the call ceiling reports
 * "not loaded" rather than a zero or a false "try again".
 */

const reads = { postAnalytics: vi.fn() }
const scope = { profileForWorkspace: vi.fn() }
const workspace = { getActiveWorkspace: vi.fn() }
const supabase = { createServerSupabase: vi.fn() }

vi.mock('@/lib/zernio/server', () => ({
  zernioClientReads: () => reads,
  zernioClient: () => null,
  zernioAvailable: () => true,
}))
vi.mock('@/lib/zernio/scope', () => ({
  profileForWorkspace: (...args: unknown[]) => scope.profileForWorkspace(...args),
  ScopeError: class ScopeError extends Error {},
}))
vi.mock('@/lib/workspaces', () => ({
  getActiveWorkspace: () => workspace.getActiveWorkspace(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => supabase.createServerSupabase(),
}))

const { listPostMetrics, LIST_METRIC_CALLS } = await import('@/lib/analytics/post-metrics')

const WS = { id: 'ws-1' }
const NOW = new Date('2026-08-08T12:00:00.000Z')

/** A publish-logs query that reports one succeeded row per (post, channel). */
function logsReturning(rows: unknown[]) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => Promise.resolve({ data: rows, error: null }),
  }
  return { from: () => builder }
}

const row = (over: Partial<VariantStatusRow> = {}): VariantStatusRow => ({
  channel: 'instagram',
  status: 'published',
  permalink: 'https://instagram.com/p/abc',
  platformPostId: '18104441855596739',
  errorMessage: null,
  errorCode: null,
  retryable: false,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  workspace.getActiveWorkspace.mockResolvedValue(WS)
  scope.profileForWorkspace.mockResolvedValue('6a75cae32853ee463c6419d6')
  supabase.createServerSupabase.mockReturnValue(logsReturning([]))
  reads.postAnalytics.mockResolvedValue({
    status: 200,
    post: { postId: 'p', analytics: { impressions: 10, lastUpdated: '2026-08-06T09:00:00.000Z' } },
  })
})

describe('every row gets a verdict', () => {
  it('answers for channels it never calls about, rather than omitting them', async () => {
    const out = await listPostMetrics(
      new Map([['post-1', [row(), row({ channel: 'x', status: 'draft' as never })]]]),
      NOW,
    )
    const channels = out.get('post-1')?.map((entry) => entry.channel)
    // The draft channel is present with its own state — a missing entry would read
    // as "this channel has nothing to say" instead of "we never asked".
    expect(channels).toEqual(['instagram', 'x'])
  })

  it('never calls for a channel with no platform id', async () => {
    await listPostMetrics(new Map([['post-1', [row({ platformPostId: null })]]]), NOW)
    expect(reads.postAnalytics).not.toHaveBeenCalled()
  })

  it('never calls for an unpublished channel', async () => {
    await listPostMetrics(new Map([['post-1', [row({ status: 'failed' as never })]]]), NOW)
    expect(reads.postAnalytics).not.toHaveBeenCalled()
  })
})

describe('nothing here throws, and nothing degrades to a zero', () => {
  it('survives a workspace lookup that throws', async () => {
    workspace.getActiveWorkspace.mockRejectedValue(new Error('no session'))
    const out = await listPostMetrics(new Map([['post-1', [row()]]]), NOW)
    expect(out.get('post-1')?.[0]?.state).toMatchObject({ kind: 'unavailable' })
  })

  it('survives a publish-log query that throws', async () => {
    supabase.createServerSupabase.mockImplementation(() => {
      throw new Error('db down')
    })
    const out = await listPostMetrics(new Map([['post-1', [row()]]]), NOW)
    expect(out.get('post-1')?.[0]?.state).toMatchObject({ kind: 'unavailable' })
  })

  it('reports unreadable — not a measurement — when the call throws', async () => {
    reads.postAnalytics.mockRejectedValue(new Error('502'))
    const out = await listPostMetrics(new Map([['post-1', [row()]]]), NOW)
    expect(out.get('post-1')?.[0]?.state).toEqual({ kind: 'unavailable', reason: 'unreadable' })
  })

  it('says not-connected when the workspace has no Zernio profile', async () => {
    scope.profileForWorkspace.mockRejectedValue(new Error('no profile'))
    const out = await listPostMetrics(new Map([['post-1', [row()]]]), NOW)
    expect(out.get('post-1')?.[0]?.state).toEqual({ kind: 'unavailable', reason: 'not-connected' })
  })
})

describe('the call ceiling is honest about itself', () => {
  it('stops calling past the cap', async () => {
    const posts = new Map(
      Array.from({ length: LIST_METRIC_CALLS + 3 }, (_, i) => [`post-${i}`, [row()]] as const),
    )
    await listPostMetrics(posts, NOW)
    expect(reads.postAnalytics).toHaveBeenCalledTimes(LIST_METRIC_CALLS)
  })

  it('marks the skipped ones not-loaded, never unreadable or zero', async () => {
    const posts = new Map(
      Array.from({ length: LIST_METRIC_CALLS + 1 }, (_, i) => [`post-${i}`, [row()]] as const),
    )
    const out = await listPostMetrics(posts, NOW)
    const last = out.get(`post-${LIST_METRIC_CALLS}`)?.[0]?.state
    // "unreadable" would advise a refresh, which cannot help — the cap is the same
    // next time. Nothing failed here.
    expect(last).toEqual({ kind: 'unavailable', reason: 'not-loaded' })
  })

  it('honours a caller-supplied ceiling, so the detail view is not capped like a list', async () => {
    const posts = new Map([['post-1', [row(), row({ channel: 'x' })]]])
    await listPostMetrics(posts, NOW, 1)
    expect(reads.postAnalytics).toHaveBeenCalledTimes(1)
  })
})

describe('a fetched verdict overwrites the seeded one', () => {
  it('reports a real measurement when the call succeeds', async () => {
    const out = await listPostMetrics(new Map([['post-1', [row()]]]), NOW)
    const state = out.get('post-1')?.[0]?.state
    expect(state).toMatchObject({ kind: 'ready' })
    if (state?.kind !== 'ready') throw new Error('expected ready')
    expect(state.metrics.impressions).toBe(10)
  })

  it('passes the scoped profile to every call — never a bare string', async () => {
    await listPostMetrics(new Map([['post-1', [row()]]]), NOW)
    expect(reads.postAnalytics).toHaveBeenCalledWith(
      '6a75cae32853ee463c6419d6',
      '18104441855596739',
    )
  })
})
