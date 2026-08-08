import 'server-only'

import {
  lagHoursFromDataDelay,
  INSTAGRAM_FOLLOWER_LAG_HOURS,
  INSTAGRAM_INSIGHTS_LAG_HOURS,
  ScopeError,
} from '@sahoda/publishing'

import type { ZernioPlatform } from '@sahoda/shared'

import { cache } from 'react'

import { createServerSupabase } from '@/lib/supabase/server'
import { getActiveWorkspace } from '@/lib/workspaces'
import { scopeForWorkspace } from '@/lib/zernio/scope'
import { zernioClientReads } from '@/lib/zernio/server'

/**
 * Per-account Instagram analytics — follower history and account insights.
 *
 * ── THE SAME REFUSAL AS THE POST HALF ────────────────────────────────────────
 * Instagram reports account insights ~48h behind and follower history ~24h behind,
 * so a freshly connected account has nothing, and Zernio expresses "nothing" as an
 * empty or zeroed metrics bag. None of that is a measurement. Every failure mode
 * here — no workspace, no key, no profile, an inactive connection, a thrown call —
 * resolves to a state that names itself. There is no zero fallback in this file.
 *
 * `metrics` arrives as `Record<string, unknown>`, so every series is narrowed before
 * it can reach a chart. An unparseable point is dropped, never coerced to 0.
 */

/** Memoised per request so the two reads on one page share a lookup. */
const activeWorkspaceId = cache(async (): Promise<string | null> => {
  const workspace = await getActiveWorkspace()
  return workspace?.id ?? null
})

/** How far back the dashboard asks. Instagram's own windows are shorter than this. */
const WINDOW_DAYS = 30

/** One day of a series: a date and a value that was actually reported. */
export interface SeriesPoint {
  date: string
  value: number
}

export type AccountAnalytics =
  | {
      kind: 'ready'
      /** Daily follower counts, oldest first. Empty when the window held no points. */
      followers: SeriesPoint[]
      /** Headline account numbers Zernio reported, already narrowed to numbers. */
      insights: { label: string; value: number }[]
      /**
       * TWO lags, not one. Instagram reports follower history ~24h behind and account
       * insights ~48h behind, and they are separate endpoints with separate
       * `dataDelay` fields. Collapsing them lets the card print "about a day" under a
       * reach figure that is two days old — a false freshness claim, which is the one
       * kind of lie this whole feature exists to prevent. Each surface states its own.
       */
      followerLagHours: number
      insightsLagHours: number
      /**
       * True when BOTH reads came back with nothing.
       *
       * Named for what it measures, not what we wish it meant: there is no connection
       * timestamp here, so unlike the post half — which compares `publishedAt` against
       * the window — this cannot tell "too early" from "never came". The copy it
       * drives is worded to survive both readings.
       */
      nothingReported: boolean
    }
  | { kind: 'not-connected' }
  | { kind: 'reconnect' }
  | { kind: 'unreadable' }

/** Metric labels worth a tile, in the order they should read. */
const INSIGHT_KEYS: readonly { key: string; label: string }[] = [
  { key: 'reach', label: 'Reach' },
  { key: 'impressions', label: 'Impressions' },
  { key: 'profile_views', label: 'Profile views' },
  { key: 'accounts_engaged', label: 'Accounts engaged' },
]

/** A finite number, or nothing. Never a coerced 0. */
function num(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null
}

/**
 * Pull a daily series out of Zernio's untyped `metrics` bag.
 *
 * Accepts the two shapes seen in the wild — an array of points, or an object of
 * date→value — and drops anything it cannot read. A dropped point is a shorter line;
 * a coerced one is a false line, and only one of those is recoverable by looking.
 */
export function seriesFrom(metrics: Record<string, unknown>, key: string): SeriesPoint[] {
  const raw = metrics[key]

  if (Array.isArray(raw)) {
    return raw
      .map((point) => {
        if (typeof point !== 'object' || point === null) return null
        const record = point as Record<string, unknown>
        const date = record.date ?? record.end_time ?? record.timestamp
        const value = num(record.value ?? record.count ?? record.followers)
        if (typeof date !== 'string' || value === null) return null
        return { date, value }
      })
      .filter((p): p is SeriesPoint => p !== null)
  }

  if (typeof raw === 'object' && raw !== null) {
    return Object.entries(raw as Record<string, unknown>)
      .map(([date, value]) => {
        const parsed = num(value)
        return parsed === null ? null : { date, value: parsed }
      })
      .filter((p): p is SeriesPoint => p !== null)
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  return []
}

/** The first key that yields any points — Zernio has named this series more than one way. */
function firstSeries(metrics: Record<string, unknown>, keys: readonly string[]): SeriesPoint[] {
  for (const key of keys) {
    const points = seriesFrom(metrics, key)
    if (points.length > 0) return points
  }
  return []
}

const FOLLOWER_KEYS = ['follower_count', 'followers', 'followers_count', 'follower_history']

function isoDaysAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/**
 * Is there a connection for this channel that simply is not active?
 *
 * Distinguishes "reconnect Instagram" from "connect Instagram". Returns false on any
 * read failure, which under-claims: telling someone to connect an account they have
 * is a smaller error than telling someone to reconnect one they never had.
 */
async function hasInactiveConnection(
  workspaceId: string,
  platform: ZernioPlatform,
): Promise<boolean> {
  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('connections')
      .select('status')
      .eq('workspace_id', workspaceId)
      .eq('platform', platform)
      .neq('status', 'active')
      .limit(1)
    return !error && Array.isArray(data) && data.length > 0
  } catch {
    return false
  }
}

/**
 * Instagram follower history and account insights for the active workspace.
 *
 * Both reads are account-scoped, and the account id can only be minted by
 * `scopeForWorkspace` from a row already fetched for this workspace — so the
 * cross-tenant read that an omitted filter would cause is not expressible here.
 */
export async function readInstagramAnalytics(now: Date = new Date()): Promise<AccountAnalytics> {
  const workspaceId = await activeWorkspaceId()
  if (workspaceId === null) return { kind: 'not-connected' }

  const reads = zernioClientReads()
  if (!reads) return { kind: 'unreadable' }

  let account
  try {
    ;({ account } = await scopeForWorkspace(workspaceId, 'instagram'))
  } catch (error) {
    if (!(error instanceof ScopeError)) return { kind: 'unreadable' }
    // `accountForWorkspace` filters on `status = 'active'`, so an expired, revoked or
    // errored connection fails scoping exactly like an absent one. The two need
    // different words — "connect Instagram" is useless advice to someone already
    // connected — so ask the table which it was. Failure path only.
    return (await hasInactiveConnection(workspaceId, 'instagram'))
      ? { kind: 'reconnect' }
      : { kind: 'not-connected' }
  }

  const since = isoDaysAgo(now, WINDOW_DAYS)
  const until = isoDaysAgo(now, 0)

  try {
    const [history, insights] = await Promise.all([
      reads.instagramFollowerHistory(account, { since, until }),
      reads.instagramAccountInsights(account, { since, until }),
    ])

    // Each endpoint's own statement of its own delay wins over our constant, and
    // neither borrows the other's — they are genuinely different numbers, and the
    // fallbacks differ too (24h vs 48h). Taking the follower delay as a fallback for
    // insights would UNDER-state it, which is the error that makes stale data look
    // fresh.
    const followerLagHours =
      lagHoursFromDataDelay(history.dataDelay) ?? INSTAGRAM_FOLLOWER_LAG_HOURS
    const insightsLagHours =
      lagHoursFromDataDelay(insights.dataDelay) ?? INSTAGRAM_INSIGHTS_LAG_HOURS

    const followers = firstSeries(history.metrics, FOLLOWER_KEYS)
    const tiles = INSIGHT_KEYS.map(({ key, label }) => ({
      label,
      value: num(insights.metrics[key]),
    })).filter((t): t is { label: string; value: number } => t.value !== null)

    return {
      kind: 'ready',
      followers,
      insights: tiles,
      followerLagHours,
      insightsLagHours,
      nothingReported: followers.length === 0 && tiles.length === 0,
    }
  } catch {
    return { kind: 'unreadable' }
  }
}

export { INSTAGRAM_FOLLOWER_LAG_HOURS, INSTAGRAM_INSIGHTS_LAG_HOURS }
