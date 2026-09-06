import type { ZernioDailyPlatformRow } from '@sahoda/publishing'

/**
 * ONE ROW PER PLATFORM, AND THE ONE RATIO IT IS ALLOWED TO COMPUTE.
 *
 * ── EVERY FIGURE IN A ROW COMES FROM THE SAME SOURCE ─────────────────────────
 * Zernio's `platformBreakdown` for the chosen window, and nothing else. It is
 * tempting to fill the impressions and reach columns from
 * `post_metric_snapshots` instead, since this product stores those two: the
 * result would be a row whose ten numbers came from two systems that counted
 * different posts over different bases, and no reader could tell. One source
 * per row, and the caption says which.
 *
 * That has a cost worth stating on the screen: Zernio counts posts it knows
 * about, which includes ones imported from the platform and never published
 * through Sahoda, so this "posts" column can differ from the count in the strip
 * at the top. Two different questions, both answered honestly.
 *
 * ── THE RATE REFUSES A SUBTOTAL NUMERATOR ────────────────────────────────────
 * Engagement rate is likes + comments + shares + saves, over reach. All four
 * parts have to be present: a numerator missing saves is a subtotal, and a rate
 * built on one is understated with nothing on the screen to say so. So the row
 * carries how many of the four it holds, the rate is null unless it holds all
 * of them, and the table draws the absence mark rather than a smaller truth.
 *
 * Pure: no I/O, no clock, no React.
 */

/** The four interactions a rate's numerator is made of. */
export const ENGAGEMENT_PARTS = ['likes', 'comments', 'shares', 'saves'] as const

export type EngagementPart = (typeof ENGAGEMENT_PARTS)[number]

export interface PlatformBreakdownRow {
  /** Zernio's own platform key: `instagram`, `twitter`, `facebook`. */
  platform: string
  /** Posts Zernio holds for this platform in the window. */
  posts: number
  likes: number | null
  comments: number | null
  shares: number | null
  saves: number | null
  clicks: number | null
  views: number | null
  impressions: number | null
  reach: number | null
  /** A fraction, or null. Never a rate built on a partial numerator. */
  engagementRate: number | null
  /** How many of the four parts were reported. Printed when short of four. */
  measuredParts: number
}

export function platformRows(breakdown: readonly ZernioDailyPlatformRow[]): PlatformBreakdownRow[] {
  return (
    breakdown
      .map((row): PlatformBreakdownRow => {
        const parts = ENGAGEMENT_PARTS.map((part) => row[part])
        const measuredParts = parts.filter((value) => value !== null).length
        const interactions = parts.reduce<number>((sum, value) => sum + (value ?? 0), 0)
        const engagementRate =
          measuredParts === ENGAGEMENT_PARTS.length && row.reach !== null && row.reach > 0
            ? interactions / row.reach
            : null

        return {
          platform: row.platform,
          posts: row.postCount,
          likes: row.likes,
          comments: row.comments,
          shares: row.shares,
          saves: row.saves,
          clicks: row.clicks,
          views: row.views,
          impressions: row.impressions,
          reach: row.reach,
          engagementRate,
          measuredParts,
        }
      })
      // Ties broken by name, so two platforms with the same count do not swap
      // places between renders and read as a change.
      .sort((a, b) => b.posts - a.posts || a.platform.localeCompare(b.platform))
  )
}
