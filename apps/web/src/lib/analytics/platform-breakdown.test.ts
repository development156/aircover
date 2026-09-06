import { describe, expect, it } from 'vitest'

import { ENGAGEMENT_PARTS, platformRows } from '@/lib/analytics/platform-breakdown'
import type { ZernioDailyPlatformRow } from '@sahoda/publishing'

const platform = (over: Partial<ZernioDailyPlatformRow> = {}): ZernioDailyPlatformRow => ({
  platform: 'instagram',
  postCount: 10,
  impressions: 1000,
  reach: 800,
  likes: 40,
  comments: 10,
  shares: 5,
  saves: 5,
  clicks: 20,
  views: 900,
  ...over,
})

describe('platformRows', () => {
  it('carries every metric through and orders by posts', () => {
    const rows = platformRows([
      platform({ platform: 'linkedin', postCount: 2 }),
      platform({ platform: 'instagram', postCount: 9 }),
    ])
    expect(rows.map((row) => row.platform)).toEqual(['instagram', 'linkedin'])
    expect(rows[0]?.saves).toBe(5)
    expect(rows[0]?.posts).toBe(9)
  })

  it('computes the engagement rate from the four parts over reach', () => {
    // 60 interactions over 800 reached.
    expect(platformRows([platform()])[0]?.engagementRate).toBeCloseTo(0.075, 6)
  })

  it('refuses a rate when one of the four parts was not reported', () => {
    // A numerator missing saves is a SUBTOTAL, and a rate built on one is
    // understated with nothing on the screen to say so. The absence mark is the
    // honest answer, and the row still shows every part it does hold.
    const rows = platformRows([platform({ saves: null })])
    expect(rows[0]?.engagementRate).toBeNull()
    expect(rows[0]?.likes).toBe(40)
    expect(rows[0]?.measuredParts).toBe(ENGAGEMENT_PARTS.length - 1)
  })

  it('refuses a rate when reach was not reported', () => {
    expect(platformRows([platform({ reach: null })])[0]?.engagementRate).toBeNull()
  })

  it('refuses a rate rather than dividing by a measured zero reach', () => {
    // Not infinity, and not 0%. A platform that reached nobody and reported
    // interactions is a contradiction in its own numbers.
    expect(platformRows([platform({ reach: 0 })])[0]?.engagementRate).toBeNull()
  })

  it('keeps a measured zero as a reading', () => {
    const rows = platformRows([platform({ likes: 0, comments: 0, shares: 0, saves: 0 })])
    expect(rows[0]?.likes).toBe(0)
    expect(rows[0]?.engagementRate).toBe(0)
    expect(rows[0]?.measuredParts).toBe(ENGAGEMENT_PARTS.length)
  })

  it('is empty for an empty breakdown, rather than a row of dashes', () => {
    expect(platformRows([])).toEqual([])
  })
})
