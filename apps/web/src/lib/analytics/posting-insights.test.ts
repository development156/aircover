import { describe, expect, it } from 'vitest'

import { followerSeries } from '@/lib/analytics/posting-insights'
import type { ZernioFollowerAccount } from '@sahoda/publishing'

const account = (over: Partial<ZernioFollowerAccount> = {}): ZernioFollowerAccount => ({
  id: 'acc_a',
  platform: 'instagram',
  username: '@shop',
  currentFollowers: 1200,
  growth: 30,
  growthPercentage: 2.5,
  dataPoints: 30,
  ...over,
})

describe('followerSeries', () => {
  it('joins each account to its own points and orders by platform', () => {
    const series = followerSeries(
      [account({ id: 'b', platform: 'linkedin' }), account({ id: 'a', platform: 'facebook' })],
      { a: [{ date: '2026-08-01', followers: 10 }], b: [] },
    )
    expect(series.map((entry) => entry.platform)).toEqual(['facebook', 'linkedin'])
    expect(series[0]?.points).toHaveLength(1)
  })

  it('keeps an account with no history, with no points rather than a zero', () => {
    // An account connected this week has no history yet. That is not an account
    // at zero followers, and the chart must be able to tell them apart.
    const series = followerSeries([account()], {})
    expect(series[0]?.points).toEqual([])
    expect(series[0]?.currentFollowers).toBe(1200)
  })

  it('carries a null current count through rather than defaulting it', () => {
    expect(
      followerSeries([account({ currentFollowers: null })], {})[0]?.currentFollowers,
    ).toBeNull()
  })
})
