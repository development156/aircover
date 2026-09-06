import { describe, expect, it } from 'vitest'

import {
  LIVE_METRIC_LABELS,
  LIVE_METRICS,
  dailyPoints,
  dailyTotals,
  type LiveMetric,
} from '@/lib/analytics/daily-metrics'
import type { ZernioDailyMetricsDay } from '@sahoda/publishing'

const day = (
  date: string,
  over: Partial<ZernioDailyMetricsDay['metrics']> = {},
): ZernioDailyMetricsDay => ({
  date,
  postCount: 1,
  platforms: { instagram: 1 },
  metrics: {
    impressions: null,
    reach: null,
    likes: null,
    comments: null,
    shares: null,
    saves: null,
    clicks: null,
    views: null,
    ...over,
  },
})

/**
 * ── THE ONE MISTAKE THESE EXIST TO STOP ──────────────────────────────────────
 * Zernio types all eight metrics as integers and sends all eight in its
 * example, so the tempting shape is `metrics.saves` straight onto a chart. A
 * response that omits one then draws a zero, which on a line chart is a cliff
 * that never happened, and on a total is a number smaller than the truth with
 * nothing on the screen to say so.
 */
describe('dailyTotals', () => {
  it('adds a metric across the days that carry it and says how many did', () => {
    const totals = dailyTotals([day('2026-08-01', { likes: 10 }), day('2026-08-02', { likes: 5 })])
    expect(totals.likes).toEqual({ total: 15, days: 2, measured: 2 })
  })

  it('answers a null total for a metric no day reported', () => {
    const totals = dailyTotals([day('2026-08-01', { likes: 10 })])
    expect(totals.likes.total).toBe(15 - 5)
    expect(totals.saves.total).toBeNull()
    expect(totals.saves.measured).toBe(0)
    // The days were still read. "We asked and this metric came back empty" is
    // not "we did not ask".
    expect(totals.saves.days).toBe(1)
  })

  it('keeps a measured zero apart from a metric that was never reported', () => {
    const totals = dailyTotals([day('2026-08-01', { likes: 0 })])
    expect(totals.likes.total).toBe(0)
    expect(totals.likes.measured).toBe(1)
    expect(totals.comments.total).toBeNull()
  })

  it('covers every metric the toggles offer, so a legend never has a hole', () => {
    const totals = dailyTotals([])
    for (const metric of LIVE_METRICS) {
      expect(totals[metric]).toEqual({ total: null, days: 0, measured: 0 })
      expect(LIVE_METRIC_LABELS[metric].length).toBeGreaterThan(0)
    }
  })
})

describe('dailyPoints', () => {
  it('plots only the days that carry the metric, in date order', () => {
    const points = dailyPoints(
      [day('2026-08-03', { likes: 3 }), day('2026-08-01', { likes: 1 })],
      'likes',
    )
    expect(points).toEqual([
      { day: '2026-08-01', value: 1 },
      { day: '2026-08-03', value: 3 },
    ])
  })

  it('leaves a day out entirely rather than plotting a zero for it', () => {
    // No point at all, so the line breaks there. A zero would draw a fall the
    // platform never reported.
    const points = dailyPoints([day('2026-08-01', { likes: 4 }), day('2026-08-02')], 'likes')
    expect(points).toEqual([{ day: '2026-08-01', value: 4 }])
  })

  it('plots a measured zero, because somebody looked and the answer was none', () => {
    expect(dailyPoints([day('2026-08-01', { likes: 0 })], 'likes')).toEqual([
      { day: '2026-08-01', value: 0 },
    ])
  })

  it('reads every metric it offers off the same shape', () => {
    const rich = day('2026-08-01', {
      likes: 1,
      comments: 2,
      shares: 3,
      saves: 4,
      clicks: 5,
      views: 6,
      impressions: 7,
      reach: 8,
    })
    for (const metric of LIVE_METRICS satisfies readonly LiveMetric[]) {
      expect(dailyPoints([rich], metric)).toHaveLength(1)
    }
  })
})
