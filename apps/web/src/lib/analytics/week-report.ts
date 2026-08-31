import type { Channel } from '@sahoda/shared'

import {
  compareGroups,
  MIN_GROUPS,
  MIN_POSTS_PER_GROUP,
  type GroupComparison,
} from '@/lib/analytics/grouped-lift'
import {
  normalFor,
  readingAtAge,
  valueAtAge,
  type AgedPost,
  type Normal,
  COMPARE_AGE_DAYS,
} from '@/lib/analytics/like-age'
import { isoWeekOf, isoWeekStart } from '@/lib/loop/iso-week'

/**
 * ONE WEEK, AS AN EMPLOYEE WOULD REPORT IT.
 *
 * ── WHY THIS IS NOT A DASHBOARD ──────────────────────────────────────────────
 * Every analytics page in the world leads with metrics and leaves the thinking
 * to the reader. This product's whole promise is that the owner never has to do
 * that thinking, so the shape is inverted: a verdict in plain English first, and
 * numbers underneath as the evidence for it.
 *
 * That inversion is only honest if the verdict is DERIVED. A headline sentence
 * is the easiest place in this product to state something no row supports, and
 * it is the hardest place for a reader to notice. So every field below is either
 * a value that came out of `post_metric_snapshots` or an explicit refusal
 * carrying the reason — there is no third state, and nothing here has a default.
 *
 * ── THE AGE PROBLEM, WHICH IS EVERYWHERE ON THIS SCREEN ──────────────────────
 * Stored values are running lifetime totals. A post published on Monday has six
 * more days of accumulating than one published on Saturday, so ANY comparison
 * between raw totals — this week against last, the week's best against its
 * worst — measures how long ago something went out and reports it as how well it
 * did. Both comparisons here are therefore made at a COMMON AGE, and both refuse
 * when no common age exists.
 *
 * Pure: no I/O, no clock, no React.
 */

/** How far back the pattern behind the verdict is allowed to look. */
export const VERDICT_WINDOW_DAYS = 56

/** Posts a ranking needs before "best" and "worst" are different things. */
export const MIN_RANKED_POSTS = 2

/**
 * How long after a week ends its report stops changing.
 *
 * ── A WEEK'S CARD HAS TO STOP MOVING, AND IT HAS TO USE READINGS TAKEN AFTER IT
 * Two requirements that pull against each other. Readings keep arriving for
 * weeks after a post goes out, so a card that used every reading ever taken
 * would show August figures on a January week — MEASURED, and a real defect in
 * the first version of this file. But a card cut off at the last day of its own
 * week could never show the seven-day reading that every comparison here is
 * built on, because a Saturday post reaches seven days old the following
 * Saturday.
 *
 * So the cutoff is the end of the week plus this. Fourteen days is twice the
 * comparison age, which leaves room for a collecting job that missed a day, and
 * it means a week's report settles a fortnight after the week and never moves
 * again. Scrolling back through the stack shows what each week actually was, not
 * this morning's numbers printed under every old date.
 */
export const REPORT_SETTLES_DAYS = 14

/**
 * Posts a VERDICT needs before it is worth attempting.
 *
 * Two arms of three. Derived rather than written down so it cannot drift from
 * the gates that will judge it a moment later.
 */
export const MIN_VERDICT_POSTS = MIN_POSTS_PER_GROUP * MIN_GROUPS

/** One channel of one post, once it has gone out. */
export interface Publication {
  postId: string
  title: string
  channel: Channel
  /** ISO instant the channel published. */
  publishedAt: string
}

/** One stored reading, as `post_metric_snapshots` holds it. */
export interface Snapshot {
  postId: string
  channel: Channel
  metric: string
  value: number
  /** `YYYY-MM-DD`, UTC. */
  measuredOn: string
}

/** What the Loop did in a week, and the reason it gave at the time. */
export interface WeekChanges {
  isoYear: number
  isoWeek: number
  did: ReadonlyArray<{ what: string; why: string | null }>
  /**
   * Why nothing changed, when nothing did. One of `reflect`'s reasons, or null
   * for a cycle written before the reason was stored — which is not the same as
   * "no reason" and must not be turned into a sentence.
   */
  nothingReason: string | null
}

/** A post ranked against its neighbours at the same age. */
export interface RankedPost {
  postId: string
  title: string
  channel: Channel
  value: number
}

export interface WeekReport {
  /** `2026-W34`. Stable, and the React key. */
  key: string
  isoYear: number
  isoWeek: number
  /** `YYYY-MM-DD` bounds, inclusive. */
  startsOn: string
  endsOn: string
  /** Distinct posts with at least one channel published this week. */
  posts: number
  channels: Channel[]
  /**
   * The headline finding, or why there is not one.
   *
   * `basis` names what was compared, because "Tuesdays beat Fridays" and
   * "Instagram beats LinkedIn" are different sentences and the reader has to
   * know which they are being told.
   */
  verdict: { basis: 'weekday' | 'channel'; comparison: GroupComparison }
  /** One per channel published this week. Never mixed — see `normalFor`. */
  normals: ReadonlyArray<{ channel: Channel; normal: Normal }>
  /**
   * Best and worst, measured at the same age, or null.
   *
   * `ageDays` is stated with them and is not decoration: a ranking of totals at
   * different ages is a ranking of publish dates.
   */
  ranked: { top: RankedPost; bottom: RankedPost; ageDays: number; of: number } | null
  /**
   * Reach added up across the week's posts, and how many of them reported.
   *
   * ── WHY THE LABEL ON THIS ONE MATTERS SO MUCH ──────────────────────────────
   * It is a SUM OF PER-POST REACH, which is not the number of different people
   * who saw you: somebody who saw three of the posts is in it three times. The
   * platforms report reach per post and there is no way from here to a unique
   * count, so the honest thing is to say what the figure is and never to call it
   * "people reached". The screen's label carries that and this comment is why.
   *
   * Null rather than 0 when nothing reported, and `of` is every published
   * channel that week including the silent ones, so a sum from half the week is
   * visibly a sum from half the week.
   */
  total: { value: number; measured: number; of: number } | null
  /** Null when the Loop never ran for this week at all. */
  changes: WeekChanges | null
}

const DAY_MS = 86_400_000

/** `YYYY-MM-DD` of an instant, UTC, or null when it is unreadable. */
function dayOf(iso: string): string | null {
  const at = Date.parse(iso)
  return Number.isFinite(at) ? new Date(at).toISOString().slice(0, 10) : null
}

/**
 * The weekday a post went out, as a name.
 *
 * The arm label a reader actually reads. Names rather than numbers because they
 * are also what `compareGroups` sorts ties by, and "Friday" beating "Monday"
 * alphabetically is at least a stable, explicable tie-break.
 */
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function weekdayOf(iso: string): string | null {
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return null
  return WEEKDAYS[new Date(at).getUTCDay()] ?? null
}

/** Turn publications and readings into the aged shape the baseline compares. */
function agedPosts(
  publications: readonly Publication[],
  snapshots: readonly Snapshot[],
  metric: string,
): AgedPost[] {
  const out: AgedPost[] = []
  for (const publication of publications) {
    const publishedOn = dayOf(publication.publishedAt)
    if (publishedOn === null) continue
    const readings = snapshots
      .filter(
        (s) =>
          s.postId === publication.postId &&
          s.channel === publication.channel &&
          s.metric === metric,
      )
      .map((s) => ({ measuredOn: s.measuredOn, value: s.value }))
    out.push({ postId: `${publication.postId}:${publication.channel}`, publishedOn, readings })
  }
  return out
}

/**
 * The oldest age at which enough of these posts were all measured.
 *
 * OLDEST, not youngest: a later age is a fairer read of how a post finally did,
 * and every post that reaches it was measured there by definition of the search.
 * Returns null when no single age has `MIN_RANKED_POSTS` posts at it — which is
 * the common case early on, and the correct answer then is no ranking at all.
 */
export function commonAge(
  posts: readonly AgedPost[],
  maxAge = COMPARE_AGE_DAYS * 4,
  minPosts = MIN_RANKED_POSTS,
): number | null {
  for (let age = maxAge; age >= 0; age -= 1) {
    const at = posts.filter((post) => valueAtAge(post, age) !== null)
    if (at.length >= minPosts) return age
  }
  return null
}

/**
 * Every week that published something, newest first.
 *
 * A week with no publication is not rendered as an empty week: nothing happened,
 * and a row saying so every seven days would bury the weeks that did.
 */
export function weekReports(input: {
  publications: readonly Publication[]
  snapshots: readonly Snapshot[]
  changes: readonly WeekChanges[]
  metric?: string
}): WeekReport[] {
  const metric = input.metric ?? 'reach'

  const byWeek = new Map<string, { isoYear: number; isoWeek: number; rows: Publication[] }>()
  for (const publication of input.publications) {
    const at = Date.parse(publication.publishedAt)
    if (!Number.isFinite(at)) continue
    const { isoYear, isoWeek } = isoWeekOf(new Date(at))
    const key = `${isoYear}-W${String(isoWeek).padStart(2, '0')}`
    const bucket = byWeek.get(key) ?? { isoYear, isoWeek, rows: [] }
    bucket.rows.push(publication)
    byWeek.set(key, bucket)
  }

  const reports: WeekReport[] = []
  for (const [key, bucket] of byWeek) {
    const start = isoWeekStart(bucket.isoYear, bucket.isoWeek)
    const startsOn = start.toISOString().slice(0, 10)
    const endsOn = new Date(start.getTime() + 6 * DAY_MS).toISOString().slice(0, 10)

    /**
     * EVERY FIGURE ON THIS CARD IS COMPUTED FROM READINGS TAKEN BY THIS DATE.
     *
     * Filtered ONCE, here, rather than in each of the four helpers below. The
     * first version of this file filtered the publications and forgot the
     * readings, so a January card rendered August's numbers and its own comment
     * claimed it did not. One cutoff applied in one place is the only version of
     * this that cannot drift apart from itself.
     */
    const asOf = new Date(Date.parse(`${endsOn}T00:00:00Z`) + REPORT_SETTLES_DAYS * DAY_MS)
      .toISOString()
      .slice(0, 10)
    const known = input.snapshots.filter((snapshot) => snapshot.measuredOn <= asOf)

    reports.push({
      key,
      isoYear: bucket.isoYear,
      isoWeek: bucket.isoWeek,
      startsOn,
      endsOn,
      posts: new Set(bucket.rows.map((row) => row.postId)).size,
      channels: [...new Set(bucket.rows.map((row) => row.channel))].sort(),
      verdict: verdictFor(input.publications, known, endsOn, metric),
      normals: normalsFor(bucket.rows, input.publications, known, startsOn, metric),
      ranked: rankingFor(bucket.rows, known, metric),
      total: totalFor(bucket.rows, known, metric),
      changes:
        input.changes.find(
          (change) => change.isoYear === bucket.isoYear && change.isoWeek === bucket.isoWeek,
        ) ?? null,
    })
  }

  return reports.sort((a, b) => b.key.localeCompare(a.key))
}

/**
 * The headline, from a rolling window rather than the week alone.
 *
 * ── WHY THE WINDOW IS WIDER THAN THE WEEK ────────────────────────────────────
 * A comparison needs three posts per arm. A shop publishing four times a week
 * can never fill two arms from one week, so a verdict scoped to the week alone
 * would refuse forever and the page would never once demonstrate the thing it
 * exists to demonstrate. The window is what a colleague actually means: "your
 * Tuesdays do better" is a claim about the last two months, said this week.
 *
 * ── AND WHY EVERY POST IN IT IS READ AT THE SAME AGE ─────────────────────────
 * THIS IS THE WHOLE DEFENCE OF THE SENTENCE THIS PAGE LEADS WITH, and the first
 * version of this function did not have it. Stored values are running lifetime
 * totals, so feeding raw readings from a 56-day window into a comparison of
 * means compares a post published in June against one published on Friday.
 *
 * MEASURED on the version that shipped without this: three Tuesday posts aged
 * 40, 33 and 26 days against three Friday posts aged 3, every post earning
 * exactly 100 reach a day so that performance was identical by construction. It
 * reported "Your Tuesday posts reach more people than your Friday ones", 1,700
 * against 200, a lift of 8.5. Every figure came from a real row and the finding
 * was entirely publish date.
 *
 * So each post contributes exactly ONE reading, taken at one age shared across
 * the window. `MIN_MEASURED_DAYS` then counts the distinct days those readings
 * fall on, which is the spread of PUBLISHING dates — which is what that gate was
 * always trying to measure.
 *
 * The window ends at the week being reported, and the readings are already cut
 * off at that week's settling date by the caller, so scrolling back shows what
 * each week was rather than this morning's answer under every old date.
 *
 * Weekday first, channel second: the weekday finding is the one a reader can act
 * on without changing anything about their business. When neither clears the
 * gates the weekday reason is the one reported, because it is the question that
 * was asked first.
 */
function verdictFor(
  publications: readonly Publication[],
  snapshots: readonly Snapshot[],
  endsOn: string,
  metric: string,
): { basis: 'weekday' | 'channel'; comparison: GroupComparison } {
  const end = Date.parse(`${endsOn}T23:59:59Z`)
  const from = end - VERDICT_WINDOW_DAYS * DAY_MS
  const inWindow = publications.filter((publication) => {
    const at = Date.parse(publication.publishedAt)
    return Number.isFinite(at) && at <= end && at >= from
  })

  if (snapshots.length === 0)
    return { basis: 'weekday', comparison: { kind: 'none', reason: 'no_history' } }

  const aged = agedPosts(inWindow, snapshots, metric)
  const age = commonAge(aged, COMPARE_AGE_DAYS * 8, MIN_VERDICT_POSTS)
  // Not enough posts have reached any single age together. That is a statement
  // about how much has been measured, which is what `too_few_posts` means.
  if (age === null)
    return { basis: 'weekday', comparison: { kind: 'none', reason: 'too_few_posts' } }

  const meta = new Map<string, { weekday: string | null; channel: Channel }>()
  for (const publication of inWindow) {
    meta.set(`${publication.postId}:${publication.channel}`, {
      weekday: weekdayOf(publication.publishedAt),
      channel: publication.channel,
    })
  }

  const readings: Array<{ key: string; measuredOn: string; value: number }> = []
  for (const post of aged) {
    const reading = readingAtAge(post, age)
    if (reading === null) continue
    readings.push({ key: post.postId, measuredOn: reading.measuredOn, value: reading.value })
  }

  const byWeekday = compareGroups(
    readings
      .filter((row) => meta.get(row.key)?.weekday != null)
      .map((row) => ({
        postId: row.key,
        group: meta.get(row.key)?.weekday as string,
        metric,
        value: row.value,
        measuredOn: row.measuredOn,
      })),
    metric,
  )
  if (byWeekday.kind === 'lift') return { basis: 'weekday', comparison: byWeekday }

  const byChannel = compareGroups(
    readings.map((row) => ({
      postId: row.key,
      group: meta.get(row.key)?.channel as string,
      metric,
      value: row.value,
      measuredOn: row.measuredOn,
    })),
    metric,
  )
  if (byChannel.kind === 'lift') return { basis: 'channel', comparison: byChannel }

  return { basis: 'weekday', comparison: byWeekday }
}

/** One baseline per channel this week used, each against its own history. */
function normalsFor(
  weekRows: readonly Publication[],
  publications: readonly Publication[],
  snapshots: readonly Snapshot[],
  startsOn: string,
  metric: string,
): Array<{ channel: Channel; normal: Normal }> {
  const start = Date.parse(`${startsOn}T00:00:00Z`)
  const channels = [...new Set(weekRows.map((row) => row.channel))].sort()

  return channels.map((channel) => {
    const week = agedPosts(
      weekRows.filter((row) => row.channel === channel),
      snapshots,
      metric,
    )
    // STRICTLY BEFORE this week. A baseline that included the week being judged
    // would be comparing it partly against itself, which drags every verdict
    // toward "normal" by exactly the amount the week was unusual.
    const earlier = agedPosts(
      publications.filter((row) => {
        const at = Date.parse(row.publishedAt)
        return row.channel === channel && Number.isFinite(at) && at < start
      }),
      snapshots,
      metric,
    )
    return { channel, normal: normalFor(week, earlier) }
  })
}

/**
 * The week's reach, summed from the latest reading of each post that reported.
 *
 * The LATEST reading, because the stored value is a running total and the most
 * recent one is the fullest picture that post has. Posts that reported nothing
 * are counted in `of` and contribute nothing to `value` — a sum that quietly
 * dropped them would be a subtotal wearing a total's clothes.
 */
function totalFor(
  weekRows: readonly Publication[],
  snapshots: readonly Snapshot[],
  metric: string,
): WeekReport['total'] {
  let value = 0
  let measured = 0
  for (const row of weekRows) {
    const readings = snapshots
      .filter((s) => s.postId === row.postId && s.channel === row.channel && s.metric === metric)
      .sort((a, b) => a.measuredOn.localeCompare(b.measuredOn))
    const latest = readings[readings.length - 1]
    if (!latest) continue
    value += latest.value
    measured += 1
  }
  // Null, never 0. A zero here would be a measurement of nothing, which is a
  // claim; null lets the screen say it has no reading, which is the true one.
  if (measured === 0) return null
  return { value, measured, of: weekRows.length }
}

/** Best and worst among the week's posts, at one age or not at all. */
function rankingFor(
  weekRows: readonly Publication[],
  snapshots: readonly Snapshot[],
  metric: string,
): WeekReport['ranked'] {
  const aged = agedPosts(weekRows, snapshots, metric)
  const age = commonAge(aged)
  if (age === null) return null

  const titles = new Map(weekRows.map((row) => [`${row.postId}:${row.channel}`, row]))
  const scored = aged
    .map((post) => ({ post, value: valueAtAge(post, age) }))
    .filter((row): row is { post: AgedPost; value: number } => row.value !== null)
    .map((row) => {
      const source = titles.get(row.post.postId)
      return {
        postId: source?.postId ?? row.post.postId,
        title: source?.title ?? 'Untitled post',
        channel: source?.channel as Channel,
        value: row.value,
      }
    })
    // Ties broken by title so the same week never renders two different orders.
    .sort((a, b) => b.value - a.value || a.title.localeCompare(b.title))

  const top = scored[0]
  const bottom = scored[scored.length - 1]
  // A ranking of one post makes the same post best and worst, which is
  // technically true and useless.
  if (!top || !bottom || scored.length < MIN_RANKED_POSTS) return null
  return { top, bottom, ageDays: age, of: scored.length }
}
