import { describe, it, expect } from 'vitest'

import {
  classifyPostMetrics,
  reportingWindowFor,
  type MetricAvailability,
  type ZernioPostAnalytics,
} from '@sahoda/publishing'
import type { Channel } from '@sahoda/shared'

import listing from '@sahoda/publishing/fixtures/zernio/analytics.listing.2026-08-11.json'
import {
  byChannel,
  coverageFor,
  coverageNote,
  rankBy,
  totalFor,
  unmeasuredFor,
  type ComparableRow,
} from '@/lib/analytics/compare'

/**
 * ── THE PAGE, DRIVEN BY THE LIVE SWEEP ───────────────────────────────────────
 * Every other test of this surface builds its own rows, and a row built by hand
 * can only ever confirm what its author believed the API returns. This one starts
 * from `analytics.listing.2026-08-11.json` — 8 published posts across 2 accounts,
 * captured off the live endpoint — and pushes it through the SAME two steps the
 * page does: classify each leg, then compare.
 *
 * It is a unit test in mechanism and an integration test in evidence. What it can
 * catch that the others cannot: a real payload whose shape breaks the row build, a
 * channel mix that makes a total misleading, and any drift between what the
 * classifier decides and what the tables then say about it.
 */

interface Leg {
  platform?: string
  platformPostId?: string | null
  status?: string
  syncStatus?: string
  analytics?: Record<string, unknown>
}
interface ListedPost {
  _id?: string
  content?: string
  publishedAt?: string
  status?: string
  platforms?: Leg[]
}

const posts = (listing.body as { posts?: ListedPost[] }).posts ?? []

/** The moment of capture, so every "is it inside the window" answer is the real one. */
const CAPTURED = new Date(listing._recorded.capturedAt)

/**
 * The listing's own shape, turned into the single-post shape the classifier reads.
 *
 * The two genuinely differ — the listing spells the legs `platforms` and the id
 * `_id`, the single-post answer spells them `platformAnalytics` and `postId`. That
 * discrepancy is itself recorded here rather than smoothed over silently.
 */
function asResult(post: ListedPost, leg: Leg) {
  return {
    status: 200,
    post: {
      postId: post._id,
      publishedAt: post.publishedAt,
      analytics: leg.analytics,
      platformAnalytics: [
        {
          platform: leg.platform ?? '',
          status: leg.status ?? 'published',
          platformPostId: leg.platformPostId ?? null,
          syncStatus: leg.syncStatus,
        },
      ],
    } as ZernioPostAnalytics,
  }
}

/** Exactly what `page-data.ts` builds, from the recording instead of the database. */
const rows: ComparableRow[] = posts.flatMap((post) =>
  (post.platforms ?? [])
    .filter((leg) => leg.status === 'published')
    .map((leg): ComparableRow => {
      const channel = leg.platform as Channel
      const state: MetricAvailability = classifyPostMetrics({
        result: asResult(post, leg),
        platformPostId: leg.platformPostId ?? null,
        published: true,
        simulated: false,
        publishedAt: post.publishedAt ?? null,
        now: CAPTURED,
        window: reportingWindowFor(channel),
      })
      return {
        postId: post._id ?? '',
        title: (post.content ?? '').slice(0, 40) || 'Untitled post',
        channel,
        state,
      }
    }),
)

describe('the live sweep, through the page’s own pipeline', () => {
  it('builds one row per published leg, on two real channels', () => {
    expect(rows).toHaveLength(8)
    expect(new Set(rows.map((r) => r.channel))).toEqual(new Set(['instagram', 'linkedin']))
  })

  /**
   * The uniqueness `post-table`'s React keys and every denominator rely on. Held by
   * `unique (post_id, channel)` on `post_variants` — asserted against real data as
   * well, because the guarantee that matters is the one the rows actually have.
   */
  it('has a unique (postId, channel) for every row', () => {
    const keys = rows.map((r) => `${r.postId}:${r.channel}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  /**
   * Every one of the eight reported at capture time, so this sweep exercises the
   * FULL-coverage sentence. That is worth pinning: it is the reading a partial
   * denominator has to be different from.
   */
  it('reports full coverage, and says so without qualification', () => {
    const coverage = coverageFor(rows, 'impressions')
    expect(coverage).toEqual({ counted: 8, of: 8 })
    expect(coverageNote(coverage)).toBe('All 8 channels reported.')
  })

  /**
   * The comparison the whole lane exists for. LinkedIn's single post out-reaches
   * all five recent Instagram posts combined — a true pair of numbers that would be
   * a false comparison without the per-channel denominators beside it.
   */
  it('rolls the two channels up on their own denominators', () => {
    const rollups = byChannel(rows, 'impressions')
    const linkedin = rollups.find((r) => r.channel === 'linkedin')
    const instagram = rollups.find((r) => r.channel === 'instagram')

    expect(linkedin?.total).toEqual({ value: 61, coverage: { counted: 1, of: 1 } })
    expect(instagram?.total?.coverage).toEqual({ counted: 7, of: 7 })
    // One LinkedIn post against seven Instagram ones, and it leads on impressions.
    expect(linkedin?.total?.value).toBeGreaterThan(instagram?.total?.value ?? 0)
  })

  it('ranks the LinkedIn post first, on its real number', () => {
    const ranked = rankBy(rows, 'impressions')
    expect(ranked).toHaveLength(8)
    expect(ranked[0]?.channel).toBe('linkedin')
    expect(ranked[0]?.value).toBe(61)
    // Nothing is waiting in this sweep, so the "not ranked" list is empty and the
    // ranking is the whole population — which is exactly when a total is safe.
    expect(unmeasuredFor(rows, 'impressions')).toEqual([])
    expect(totalFor(rows, 'impressions')?.coverage).toEqual({ counted: 8, of: 8 })
  })

  /**
   * The poll stamp survives into the rows unchanged in MEANING: three distinct
   * stamps across eight posts, normalised to ISO on the way through. A page that
   * printed one of these as "measured at" per post would be repeating the exact
   * mistake `analytics-state.ts` was written to stop.
   */
  it('carries three distinct sync stamps, normalised to ISO', () => {
    const stamps = new Set(rankBy(rows, 'impressions').map((r) => r.measuredAt))
    expect(stamps.size).toBe(3)
    for (const stamp of stamps) {
      expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
      expect(Number.isNaN(new Date(stamp).getTime())).toBe(false)
    }
  })

  /**
   * The regression guard for this lane's fix, on live data rather than a
   * constructed one. Before it, the LinkedIn leg was judged against Instagram's
   * 48 hours; it happens to report real numbers here, so what the fix has to
   * preserve is that the numbers still come through.
   */
  it('does not let the unknown LinkedIn window suppress a real reading', () => {
    const linkedin = rows.find((r) => r.channel === 'linkedin')
    expect(reportingWindowFor('linkedin')).toEqual({ known: false })
    expect(linkedin?.state.kind).toBe('ready')
    if (linkedin?.state.kind !== 'ready') return
    expect(linkedin.state.metrics.impressions).toBe(61)
    expect(linkedin.state.metrics.reach).toBe(36)
  })
})
