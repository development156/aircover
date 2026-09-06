import { describe, expect, it } from 'vitest'

import { analyticsKpis, bestPostOf, engagementRateOf, sumAt } from '@/lib/analytics/kpi'
import type { PublishedRow } from '@/lib/analytics/window-data'

const row = (over: Partial<PublishedRow> = {}): PublishedRow => ({
  postId: 'p1',
  title: 'A post',
  channel: 'instagram',
  publishedAt: '2026-08-10T09:00:00Z',
  reachAtAge: 100,
  impressionsAtAge: 140,
  engagementAtAge: 10,
  ...over,
})

/**
 * ── WHAT THESE ASSERT, AND WHY EVERY ONE OF THEM IS ABOUT A NULL ─────────────
 * Every figure on this strip is a SUM over rows that may not carry a reading,
 * and the only way to get a sum wrong here is to treat "we hold no reading" as
 * a zero. A zero is a measurement of nothing; a null is the absence of a
 * measurement. The first understates a total and drags a rate down; the second
 * is the truth and renders as the absence mark.
 */
describe('sumAt', () => {
  it('adds only the rows that carry a reading and says how many did', () => {
    const result = sumAt([row({ reachAtAge: 100 }), row({ reachAtAge: 50 })], 'reachAtAge')
    expect(result).toEqual({ total: 150, measured: 2, posts: 2 })
  })

  it('never counts an unmeasured row as a zero', () => {
    const result = sumAt([row({ reachAtAge: 100 }), row({ reachAtAge: null })], 'reachAtAge')
    expect(result.total).toBe(100)
    expect(result.measured).toBe(1)
    expect(result.posts).toBe(2)
  })

  it('answers null, not zero, when nothing was measured at all', () => {
    const result = sumAt([row({ reachAtAge: null })], 'reachAtAge')
    expect(result.total).toBeNull()
    expect(result.measured).toBe(0)
  })

  it('keeps a measured zero, which is a real reading', () => {
    expect(sumAt([row({ reachAtAge: 0 })], 'reachAtAge')).toEqual({
      total: 0,
      measured: 1,
      posts: 1,
    })
  })
})

describe('engagementRateOf', () => {
  it('divides engagement by reach over the rows that carry BOTH', () => {
    // The row missing reach contributes to neither half. Counting its engagement
    // over a reach it has no reading for would inflate the rate by construction.
    const rows = [
      row({ engagementAtAge: 10, reachAtAge: 100 }),
      row({ engagementAtAge: 40, reachAtAge: null }),
    ]
    expect(engagementRateOf(rows)).toEqual({ rate: 0.1, measured: 1, posts: 2 })
  })

  it('is null when no row carries both, rather than a rate of zero', () => {
    expect(engagementRateOf([row({ reachAtAge: null })]).rate).toBeNull()
  })

  it('is null rather than infinite when every measured reach is zero', () => {
    // A post reported to nobody that somehow carries engagement is not a rate of
    // infinity, and it is not 0% either.
    expect(engagementRateOf([row({ reachAtAge: 0, engagementAtAge: 3 })]).rate).toBeNull()
  })
})

describe('bestPostOf', () => {
  it('picks the highest measured engagement', () => {
    const best = bestPostOf([
      row({ postId: 'a', engagementAtAge: 5 }),
      row({ postId: 'b', engagementAtAge: 90, title: 'The winner' }),
    ])
    expect(best?.postId).toBe('b')
    expect(best?.title).toBe('The winner')
  })

  it('never falls back to reach when engagement was not measured', () => {
    // Ranking by reach under a label that says engagement is the quiet version
    // of showing a number nobody measured.
    expect(bestPostOf([row({ engagementAtAge: null, reachAtAge: 9999 })])).toBeNull()
  })
})

describe('analyticsKpis', () => {
  const base = {
    rows: [row({ reachAtAge: 100, engagementAtAge: 10 })],
    previousRows: [row({ postId: 'old', reachAtAge: 50, engagementAtAge: 10 })],
    postsPublished: 1,
    postsPublishedPrevious: 1,
    weeksOfHistory: 12,
    followers: { kind: 'ready' as const, value: 1200 },
  }

  it('offers all five cards, always, so an absence is visible as an absence', () => {
    expect(analyticsKpis(base).map((kpi) => kpi.id)).toEqual([
      'engagement-rate',
      'reach-total',
      'followers',
      'posts',
      'best-post',
    ])
  })

  it('compares this window with the previous one at the same age', () => {
    const reach = analyticsKpis(base).find((kpi) => kpi.id === 'reach-total')
    expect(reach?.value).toBe(100)
    expect(reach?.footer).toEqual({
      kind: 'change',
      change: { kind: 'compared', direction: 'up', percent: 100, previous: 50 },
    })
  })

  it('refuses a comparison when the previous window measured nothing', () => {
    const reach = analyticsKpis({ ...base, previousRows: [] }).find(
      (kpi) => kpi.id === 'reach-total',
    )
    expect(reach?.footer).toEqual({ kind: 'change', change: { kind: 'no-previous' } })
  })

  it('links the best post to the post it is about', () => {
    const best = analyticsKpis(base).find((kpi) => kpi.id === 'best-post')
    expect(best?.link?.href).toBe('/posts/p1')
    expect(best?.text).toBe('A post')
  })

  it('states the follower figure as a reading of now, never of the window', () => {
    // Instagram answers the CURRENT count. Differencing it against a window it
    // was not read for would be a change nobody measured.
    const followers = analyticsKpis(base).find((kpi) => kpi.id === 'followers')
    expect(followers?.value).toBe(1200)
    expect(followers?.footer.kind).toBe('note')
  })

  it('keeps "no account connected" apart from "the read failed"', () => {
    const connected = analyticsKpis({
      ...base,
      followers: { kind: 'absent', absence: 'not-connected' },
    }).find((kpi) => kpi.id === 'followers')
    const failed = analyticsKpis({
      ...base,
      followers: { kind: 'absent', absence: 'unreadable' },
    }).find((kpi) => kpi.id === 'followers')

    expect(connected?.value).toBeNull()
    expect(connected?.absence).toBe('not-connected')
    expect(failed?.absence).toBe('unreadable')
    expect(connected?.absence).not.toBe(failed?.absence)
  })
})
