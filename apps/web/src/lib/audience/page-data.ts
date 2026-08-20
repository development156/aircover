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
  /**
   * True when the read hit its ceiling, so older days exist and are not drawn.
   *
   * Carried rather than swallowed: a chart that silently stops at a limit is a
   * chart that states a start date it does not mean.
   */
  truncated: boolean
}

export interface AudiencePageData {
  state: AudienceState
  history: CollectedHistory
  /**
   * The last demographics Sahoda collected, when the LIVE read could not be made.
   *
   * Null in every other case, including when the live read succeeded — the screen
   * must never show a stale copy beside a fresh one and leave the reader to work
   * out which is which. It exists so that a connected workspace on a deployment
   * with no key, or one whose account stopped resolving, still sees what was
   * already collected, with the day it was collected on stated.
   */
  lastCollected: { breakdown: AudienceBreakdown; day: string } | null
  /** The handle, when the connection carries one. Never invented. */
  username: string | null
  /** Meta's documented floor, passed down so the screen never hard-codes it. */
  floor: number
}

/**
 * How many days of follower record one page draws.
 *
 * Two years. A ceiling has to exist — an unbounded select against an append-only
 * table gets slower every night forever — and this one is chosen so that it is
 * never reached in the product's lifetime so far, rather than being a number that
 * quietly starts truncating in month two.
 */
export const MAX_TREND_DAYS = 730

const EMPTY_HISTORY: CollectedHistory = {
  followers: [],
  firstDay: null,
  lastDay: null,
  days: 0,
  storing: false,
  truncated: false,
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

  // ── THE FILTER IS IN THE QUERY, NOT IN THE LOOP, AND THAT IS THE WHOLE FIX ──
  // The first version selected EVERY row for the account and picked the follower
  // series out in JavaScript. On a populated account one day is four dimensions
  // times up to forty-five buckets times two populations — about 360 rows — plus
  // three follower rows. A 2000-row ceiling is therefore roughly five DAYS, and
  // `ascending` means the ceiling keeps the OLDEST five.
  //
  // The chart would have frozen on the first week and never moved again, and the
  // note under it would have said "Kept by Sahoda: 5 days, <first> to <fifth>"
  // while the table held a month. That is a false statement about the customer's
  // own data, degrading in the direction that reads as "nothing is happening" —
  // the one class of claim this product may never make.
  //
  // NEWEST FIRST, then reversed, so the ceiling drops the OLDEST days rather than
  // the current ones. A trend missing last year is a shorter line; a trend missing
  // this week is a wrong one.
  const { data, error } = await supabase
    .from('audience_snapshots')
    .select('value, measured_on')
    .eq('workspace_id', workspaceId)
    .eq('account_id', accountId)
    .eq('dimension', 'follower_count')
    .eq('bucket', 'total')
    .order('measured_on', { ascending: false })
    .limit(MAX_TREND_DAYS)

  // A missing table and a failed read are DIFFERENT, but neither one may render as
  // "no followers". Both collapse to `storing: false`, which the screen states as
  // "no history kept yet" — true of both, and it promises nothing.
  if (error || !Array.isArray(data)) return EMPTY_HISTORY

  const followers: FollowerDay[] = []
  for (const raw of data as Array<Record<string, unknown>>) {
    const day = typeof raw.measured_on === 'string' ? raw.measured_on.slice(0, 10) : null
    if (day === null) continue
    const value = count(raw.value)
    // A row that cannot be narrowed is DROPPED, never coerced to 0 — a dropped
    // point shortens the line, a coerced one draws a collapse that never happened.
    if (value === null) continue
    followers.push({ day, followers: value })
  }
  followers.reverse() // back to oldest-first, which is how a chart reads

  const first = followers[0]
  const last = followers[followers.length - 1]
  return {
    followers,
    // Stated from the SAME rows the chart is drawn from, so the sentence under it
    // can never describe a wider window than the line above it. When the ceiling
    // bites, both shrink together and the note stays true.
    firstDay: first?.day ?? null,
    lastDay: last?.day ?? null,
    days: followers.length,
    storing: true,
    truncated: followers.length >= MAX_TREND_DAYS,
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
    lastCollected: null,
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
      (await inactiveConnection(workspaceId)) ? { kind: 'reconnect' } : { kind: 'not-connected' },
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
  /**
   * The stored fallback, fetched ONCE and used only by the branches that could not
   * reach the platform. A live answer always wins: showing a fresh breakdown and a
   * stored one on the same screen would leave the reader to work out which is which.
   */
  const degraded = async (state: AudienceState): Promise<AudiencePageData> => ({
    state,
    history,
    lastCollected: await readStoredBreakdown(workspaceId, account),
    username,
    floor,
  })

  const reads = zernioClientReads()
  if (reads === null) return degraded({ kind: 'not-configured' })

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

  // A state that never reached the platform shows what was already collected; a
  // state that did shows only what it was just told.
  if (state.kind === 'unresolved' || state.kind === 'unreadable') return degraded(state)
  return { state, history, lastCollected: null, username, floor }
}
