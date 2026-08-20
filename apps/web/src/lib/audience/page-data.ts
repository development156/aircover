import 'server-only'

import {
  AUDIENCE_DIMENSIONS,
  DEMOGRAPHICS_FOLLOWER_FLOOR,
  ScopeError,
  classifyAudience,
  type AudienceBreakdown,
  type AudienceState,
} from '@sahoda/publishing'

import { createServerSupabase } from '@/lib/supabase/server'
import { activeWorkspaceRead } from '@/lib/workspaces'
import { scopeForWorkspace } from '@/lib/zernio/scope'
import { zernioClientReads } from '@/lib/zernio/server'

/**
 * Everything `/brain/audience` renders, decided on the server.
 *
 * ── TWO READS, AND THEY ANSWER DIFFERENT QUESTIONS ───────────────────────────
 * LIVE  — what Instagram says right now, and therefore which of the eight states
 *         this account is in. Only a live call can distinguish "the platform
 *         withholds this" from "we have not collected it yet".
 * STORED — `audience_snapshots`, which is the only place a HISTORY exists.
 *         Instagram reports demographics for the present moment and nothing else;
 *         the trend under the headline is our own record, and it has gaps exactly
 *         where no collection happened.
 *
 * ── NO ZERO FALLBACK IN THIS FILE ────────────────────────────────────────────
 * Every failure — no workspace, no key, no connection, an inactive connection, a
 * thrown call — resolves to a state that names itself. The union is
 * `@sahoda/publishing`'s `AudienceState`, decided by `classifyAudience`, and this
 * module never re-derives that verdict. It only supplies the two things the
 * verdict needs: the payload, and a follower count.
 */

/** One day of the follower record. A day with no row is ABSENT, never a zero. */
export interface FollowerDay {
  day: string
  followers: number
}

/** What Sahoda has kept, as opposed to what Instagram will say today. */
export interface CollectedHistory {
  /** Daily follower counts, oldest first. Gaps are gaps. */
  followers: FollowerDay[]
  /** The first and last day anything at all was collected for this account. */
  firstDay: string | null
  lastDay: string | null
  /** How many distinct days hold at least one row. The evidence base, stated. */
  days: number
  /**
   * Whether the table exists at all.
   *
   * `false` is not a failure: the migration is the founder's to apply, and until
   * it is there is no history and the screen says so plainly rather than showing
   * an empty chart, which would read as "no followers".
   */
  storing: boolean
}

export interface AudiencePageData {
  state: AudienceState
  history: CollectedHistory
  /** The handle, when the connection carries one. Never invented. */
  username: string | null
  /** Meta's documented floor, passed down so the screen never hard-codes it. */
  floor: number
}

const EMPTY_HISTORY: CollectedHistory = {
  followers: [],
  firstDay: null,
  lastDay: null,
  days: 0,
  storing: false,
}

/** A finite, non-negative count out of a `bigint` that arrives as a string. */
function count(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw >= 0 ? raw : null
  if (typeof raw !== 'string') return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

/**
 * Is there a connection for Instagram that simply is not active?
 *
 * Distinguishes "reconnect Instagram" from "connect Instagram". Returns false on
 * any read failure, which under-claims deliberately: telling someone to connect an
 * account they already have is a smaller error than telling someone to reconnect
 * one they never had.
 */
async function inactiveConnection(workspaceId: string): Promise<boolean> {
  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('connections')
      .select('status')
      .eq('workspace_id', workspaceId)
      .eq('platform', 'instagram')
      .neq('status', 'active')
      .limit(1)
    return !error && Array.isArray(data) && data.length > 0
  } catch {
    return false
  }
}

/** The handle, if the connection stored one. A missing handle renders as nothing. */
async function handleFor(workspaceId: string): Promise<string | null> {
  try {
    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('connections')
      .select('external_account')
      .eq('workspace_id', workspaceId)
      .eq('platform', 'instagram')
      .eq('status', 'active')
      .maybeSingle()
    if (error || data === null) return null
    const account = (data as { external_account?: { username?: unknown } }).external_account
    const username = account?.username
    return typeof username === 'string' && username.trim() !== '' ? username : null
  } catch {
    return null
  }
}

/**
 * What Sahoda has kept for this account.
 *
 * ── WHY THIS IS NOT A SUM ────────────────────────────────────────────────────
 * `bucket = 'total'` only. The three follower buckets are a STOCK and two FLOWS,
 * and adding them would produce a number Instagram never reported. The migration
 * says so; this is the code that obeys it.
 */
export async function readCollectedHistory(
  workspaceId: string,
  accountId: string,
): Promise<CollectedHistory> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('audience_snapshots')
    .select('dimension, bucket, value, measured_on')
    .eq('workspace_id', workspaceId)
    .eq('account_id', accountId)
    .order('measured_on', { ascending: true })
    .limit(2000)

  // A missing table and a failed read are DIFFERENT, but neither one may render as
  // "no followers". Both collapse to `storing: false`, which the screen states as
  // "no history kept yet" — true of both, and it promises nothing.
  if (error || !Array.isArray(data)) return EMPTY_HISTORY

  const followers: FollowerDay[] = []
  const allDays = new Set<string>()
  for (const raw of data as Array<Record<string, unknown>>) {
    const day = typeof raw.measured_on === 'string' ? raw.measured_on.slice(0, 10) : null
    if (day === null) continue
    allDays.add(day)
    if (raw.dimension !== 'follower_count' || raw.bucket !== 'total') continue
    const value = count(raw.value)
    // A row that cannot be narrowed is DROPPED, never coerced to 0 — a dropped
    // point shortens the line, a coerced one draws a collapse that never happened.
    if (value === null) continue
    followers.push({ day, followers: value })
  }

  const days = [...allDays].sort()
  return {
    followers,
    firstDay: days[0] ?? null,
    lastDay: days[days.length - 1] ?? null,
    days: days.length,
    storing: true,
  }
}

/**
 * The stored demographics for the freshest day that has any.
 *
 * Used only as a FALLBACK when the live call could not be made — a connected
 * account on a deployment with no key still has a real audience, and refusing to
 * show what we already collected would be an odd kind of honesty. The screen
 * always says which day it is looking at.
 */
export async function readStoredBreakdown(
  workspaceId: string,
  accountId: string,
): Promise<{ breakdown: AudienceBreakdown; day: string } | null> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('audience_snapshots')
    .select('dimension, bucket, value, measured_on')
    .eq('workspace_id', workspaceId)
    .eq('account_id', accountId)
    .eq('audience', 'followers')
    .in('dimension', [...AUDIENCE_DIMENSIONS])
    .order('measured_on', { ascending: false })
    .limit(400)

  if (error || !Array.isArray(data) || data.length === 0) return null

  const rows = data as Array<Record<string, unknown>>
  const day = typeof rows[0]?.measured_on === 'string' ? rows[0].measured_on.slice(0, 10) : null
  if (day === null) return null

  const breakdown: AudienceBreakdown = {}
  for (const row of rows) {
    if (typeof row.measured_on !== 'string' || !row.measured_on.startsWith(day)) continue
    const dimension = AUDIENCE_DIMENSIONS.find((d) => d === row.dimension)
    const value = count(row.value)
    if (dimension === undefined || value === null || typeof row.bucket !== 'string') continue
    ;(breakdown[dimension] ??= []).push({ label: row.bucket, value })
  }
  for (const dimension of AUDIENCE_DIMENSIONS) {
    const buckets = breakdown[dimension]
    if (buckets === undefined) continue
    buckets.sort((a, b) => b.value - a.value)
  }
  return Object.keys(breakdown).length === 0 ? null : { breakdown, day }
}

/**
 * The current follower count, from the live series.
 *
 * The LAST DATED POINT, not the endpoint's `total` field — see the collector's
 * `currentFollowers` for why. Null when the series could not be read, and null is
 * not zero: zero would be under the floor and would claim suppression.
 */
function newestFollowerCount(metrics: Record<string, unknown>): number | null {
  const raw = (metrics as { follower_count?: unknown }).follower_count
  if (typeof raw !== 'object' || raw === null) return null
  const values = (raw as { values?: unknown }).values
  if (!Array.isArray(values)) return null
  let newest: { date: string; value: number } | null = null
  for (const point of values as Array<Record<string, unknown>>) {
    const date = point?.date
    const value = count(point?.value)
    if (typeof date !== 'string' || value === null) continue
    if (newest === null || date > newest.date) newest = { date, value }
  }
  return newest?.value ?? null
}

export async function readAudiencePage(): Promise<AudiencePageData> {
  const floor = DEMOGRAPHICS_FOLLOWER_FLOOR
  const nothing = (state: AudienceState): AudiencePageData => ({
    state,
    history: EMPTY_HISTORY,
    username: null,
    floor,
  })

  // "Nothing connected" is a claim about the customer's accounts. An unreadable
  // WORKSPACE read supports no claim about them at all.
  const workspace = await activeWorkspaceRead()
  if (workspace.status === 'unreadable') return nothing({ kind: 'unreadable' })
  if (workspace.status === 'none') return nothing({ kind: 'not-connected' })
  const workspaceId = workspace.workspace.id

  // ── ASK WHO IS CONNECTED BEFORE ASKING THE TRANSPORT ──────────────────────
  // This order is load-bearing, and the analytics lane learned it the hard way:
  // consulting the client first makes a deployment with no key answer "we could
  // not read your audience" to a brand-new user who has never connected anything.
  // That is a failure report where nothing failed. "No account connected" is true
  // whether or not the client is configured, so it is answered from the
  // connections table, which needs no transport at all.
  let account
  try {
    ;({ account } = await scopeForWorkspace(workspaceId, 'instagram'))
  } catch (error) {
    if (!(error instanceof ScopeError)) return nothing({ kind: 'unreadable' })
    return nothing(
      (await inactiveConnection(workspaceId))
        ? { kind: 'reconnect' }
        : { kind: 'not-connected' },
    )
  }

  const [history, username] = await Promise.all([
    readCollectedHistory(workspaceId, account),
    handleFor(workspaceId),
  ])

  // Only NOW does a missing client mean anything about THIS account: there is one
  // to read. It is still not `unreadable` — nothing was attempted, so nothing
  // failed, and "try again" is advice that cannot work when the key is absent from
  // the deployment rather than late.
  const reads = zernioClientReads()
  if (reads === null) return { state: { kind: 'not-configured' }, history, username, floor }

  // The follower count FIRST. Suppression cannot be claimed without it, and asking
  // for demographics before having one leaves a branch with nothing to judge by.
  let followers: number | null = null
  try {
    const { metrics } = await reads.instagramFollowerHistory(account, {
      metricType: 'time_series',
    })
    followers = newestFollowerCount(metrics)
  } catch {
    // A failed follower read is not a failed audience read. It only means the
    // suppression judgement has no evidence, which `classifyAudience` handles by
    // refusing to make it.
    followers = null
  }

  let state: AudienceState
  try {
    const payload = await reads.instagramDemographics(account, {
      metric: 'follower_demographics',
      breakdown: 'age,city,country,gender',
    })
    state = classifyAudience({ result: { ok: true, payload }, followers, floor })
  } catch (error) {
    state = classifyAudience({ result: { ok: false, error }, followers, floor })
  }

  return { state, history, username, floor }
}
