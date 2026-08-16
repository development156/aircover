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
      /**
       * Daily gains and losses, when the endpoint sends them.
       *
       * Separate series, not derived by differencing `followers`. A difference
       * computed from a series with a dropped point invents a gain that never
       * happened — and points ARE dropped here, by design, whenever they cannot be
       * narrowed. These arrive as their own `followers_gained` / `followers_lost`
       * series (observed live 2026-08-11) or not at all.
       */
      gained: SeriesPoint[]
      lost: SeriesPoint[]
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

/**
 * Metric labels worth a tile, in the order they should read.
 *
 * These are the keys `/analytics/instagram/account-insights` ACTUALLY returns, verified
 * live on 2026-08-10. It previously asked for `impressions` and `profile_views`, which
 * that response does not contain — Instagram's newer account metrics are `views` and
 * `total_interactions`. Asking for a key the endpoint never sends is indistinguishable
 * from the endpoint reporting nothing, which is how this card came to claim exactly
 * that while holding four numbers.
 */
const INSIGHT_KEYS: readonly { key: string; label: string }[] = [
  { key: 'reach', label: 'Reach' },
  { key: 'views', label: 'Views' },
  { key: 'accounts_engaged', label: 'Accounts engaged' },
  { key: 'total_interactions', label: 'Interactions' },
]

/** A finite number, or nothing. Never a coerced 0. */
function num(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null
}

/**
 * One headline figure out of Zernio's `metrics` bag.
 *
 * Every metric arrives wrapped — `{ "reach": { "total": 1 } }` — under
 * `metricType: total_value`, never as a bare number. A bare number is still accepted
 * because it costs one line and the wrapper is a shape we learned by observation, not
 * from a contract that guarantees it.
 */
function totalOf(raw: unknown): number | null {
  const direct = num(raw)
  if (direct !== null) return direct
  if (typeof raw !== 'object' || raw === null) return null
  return num((raw as Record<string, unknown>).total)
}

/**
 * The tiles this response can honestly fill.
 *
 * A metric the response did not carry is dropped, never shown as 0 — but a metric
 * REPORTED as 0 keeps its tile, because that is a measurement. Exported for the test
 * that pins both halves of that distinction against the recorded payload.
 */
export function insightTiles(metrics: Record<string, unknown>): { label: string; value: number }[] {
  return INSIGHT_KEYS.map(({ key, label }) => ({ label, value: totalOf(metrics[key]) })).filter(
    (tile): tile is { label: string; value: number } => tile.value !== null,
  )
}

/** A daily series is keyed by dates. `2026-08-09`, or a full ISO timestamp. */
const DATE_KEY = /^\d{4}-\d{2}-\d{2}/

/** One `{ date, value }` point, however Zernio spelled those two fields. */
function pointFrom(raw: unknown): SeriesPoint | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  const date = record.date ?? record.end_time ?? record.timestamp
  const value = num(record.value ?? record.count ?? record.followers)
  if (typeof date !== 'string' || value === null) return null
  return { date, value }
}

/**
 * Pull a daily series out of Zernio's untyped `metrics` bag.
 *
 * ── THE SHAPE THIS GOT WRONG, AND WHY IT MATTERED ────────────────────────────
 * Three shapes are now handled: a bare array of points, a `{ values: [...] }` wrapper,
 * and a plain date→value object. The wrapper is the one the live endpoint returns
 * under `metricType=time_series`, and its absence here was not a silent empty — it was
 * a fabrication.
 *
 * Under the default `metricType=total_value` a metric arrives as `{ total: 1 }`. That
 * fell through to the date→value branch, which read the JSON KEY as a date and emitted
 * `[{ date: 'total', value: 1 }]` — a one-point chart that rendered as "1 — No change
 * over 1 day". Every part of that sentence was invented.
 *
 * So the date→value branch now requires its keys to look like dates. A dropped point is
 * a shorter line; a coerced one is a false line, and only one of those is recoverable
 * by looking at it.
 */
export function seriesFrom(metrics: Record<string, unknown>, key: string): SeriesPoint[] {
  const raw = metrics[key]

  if (Array.isArray(raw)) {
    return raw.map(pointFrom).filter((p): p is SeriesPoint => p !== null)
  }

  if (typeof raw === 'object' && raw !== null) {
    const record = raw as Record<string, unknown>

    // `{ total, values: [{ date, value }] }` — the time-series answer.
    if (Array.isArray(record.values)) {
      return record.values.map(pointFrom).filter((p): p is SeriesPoint => p !== null)
    }

    return Object.entries(record)
      .map(([date, value]) => {
        if (!DATE_KEY.test(date)) return null
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

  // ── ASK WHO IS CONNECTED BEFORE ASKING THE TRANSPORT ────────────────────────
  // This order is the fix, and the order is the whole fix.
  //
  // `zernioClientReads()` used to be consulted FIRST, so an environment with no
  // publishing key returned `unreadable` — "couldn't read your account insights
  // just now" — to a brand-new user who has never connected anything. That is a
  // failure report where nothing failed, on the first screen they open, and it
  // is the one wrong answer this union exists to prevent.
  //
  // "No account connected" is TRUE whether or not the client is configured, so
  // it is answered from the connections table, which needs no transport at all.
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

  // Only NOW is a missing client a genuine read failure: there is an account to
  // read and we cannot reach it. Before this line it was an absent account
  // wearing a failure's words.
  const reads = zernioClientReads()
  if (!reads) return { kind: 'unreadable' }

  const since = isoDaysAgo(now, WINDOW_DAYS)
  const until = isoDaysAgo(now, 0)

  try {
    const [history, insights] = await Promise.all([
      // `time_series` is asked for EXPLICITLY. The endpoint defaults to `total_value`,
      // which answers `{ follower_count: { total: 1 } }` — a single number for the whole
      // window, and no history at all. A chart cannot be drawn from it, and the previous
      // code drew one anyway (see `seriesFrom`).
      reads.instagramFollowerHistory(account, { since, until, metricType: 'time_series' }),
      // Insights stays on the default. `time_series` is REFUSED here — the endpoint
      // answers HTTP 400, "Metrics [views, accounts_engaged, total_interactions] only
      // support metricType=total_value" — and these four are read as tiles, not a line.
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
    const tiles = insightTiles(insights.metrics)

    return {
      kind: 'ready',
      followers,
      gained: seriesFrom(history.metrics, 'followers_gained'),
      lost: seriesFrom(history.metrics, 'followers_lost'),
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
