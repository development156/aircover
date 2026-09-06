import 'server-only'

import type {
  ScopedProfileId,
  ZernioDailyMetricsDay,
  ZernioDailyPlatformRow,
  ZernioReads,
} from '@sahoda/publishing'

import { ScopeError, profileForWorkspace } from '@/lib/zernio/scope'
import { zernioClientReads } from '@/lib/zernio/server'
import { activeWorkspaceRead } from '@/lib/workspaces'

/**
 * THE SIX METRICS THIS PRODUCT CANNOT STORE, READ LIVE FROM ZERNIO.
 *
 * ── WHY THIS EXISTS BESIDE `series.ts` RATHER THAN INSIDE IT ─────────────────
 * `post_metric_snapshots` holds three metrics: impressions, reach, and one
 * summed `engagement` with the parts thrown away. Likes, comments, shares,
 * saves, clicks and views exist nowhere in this database and cannot be
 * back-filled, because platforms report only current numbers.
 * `GET /analytics/daily-metrics` is the only place they can come from.
 *
 * Two sources, and they do NOT measure the same thing, which is why they are
 * two files and why the chart prints which one it is drawing:
 *
 *   `series.ts`     running LIFETIME totals per post, summed across the
 *                   post-channels measured that day. A day is "everything every
 *                   post has ever earned, as of that day".
 *   this file       Zernio's own daily aggregate, asked for with
 *                   `attribution: 'received'`, which buckets the per-day
 *                   INCREASE by the day it arrived. A day is "what came in that
 *                   day".
 *
 * `received` is chosen and passed explicitly rather than left to Zernio's
 * default of `publish`, because `publish` sums a post's lifetime total onto its
 * publish date: the axis would say "day" and mean "day a post went out", which
 * is a third thing again. The choice is stated on the screen.
 *
 * ── THREE ANSWERS, AND ONLY ONE OF THEM IS ABOUT THE CUSTOMER ────────────────
 * `not-connected` is "no Zernio profile for this workspace, so nothing could be
 * asked". `unreadable` is everything else, INCLUDING the 402 add-on refusal:
 * the accounts are connected and the plan does not carry Analytics, which is
 * not a fact about the shop and must never send somebody to /connections to
 * reconnect an account that is already connected.
 *
 * NEVER REJECTS. A hiccup here costs this chart and nothing else on the page.
 */

/** The six Zernio-only metrics, plus the two it also reports. */
export const LIVE_METRICS = [
  'likes',
  'comments',
  'shares',
  'saves',
  'views',
  'clicks',
  'impressions',
  'reach',
] as const

export type LiveMetric = (typeof LIVE_METRICS)[number]

export const LIVE_METRIC_LABELS: Readonly<Record<LiveMetric, string>> = {
  likes: 'Likes',
  comments: 'Comments',
  shares: 'Shares',
  saves: 'Saves',
  views: 'Views',
  clicks: 'Clicks',
  impressions: 'Impressions',
  reach: 'Reach',
}

export interface LiveTotal {
  /** Null when NO day reported this metric. Never a zero standing in for that. */
  total: number | null
  /** How many days came back at all. */
  days: number
  /** How many of them carried this metric. */
  measured: number
}

export type LiveTotals = Readonly<Record<LiveMetric, LiveTotal>>

/**
 * One total per metric, and the denominator behind each.
 *
 * A metric no day reported is null, not zero, and it keeps the day count so the
 * legend can say "we asked across 30 days and this one never came back" rather
 * than "none".
 */
export function dailyTotals(days: readonly ZernioDailyMetricsDay[]): LiveTotals {
  const out = {} as Record<LiveMetric, LiveTotal>
  for (const metric of LIVE_METRICS) {
    let total = 0
    let measured = 0
    for (const day of days) {
      const value = day.metrics[metric]
      if (value === null) continue
      total += value
      measured += 1
    }
    out[metric] = { total: measured === 0 ? null : total, days: days.length, measured }
  }
  return out
}

export interface LivePoint {
  day: string
  value: number
}

/**
 * One metric's days, oldest first, with the days it did not report LEFT OUT.
 *
 * No point at all rather than a zero, which is the rule every chart on this
 * page follows and the reason `TrendArea` breaks its path across a gap: a line
 * through a day nobody measured is indistinguishable from two real readings.
 */
export function dailyPoints(
  days: readonly ZernioDailyMetricsDay[],
  metric: LiveMetric,
): LivePoint[] {
  return days
    .flatMap((day) => {
      const value = day.metrics[metric]
      return value === null ? [] : [{ day: day.date, value }]
    })
    .sort((a, b) => a.day.localeCompare(b.day))
}

export type DailyMetricsRead =
  | {
      kind: 'ready'
      days: ZernioDailyMetricsDay[]
      platforms: ZernioDailyPlatformRow[]
      /** Which question the days answer. Printed, never assumed. */
      attribution: 'received'
    }
  /** No Zernio profile for this workspace, so no read was possible. */
  | { kind: 'not-connected' }
  /**
   * There is an account to read and this deployment has no publishing key.
   *
   * Split out of `unreadable` for the reason `account-insights.ts` split it:
   * `unreadable` says "reload to try again", which is true of a timed-out call
   * and FALSE of a missing environment variable. Reloading cannot conjure a
   * key, and `e2e/no-impossible-remedy.spec.ts` fails a screen that promises a
   * retry to somebody for whom nothing failed.
   */
  | { kind: 'not-configured' }
  /** We asked and did not get an answer, or the plan refused it. */
  | { kind: 'unreadable' }

/**
 * Read the window's daily metrics for the active workspace.
 *
 * `profile` is a `ScopedProfileId`, minted only from a row already fetched for
 * this workspace: omitting it would read every profile on the API key, which is
 * every tenant, and Zernio would answer 200.
 */
export async function readDailyMetrics(view: {
  from: string
  to: string
}): Promise<DailyMetricsRead> {
  let reads: ZernioReads | null
  try {
    reads = zernioClientReads()
  } catch {
    // The env proxy validates the WHOLE schema on first access, so one unrelated
    // missing variable throws from what reads like a null check. "We have no
    // usable reader" is the honest answer and it is ours, not the customer's.
    return { kind: 'not-configured' }
  }
  if (reads === null) return { kind: 'not-configured' }

  let profile: ScopedProfileId
  try {
    const workspace = await activeWorkspaceRead()
    // A workspace read that FAILED is not a workspace with nothing connected.
    if (workspace.status === 'unreadable') return { kind: 'unreadable' }
    if (workspace.status === 'none') return { kind: 'not-connected' }
    profile = await profileForWorkspace(workspace.workspace.id)
  } catch (error) {
    if (error instanceof ScopeError) return { kind: 'not-connected' }
    return { kind: 'unreadable' }
  }

  try {
    const result = await reads.dailyMetrics(profile, {
      fromDate: view.from,
      toDate: view.to,
      // See the header. The default is `publish` and it answers a different
      // question; this one is never left to the API to choose.
      attribution: 'received',
    })
    return {
      kind: 'ready',
      days: result.dailyData,
      platforms: result.platformBreakdown,
      attribution: 'received',
    }
  } catch (error) {
    // Includes HTTP 402 `analytics_addon_required`. Deliberately NOT
    // `not-connected`: the accounts are connected and the plan is the problem,
    // and a remedy that cannot work is worse than no remedy.
    console.error(
      '[analytics] daily metrics read failed',
      error instanceof Error ? error.message : '?',
    )
    return { kind: 'unreadable' }
  }
}
