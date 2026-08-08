import { describe, it, expect } from 'vitest'
import { lagHoursFromDataDelay } from '@sahoda/publishing'

import {
  seriesFrom,
  INSTAGRAM_FOLLOWER_LAG_HOURS,
  INSTAGRAM_INSIGHTS_LAG_HOURS,
} from '@/lib/analytics/account-insights'

/**
 * Instagram reports follower history and account insights on DIFFERENT delays, from
 * different endpoints with their own `dataDelay`. They must never be collapsed into
 * one number: printing the shorter delay under the slower figures claims those
 * numbers are fresher than Instagram says they are, which is a false freshness claim
 * — exactly the class of lie the rest of this feature refuses to tell.
 */
describe('the two lags stay apart', () => {
  it('uses a longer default for insights than for follower history', () => {
    expect(INSTAGRAM_INSIGHTS_LAG_HOURS).toBe(48)
    expect(INSTAGRAM_FOLLOWER_LAG_HOURS).toBe(24)
    expect(INSTAGRAM_INSIGHTS_LAG_HOURS).toBeGreaterThan(INSTAGRAM_FOLLOWER_LAG_HOURS)
  })

  it('never lets one endpoint’s stated delay stand in for the other’s', () => {
    // If only the follower endpoint states a delay, insights must fall back to its
    // OWN constant — borrowing 24h here would under-state the insight delay.
    const followerStated = lagHoursFromDataDelay('24 hours')
    const insightsUnstated = lagHoursFromDataDelay(undefined)
    expect(followerStated).toBe(24)
    expect(insightsUnstated).toBeNull()
    expect(insightsUnstated ?? INSTAGRAM_INSIGHTS_LAG_HOURS).toBe(48)
  })
})

/**
 * Zernio hands follower history back as `Record<string, unknown>`, so every point is
 * untyped until this function narrows it. The rule under test is the same one the
 * post half enforces: an unreadable point is DROPPED, never coerced to 0. A zero on
 * a follower chart is a cliff, and a fabricated cliff is worse than a short line.
 */
describe('follower series narrowing', () => {
  it('reads an array of points', () => {
    expect(
      seriesFrom(
        {
          follower_count: [
            { date: '2026-08-01', value: 1200 },
            { date: '2026-08-02', value: 1214 },
          ],
        },
        'follower_count',
      ),
    ).toEqual([
      { date: '2026-08-01', value: 1200 },
      { date: '2026-08-02', value: 1214 },
    ])
  })

  it('reads a date→value object, oldest first', () => {
    expect(seriesFrom({ f: { '2026-08-02': 1214, '2026-08-01': 1200 } }, 'f')).toEqual([
      { date: '2026-08-01', value: 1200 },
      { date: '2026-08-02', value: 1214 },
    ])
  })

  it('DROPS a point whose value is not a number instead of calling it 0', () => {
    const points = seriesFrom(
      {
        f: [
          { date: '2026-08-01', value: 1200 },
          { date: '2026-08-02', value: null },
          { date: '2026-08-03', value: 'n/a' },
          { date: '2026-08-04' },
        ],
      },
      'f',
    )
    expect(points).toEqual([{ date: '2026-08-01', value: 1200 }])
  })

  it('keeps a genuine zero, which is a measurement', () => {
    expect(seriesFrom({ f: [{ date: '2026-08-01', value: 0 }] }, 'f')).toEqual([
      { date: '2026-08-01', value: 0 },
    ])
  })

  it('drops non-finite numbers rather than plotting them', () => {
    expect(seriesFrom({ f: [{ date: '2026-08-01', value: Number.NaN }] }, 'f')).toEqual([])
  })

  it('accepts the alternate field names Zernio uses', () => {
    expect(seriesFrom({ f: [{ end_time: '2026-08-01', count: 42 }] }, 'f')).toEqual([
      { date: '2026-08-01', value: 42 },
    ])
  })

  it.each([
    ['a missing key', {}],
    ['a string', { f: 'nope' }],
    ['a number', { f: 7 }],
    ['null', { f: null }],
  ])('returns an empty series for %s', (_name, metrics) => {
    expect(seriesFrom(metrics as Record<string, unknown>, 'f')).toEqual([])
  })
})
