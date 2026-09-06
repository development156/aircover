import type { Channel } from '@sahoda/shared'

import type { PublishedRow } from '@/lib/analytics/window-data'

/**
 * HOW MUCH WENT OUT, AND WHERE. THE TWO CHARTS THAT COUNT PUBLISHES.
 *
 * ── WHY A ZERO IS ALLOWED HERE AND NOWHERE ELSE ON THIS PAGE ─────────────────
 * Every other figure on /analytics is a READING, and a reading we do not hold
 * is a null that must never be drawn as a zero. These two are different in
 * kind: they count rows in the publish log, and the publish log is complete by
 * construction. A week with no bar did not go unmeasured; it had no posts.
 *
 * That makes a zero real knowledge, and `Bars` already draws that distinction
 * for us: a measured zero is a solid stub at the baseline in `--line-firm`, an
 * unmeasured point is nothing at all. Handing these counts through as `0`
 * rather than `null` is deliberate, and it is the whole reason the distinction
 * exists in that component.
 *
 * ── ONE POST IS ONE POST, HOWEVER MANY CHANNELS IT WENT TO ───────────────────
 * `PublishedRow` is a publish LEG, so a post on three channels is three rows.
 * Both counts here are over distinct post ids, which is the same rule
 * `readWindow`'s `postsPublished` follows, so the strip at the top and the
 * columns below it cannot disagree about how much a shop published.
 *
 * Pure: no I/O, no clock beyond the days it is handed, no React.
 */

const DAY_MS = 86_400_000

/** How many distinct posts each channel carried, most first. */
export interface ChannelCount {
  channel: Channel
  posts: number
}

export function postsPerChannel(rows: readonly PublishedRow[]): ChannelCount[] {
  const byChannel = new Map<Channel, Set<string>>()
  for (const row of rows) {
    const seen = byChannel.get(row.channel) ?? new Set<string>()
    seen.add(row.postId)
    byChannel.set(row.channel, seen)
  }
  return (
    [...byChannel.entries()]
      .map(([channel, posts]) => ({ channel, posts: posts.size }))
      // Ties broken by name, so two channels with the same count do not swap
      // places between renders and read as a change.
      .sort((a, b) => b.posts - a.posts || a.channel.localeCompare(b.channel))
  )
}

export interface WeekCount {
  /** Inclusive `YYYY-MM-DD` start of the column, in the workspace's own zone. */
  from: string
  /** Inclusive end. Equal to `from` plus `days - 1`. */
  to: string
  /**
   * How many days this column actually covers.
   *
   * The last one is short whenever the window does not divide by seven, and a
   * two-day column beside four seven-day ones looks like output collapsing. The
   * chart says so rather than letting the calendar draw a fall.
   */
  days: number
  posts: number
}

/**
 * The day an instant falls on, IN A NAMED ZONE.
 *
 * The same rule and the same reason as `window-data.ts`'s own `dayIn`: the
 * window is the reader's question, so it is cut on the reader's clock. A
 * publish at 23:30 UTC on a Friday is Saturday in Kolkata, and bucketing it in
 * UTC would put it in a week the header says it is not in.
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

function addDays(day: string, count: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + count * DAY_MS).toISOString().slice(0, 10)
}

/**
 * Distinct posts per week of the window.
 *
 * ── THE BUCKETS ARE ANCHORED TO THE WINDOW, NOT TO MONDAY ────────────────────
 * A calendar week would clip at both ends, so a reader asking for the last
 * thirty days would get a short column at each end and neither would mean
 * anything about their posting. Anchored at `from`, only the last column can be
 * short, it is always the same one, and it carries its own length.
 */
export function postsPerWeek(
  rows: readonly PublishedRow[],
  view: { from: string; to: string },
  timezone: string,
): WeekCount[] {
  const weeks: WeekCount[] = []
  for (let start = view.from; start <= view.to; start = addDays(start, 7)) {
    const last = addDays(start, 6)
    const to = last <= view.to ? last : view.to
    const days =
      Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS) + 1
    weeks.push({ from: start, to, days, posts: 0 })
  }
  if (weeks.length === 0) return weeks

  const inWeek = weeks.map(() => new Set<string>())
  for (const row of rows) {
    const day = dayIn(row.publishedAt, timezone)
    // A row whose date cannot be read is DROPPED, never bucketed into the first
    // column. An invented week is a claim about when somebody posted.
    if (day === null || day < view.from || day > view.to) continue
    const index = weeks.findIndex((week) => day >= week.from && day <= week.to)
    if (index < 0) continue
    inWeek[index]!.add(row.postId)
  }

  return weeks.map((week, index) => ({ ...week, posts: inWeek[index]!.size }))
}
