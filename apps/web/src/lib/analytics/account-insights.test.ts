import { describe, it, expect } from 'vitest'
import { lagHoursFromDataDelay } from '@sahoda/publishing'
import liveInsights from '@sahoda/publishing/fixtures/zernio/account-insights.total-value.json'
import liveHistory from '@sahoda/publishing/fixtures/zernio/follower-history.time-series.json'
import liveHistoryTotals from '@sahoda/publishing/fixtures/zernio/follower-history.total-value.json'

import {
  insightTiles,
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

/**
 * RECORDED FROM THE LIVE API on 2026-08-10, account `testingg53`.
 *
 * The three bags below are imported from `fixtures/zernio/`, captured off the live
 * endpoints — not authored here. Both endpoints answered HTTP 200 with real data on the
 * day this surface was first pointed at them, and this module rendered NONE of it.
 *
 * Every assertion below failed when written. Each one is a shape this file had guessed,
 * and the guesses were all reasonable and all wrong the same way: metrics were assumed
 * to be flat numbers under Meta's own metric names. They are neither.
 *
 * See `fixtures/zernio/README.md` — re-capture those files, never edit them.
 */
const LIVE_ACCOUNT_INSIGHTS = liveInsights.body.metrics as Record<string, unknown>
const LIVE_FOLLOWER_HISTORY = liveHistory.body.metrics as Record<string, unknown>
const LIVE_FOLLOWER_TOTALS = liveHistoryTotals.body.metrics as Record<string, unknown>

describe('the live metrics bag (recorded 2026-08-10)', () => {
  /**
   * The bug this replaces was not a silent empty — it was a FABRICATION.
   *
   * `seriesFrom` fell through to its date→value branch, ran `Object.entries({total: 1})`
   * and produced `[{ date: 'total', value: 1 }]`: a one-point chart whose x-axis label
   * is a JSON key. The card then read "1 — No change over 1 day", which is a sentence
   * about data that does not exist. An empty chart would have been honest; this was not.
   */
  it('never turns a { total } bag into a point dated "total"', () => {
    expect(seriesFrom(LIVE_FOLLOWER_TOTALS, 'follower_count')).toEqual([])
  })

  it('reads the nested time-series Zernio returns for follower history', () => {
    expect(seriesFrom(LIVE_FOLLOWER_HISTORY, 'follower_count')).toEqual([
      { date: '2026-08-08', value: 0 },
      { date: '2026-08-09', value: 1 },
      { date: '2026-08-10', value: 1 },
    ])
  })

  /**
   * A daily series is keyed by DATES. Anything else in that position is a shape we did
   * not expect, and guessing at it is how `total` became an axis label.
   */
  it('drops object entries whose key is not a date', () => {
    expect(seriesFrom({ s: { total: 1, ok: 2 } }, 's')).toEqual([])
    expect(seriesFrom({ s: { '2026-08-09': 4 } }, 's')).toEqual([{ date: '2026-08-09', value: 4 }])
  })

  /**
   * Every tile vanished. `INSIGHT_KEYS` asked for `impressions` and `profile_views`,
   * which this response does not contain at all, and read `reach` as a flat number when
   * it arrives as `{ total: 1 }` — so all four were filtered out and the card claimed
   * Instagram had reported nothing while holding four numbers.
   */
  it('reads a { total } tile, and asks for the keys that exist', () => {
    expect(insightTiles(LIVE_ACCOUNT_INSIGHTS)).toEqual([
      { label: 'Reach', value: 1 },
      { label: 'Views', value: 7 },
      { label: 'Accounts engaged', value: 1 },
      { label: 'Interactions', value: 2 },
    ])
  })

  /** An absent metric is still absent — this must not invent a 0 to fill the tile. */
  it('omits a tile the response did not carry', () => {
    expect(insightTiles({ reach: { total: 3 } })).toEqual([{ label: 'Reach', value: 3 }])
  })

  /** A reported zero IS a number and keeps its tile — the rule is no INVENTED zeroes. */
  it('keeps a tile reported as zero', () => {
    expect(insightTiles({ reach: { total: 0 } })).toEqual([{ label: 'Reach', value: 0 }])
  })

  /**
   * The two endpoints state their own delays, and they differ. Pinned against the
   * recordings so a change in Zernio's wording cannot silently collapse them into one.
   */
  it('carries a different stated delay on each endpoint', () => {
    expect(lagHoursFromDataDelay(liveHistory.body.dataDelay)).toBe(24)
    expect(lagHoursFromDataDelay(liveInsights.body.dataDelay)).toBe(48)
  })
})
