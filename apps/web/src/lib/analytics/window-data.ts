import 'server-only'

import type { Channel } from '@sahoda/shared'

import { commonAge } from '@/lib/analytics/week-report'
import type { MetricKey } from '@/lib/analytics/compare'
import { COMPARE_AGE_DAYS, type AgedPost } from '@/lib/analytics/like-age'
import { timingGrid, type Timing, type TimedPost } from '@/lib/analytics/timing'
import type { AnalyticsView } from '@/lib/analytics/view-params'
import { previousWindow } from '@/lib/analytics/view-params'
import { createServerSupabase } from '@/lib/supabase/server'
import { activeWorkspaceRead } from '@/lib/workspaces'

/**
 * EVERYTHING /analytics READS FOR ONE CHOSEN WINDOW.
 *
 * ── THIS FILE ONLY FETCHES ───────────────────────────────────────────────────
 * The same split `week-data.ts` makes. Nothing here decides whether a figure may
 * be shown; `timing.ts`, `headline.ts` and `like-age.ts` own that and hold no
 * I/O, so every refusal is testable without a database.
 *
 * ── NEVER REJECTS, AND EACH SECTION FAILS ALONE ──────────────────────────────
 * The brief asks that one slow or failing query must not block the page. Each
 * read below is independent and each returns its own absence, so a broken leads
 * table costs the enquiries card and nothing else.
 */

/** Most rows one read will take. Past it a total is a subtotal. */
export const ROW_CAP = 5000

/**
 * The three metrics `post_metric_snapshots` stores, and the cap for reading them
 * in ONE query.
 *
 * The snapshot read used to ask for `reach` alone and cap at `ROW_CAP`. Asking
 * for all three multiplies the rows by three for the same history, so a
 * workspace that sat comfortably under the cap would cross it and the whole page
 * would report itself unreadable — a regression that would look like a database
 * fault and would only show up on the busiest accounts.
 *
 * The GUARANTEE is unchanged and is what the number is derived from: a read that
 * comes back short of its limit was not truncated, so no metric is a subtotal
 * wearing a total's clothes. Written as arithmetic rather than as 15000, so
 * adding a fourth metric moves it without anyone doing the multiplication.
 */
export const SNAPSHOT_METRICS: readonly MetricKey[] = ['impressions', 'reach', 'engagement']
export const SNAPSHOT_ROW_CAP = ROW_CAP * SNAPSHOT_METRICS.length

/**
 * The zone every wall-clock claim on this page is made in.
 *
 * `workspaces.timezone` is nullable and, when the column was added, one of 33
 * workspaces had it set. This is the fallback the rest of the codebase already
 * hardcodes in 29 files. It is NAMED ON THE SCREEN rather than assumed, because
 * "Tuesday morning" is a claim about the reader's clock and a reader in another
 * zone deserves to see which clock we used.
 */
export const FALLBACK_TIMEZONE = 'Asia/Kolkata'

export interface PublishedRow {
  postId: string
  title: string
  channel: Channel
  publishedAt: string
  /** Reach at the shared age, or null. Never a lifetime total — see below. */
  reachAtAge: number | null
  /**
   * Impressions and engagement at THE SAME age, or null.
   *
   * ── WHY THESE ARRIVED LATE ───────────────────────────────────────────────
   * `post_metric_snapshots` has stored all three metrics since it was created —
   * `metric text not null check (metric in ('impressions', 'reach',
   * 'engagement'))` — and the nightly job captures all three
   * (`CAPTURED_METRICS`). This read asked for `reach` and nothing else, so
   * /analytics could not show the other two at all, on any screen, however much
   * of them we held.
   *
   * ── NULL IS NOT A ZERO, AND IT IS NOT THE PLATFORM'S FAULT EITHER ────────
   * A null here means we hold no reading for this post, on this channel, for
   * this metric, on the day `ageDays` lands on. That can be the platform not
   * reporting OR the collecting job missing a day — `like-age.ts` says so in
   * as many words — so nothing downstream may render it as a claim about the
   * channel. It is the same null `reachAtAge` already carries, and the
   * components already refuse to draw a number for it.
   */
  impressionsAtAge: number | null
  engagementAtAge: number | null
}

export type WindowRead =
  | { kind: 'no-workspace' }
  | { kind: 'unreadable' }
  | {
      kind: 'ready'
      timezone: string
      /** Every published channel inside the window. */
      rows: PublishedRow[]
      /** Distinct posts, not publish legs. A post on three channels is one post. */
      postsPublished: number
      /** The same count for the window before this one, for the comparison. */
      postsPublishedPrevious: number | null
      /** Weeks between the first publish ever and the end of the window. */
      weeksOfHistory: number
      /** The age every reach figure on this page was read at. */
      ageDays: number | null
      timing: Timing
    }

const DAY_MS = 86_400_000

/**
 * One stored reading, after parsing. Exported for `agedFor`'s tests: it is the
 * only shape that function needs, and requiring a database to check which metric
 * a reading belongs to would be checking the wrong thing.
 */
export interface SnapshotReading {
  postId: string
  channel: Channel
  metric: MetricKey
  value: number
  measuredOn: string
}

type RawSnapshot = SnapshotReading

/**
 * The `YYYY-MM-DD` an instant falls on, IN A NAMED ZONE.
 *
 * ── THIS WAS UTC AND THE HEADER SAID OTHERWISE ───────────────────────────────
 * An audit measured it: `2026-08-31T18:45:00Z` was cut into the window as
 * 31 August and printed by the table as 1 September, because the cut used
 * `toISOString` and the cell used `Intl` in the workspace's zone. A reader
 * asking for August got a post the same page stamps September, and the headline
 * count was made on a boundary the header did not describe.
 *
 * One zone decides both now. `en-CA` because it formats as `YYYY-MM-DD`, which
 * is the shape every comparison in this file does string arithmetic on.
 */
function dayIn(iso: string, timeZone: string): string | null {
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return null
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(at))
  } catch {
    return null
  }
}

/**
 * Read one window.
 *
 * ── WHY THE PUBLISH READ IS NOT LIMITED TO THE WINDOW ────────────────────────
 * Three of the figures need history from OUTSIDE it: how many weeks this
 * workspace has (which decides whether any comparison is offered at all), the
 * count for the previous window, and the timing grid, which is a claim about the
 * business rather than about thirty days. So the read spans the window, the one
 * before it, and enough behind that to date the first publish, and the filtering
 * happens here where the reason for each cut can be written down.
 */
export async function readWindow(view: AnalyticsView): Promise<WindowRead> {
  try {
    const workspace = await activeWorkspaceRead()
    if (workspace.status === 'none') return { kind: 'no-workspace' }
    if (workspace.status !== 'ok') return { kind: 'unreadable' }
    const workspaceId = workspace.workspace.id
    const timezone =
      typeof workspace.workspace.timezone === 'string' && workspace.workspace.timezone.trim()
        ? workspace.workspace.timezone
        : FALLBACK_TIMEZONE

    const supabase = createServerSupabase()

    const { data: logs, error: logsError } = await supabase
      .from('post_publish_logs')
      .select('post_id, channel, published_at')
      .eq('workspace_id', workspaceId)
      .eq('status', 'succeeded')
      // A fixture publish never went anywhere. Counting one would tell somebody
      // they posted when they did not.
      .eq('mode', 'live')
      .order('published_at', { ascending: false })
      .limit(ROW_CAP)

    if (logsError || !logs) return { kind: 'unreadable' }
    // At the cap the oldest legs are gone, which makes the first-publish date
    // wrong, understates how many weeks of history there are, and turns the
    // published count into a subtotal shown as a total. `readSnapshots` already
    // refuses on exactly this; an audit found the rule enforced on one query
    // and not the other.
    if (logs.length >= ROW_CAP) return { kind: 'unreadable' }

    type Leg = { postId: string; channel: Channel; publishedAt: string }
    /**
     * ── ONE LEG PER POST PER CHANNEL ───────────────────────────────────────
     * `post_publish_logs` carries an `attempt` column and NO unique constraint
     * on `(post_id, channel)`, so a retry that eventually succeeded can leave
     * two succeeded rows. Both would carry the same reading, and an audit
     * traced where that lands: the channel card sums the figure TWICE while
     * counting one post, and the subtotal warning stays quiet because two
     * measured is not fewer than one post.
     *
     * The latest succeeded attempt is the one the platform is reporting on,
     * which is the same rule `post-metrics.ts` already applies to the same
     * table.
     */
    const latest = new Map<string, Leg>()
    for (const row of logs) {
      const postId = typeof row.post_id === 'string' ? row.post_id : null
      const channel = typeof row.channel === 'string' ? (row.channel as Channel) : null
      const publishedAt = typeof row.published_at === 'string' ? row.published_at : null
      // A leg missing any of the three is dropped, never defaulted. One with an
      // invented date lands in the wrong window and takes its numbers with it.
      if (postId === null || channel === null || publishedAt === null) continue
      const key = `${postId}:${channel}`
      const seen = latest.get(key)
      if (!seen || Date.parse(publishedAt) > Date.parse(seen.publishedAt)) {
        latest.set(key, { postId, channel, publishedAt })
      }
    }
    const legs: Leg[] = [...latest.values()]

    if (legs.length === 0) {
      return {
        kind: 'ready',
        timezone,
        rows: [],
        postsPublished: 0,
        postsPublishedPrevious: null,
        weeksOfHistory: 0,
        ageDays: null,
        timing: { kind: 'none', reason: 'no-history' },
      }
    }

    const [titles, snapshots] = await Promise.all([
      readTitles(
        supabase,
        workspaceId,
        [...new Set(legs.map((leg) => leg.postId))].slice(0, ROW_CAP),
      ),
      readSnapshots(supabase, workspaceId),
    ])
    if (snapshots === 'unreadable') return { kind: 'unreadable' }

    // One map per metric. Reach keeps its own name because the shared age below
    // is derived from IT and from nothing else — see the note on `ageDays`.
    const aged = agedFor(legs, snapshots, 'reach')
    const agedImpressions = agedFor(legs, snapshots, 'impressions')
    const agedEngagement = agedFor(legs, snapshots, 'engagement')

    /**
     * ── ONE AGE FOR THE WHOLE PAGE ─────────────────────────────────────────
     * The headline figure, the table's reach column, the channel cards and the
     * heatmap are all read at this age. Stored values are running lifetime
     * totals, so mixing ages anywhere on this screen reports how long ago
     * something went out as how well it did. Sharing the age is also what makes
     * the numbers add up between sections: a reader who sums the table and
     * compares it with a card is entitled to get the same answer.
     *
     * IT IS STILL DERIVED FROM REACH ALONE, and that is deliberate. Impressions
     * and engagement are read AT this age, never allowed to move it. Feeding all
     * three to `commonAge` would pick the day on which SOME metric was recorded
     * and could shift every reach figure on the page — changing numbers a
     * customer has already seen, as a side effect of showing two new columns.
     * Where the other two were not captured on that day they are null, which is
     * the honest answer and the one the components already handle.
     */
    const ageDays = commonAge([...aged.values()], COMPARE_AGE_DAYS * 4, 2)

    const inWindow = legs.filter((leg) => {
      const day = dayIn(leg.publishedAt, timezone)
      return day !== null && day >= view.from && day <= view.to
    })
    const channelOf = view.channel
    const visible = channelOf === null ? inWindow : inWindow.filter((l) => l.channel === channelOf)

    const rows: PublishedRow[] = visible.map((leg) => ({
      postId: leg.postId,
      channel: leg.channel,
      publishedAt: leg.publishedAt,
      title: titles.get(leg.postId) ?? 'Untitled post',
      reachAtAge:
        ageDays === null ? null : readingValue(aged.get(`${leg.postId}:${leg.channel}`), ageDays),
      impressionsAtAge:
        ageDays === null
          ? null
          : readingValue(agedImpressions.get(`${leg.postId}:${leg.channel}`), ageDays),
      engagementAtAge:
        ageDays === null
          ? null
          : readingValue(agedEngagement.get(`${leg.postId}:${leg.channel}`), ageDays),
    }))

    const previous = previousWindow(view)
    const previousLegs = legs.filter((leg) => {
      const day = dayIn(leg.publishedAt, timezone)
      return day !== null && day >= previous.from && day <= previous.to
    })

    const first = legs.reduce(
      (oldest, leg) => (leg.publishedAt < oldest ? leg.publishedAt : oldest),
      legs[0]?.publishedAt ?? '',
    )
    const weeksOfHistory = Math.max(
      0,
      Math.floor((Date.parse(`${view.to}T23:59:59Z`) - Date.parse(first)) / (7 * DAY_MS)),
    )

    /**
     * The heatmap is a claim about the BUSINESS, so it reads every post this
     * workspace ever published: not only the chosen window, and NOT only the
     * chosen channel. Narrowing it to thirty days would make the best slot
     * change whenever the date control moved, which is the opposite of a
     * pattern.
     *
     * The channel half of that was an audit finding. `/report` prints this same
     * sentence from `readWindow(resolveView({}))`, which is always every
     * channel; had the grid honoured the filter, a reader on
     * `/analytics?channel=instagram` could see "Tuesday morning does best" while
     * the report said Thursday evening. Same function, same arithmetic, two
     * different answers. Ignoring the filter here is what makes the shared
     * selector actually shared.
     */
    const timed: TimedPost[] = legs.map((leg) => ({
      postId: leg.postId,
      channel: leg.channel,
      publishedAt: leg.publishedAt,
      aged: aged.get(`${leg.postId}:${leg.channel}`) ?? {
        postId: `${leg.postId}:${leg.channel}`,
        // UTC, to match the basis every stored reading is dated on. See
        // `utcDayOf`, which explains why this is not the local day.
        publishedOn: utcDayOf(leg.publishedAt) ?? '',
        readings: [],
      },
    }))

    return {
      kind: 'ready',
      timezone,
      rows,
      postsPublished: new Set(visible.map((leg) => leg.postId)).size,
      postsPublishedPrevious: new Set(previousLegs.map((leg) => leg.postId)).size,
      weeksOfHistory,
      ageDays,
      timing:
        ageDays === null
          ? { kind: 'none', reason: 'no-common-age' }
          : timingGrid(timed, ageDays, timezone),
    }
  } catch {
    return { kind: 'unreadable' }
  }
}

function readingValue(post: AgedPost | undefined, age: number): number | null {
  if (!post) return null
  for (const reading of post.readings) {
    const from = Date.parse(`${post.publishedOn}T00:00:00Z`)
    const to = Date.parse(`${reading.measuredOn}T00:00:00Z`)
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue
    if (Math.round((to - from) / DAY_MS) === age) return reading.value
  }
  return null
}

/**
 * THE DAY A POST WENT OUT, IN UTC — AND WHY THIS ONE IS NOT THE LOCAL DAY.
 *
 * There are two different "days" on this page and conflating them is a real
 * defect, so they are two functions with two arguments for it.
 *
 * The WINDOW is the reader's question: "what went out in August?" means their
 * August, so `dayIn` cuts it in the workspace's zone.
 *
 * An AGE is arithmetic against a stored reading, and `post_metric_snapshots`
 * derives `measured_on` as `(measured_at at time zone 'UTC')::date`. Subtracting
 * a local publish day from a UTC measurement day would shift every age by one
 * for any post published after the zone's UTC offset, quietly reading half the
 * workspace's posts a day early. So this stays UTC, matching the column it is
 * subtracted from.
 */
function utcDayOf(iso: string): string | null {
  const at = Date.parse(iso)
  return Number.isFinite(at) ? new Date(at).toISOString().slice(0, 10) : null
}

/**
 * One `AgedPost` per publish leg, for ONE metric.
 *
 * The metric is a parameter rather than a filter applied by the caller because
 * an `AgedPost` whose `readings` mixed two metrics would be silently wrong:
 * `readingAtAge` picks a reading by DAY, so a day carrying impressions but not
 * reach would answer the reach question with an impressions number. Nothing
 * downstream could detect that, because both are plain counts.
 */
export function agedFor(
  legs: ReadonlyArray<{ postId: string; channel: Channel; publishedAt: string }>,
  snapshots: readonly SnapshotReading[],
  metric: MetricKey,
): Map<string, AgedPost> {
  const byKey = new Map<string, AgedPost>()
  for (const leg of legs) {
    const publishedOn = utcDayOf(leg.publishedAt)
    if (publishedOn === null) continue
    const key = `${leg.postId}:${leg.channel}`
    if (byKey.has(key)) continue
    byKey.set(key, {
      postId: key,
      publishedOn,
      readings: snapshots
        .filter((s) => s.metric === metric && s.postId === leg.postId && s.channel === leg.channel)
        .map((s) => ({ measuredOn: s.measuredOn, value: s.value })),
    })
  }
  return byKey
}

async function readTitles(
  supabase: ReturnType<typeof createServerSupabase>,
  workspaceId: string,
  postIds: readonly string[],
): Promise<Map<string, string>> {
  const titles = new Map<string, string>()
  if (postIds.length === 0) return titles
  const { data } = await supabase
    .from('posts')
    .select('id, title, body')
    .eq('workspace_id', workspaceId)
    .in('id', postIds)

  for (const row of data ?? []) {
    if (typeof row.id !== 'string') continue
    const title = typeof row.title === 'string' ? row.title.trim() : ''
    const body = typeof row.body === 'string' ? row.body.trim() : ''
    // The same ladder `page-data.ts` uses, so one post is never called two
    // different things on two screens.
    if (title) titles.set(row.id, title)
    else if (body) titles.set(row.id, body.length > 60 ? `${body.slice(0, 60)}…` : body)
  }
  return titles
}

async function readSnapshots(
  supabase: ReturnType<typeof createServerSupabase>,
  workspaceId: string,
): Promise<RawSnapshot[] | 'unreadable'> {
  // ONE query for all three metrics rather than three queries. The table's
  // unique key is (workspace_id, post_id, channel, metric, measured_on) and
  // there is an index on (workspace_id, metric, measured_on), so a per-metric
  // read would be three round trips for rows this one already carries — and
  // three chances for two of them to come back from different moments.
  const { data, error } = await supabase
    .from('post_metric_snapshots')
    .select('post_id, channel, metric, value, measured_on')
    .eq('workspace_id', workspaceId)
    .in('metric', SNAPSHOT_METRICS)
    .limit(SNAPSHOT_ROW_CAP)

  // A refused read is reported as refused. Every figure downstream refuses
  // politely on an empty history, and that sentence is a claim about the
  // customer's account: saying it because a query failed would be a false one.
  if (error || !data) return 'unreadable'
  if (data.length >= SNAPSHOT_ROW_CAP) return 'unreadable'

  const out: RawSnapshot[] = []
  for (const row of data) {
    const value =
      typeof row.value === 'number'
        ? row.value
        : typeof row.value === 'string'
          ? Number(row.value)
          : Number.NaN
    const measuredOn = typeof row.measured_on === 'string' ? row.measured_on.slice(0, 10) : null
    // `bigint` arrives as a string. A row we cannot read is dropped, never
    // counted as zero: a zero here is a measurement of nothing.
    if (!Number.isFinite(value) || measuredOn === null) continue
    if (typeof row.post_id !== 'string' || typeof row.channel !== 'string') continue
    // A metric this build does not know is DROPPED, never bucketed into one it
    // does. The column's CHECK allows exactly these three today; a fourth added
    // by a migration ahead of this deploy would otherwise land in whichever
    // bucket a cast happened to produce.
    const metric = SNAPSHOT_METRICS.find((known) => known === row.metric)
    if (metric === undefined) continue
    out.push({ postId: row.post_id, channel: row.channel as Channel, metric, value, measuredOn })
  }
  return out
}
