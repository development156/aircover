import type { DisplayPost } from '@/lib/posts/display-post'
import {
  addDaysInZone,
  dayKey,
  minutesIntoDay,
  startOfDayInZone,
  weekdayOffset,
} from '@/lib/time/day-key'

/**
 * A MONDAY-ANCHORED WEEK, so the planner can be navigated.
 *
 * `bucketWeek` starts at TODAY and runs seven days forward, which is right for
 * Home's strip ("what is coming") and wrong for a calendar: a week you can step
 * back and forward through has to have fixed edges, or "previous week" moves by
 * a different amount depending on the day you ask.
 *
 * ── THE ZONE IS THE WORKSPACE'S, PASSED IN, NEVER ASSUMED ────────────────────
 * This file used to export `PLANNER_GRID_ZONE = 'Asia/Kolkata'` and build every
 * column and row from it. When the chip's LABEL was moved to the workspace zone
 * and the placement was not, the two disagreed: an America/New_York workspace
 * with a post at 2026-09-02T20:00-04:00 got a card drawn in the Sept 3 column at
 * the 5 am row, captioned "08:00 pm EDT". Every part of that is a real number
 * and the card is nonsense.
 *
 * Founder's ruling, 2026-09-06: the planner renders in the workspace's zone
 * everywhere, falling back to `DEFAULT_ZONE` when the workspace has none. So
 * every function here takes `zone` first, from the page, and the day arithmetic
 * goes through `lib/time/day-key.ts`, which steps by calendar date rather than
 * by 86,400,000 ms and so survives a daylight-saving week.
 */

/** Minutes past midnight in `zone`, or null when the stamp is absent or unparseable. */
export function scheduledMinutes(zone: string, iso: string | null): number | null {
  if (iso === null) return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  return minutesIntoDay(zone, at)
}

/** Midnight in `zone` of the Monday on or before `at`. */
export function mondayOf(zone: string, at: Date): Date {
  return startOfDayInZone(zone, addDaysInZone(zone, at, -weekdayOffset(zone, at)))
}

/**
 * How many weeks from the week holding `now` the week holding `day` is, in
 * `zone`. Negative for the past. The offset the mini calendar writes when a
 * day is picked in day or week view, so the grid draws the week that holds it.
 *
 * Measured on calendar dates, not elapsed hours: the two Mondays are read as
 * day keys and differenced through `Date.UTC`, so a clock change between them
 * is still exactly seven days.
 */
export function weekOffsetOf(zone: string, now: Date, day: Date): number {
  const utcDay = (at: Date): number => {
    const [y, m, d] = dayKey(zone, mondayOf(zone, at)).split('-').map(Number)
    return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1)
  }
  return Math.round((utcDay(day) - utcDay(now)) / (7 * 86_400_000))
}

export interface WeekWindow {
  /** Seven instants, midnight in the zone of each day, Monday first. */
  days: Date[]
  /** `offset` weeks from the week containing `now`. 0 is this week. */
  offset: number
}

/** The week `offset` weeks from the one containing `now`, in `zone`. */
export function weekWindow(zone: string, now: Date, offset: number): WeekWindow {
  const monday = mondayOf(zone, addDaysInZone(zone, now, offset * 7))
  return {
    days: Array.from({ length: 7 }, (_, i) => addDaysInZone(zone, monday, i)),
    offset,
  }
}

/**
 * The hours the grid draws.
 *
 * ── DERIVED FROM THE WEEK, NOT FIXED AT 8–18 ─────────────────────────────────
 * A fixed window silently HIDES a post scheduled outside it. That is a post the
 * reader planned, absent from the surface whose whole job is showing what is
 * planned, with nothing on screen saying so — the failure mode this codebase
 * calls a measurement that cannot catch a missing thing.
 *
 * So the range covers every scheduled post in the week, padded by an hour each
 * side for air, and falls back to a working day when the week is empty.
 */
export const DEFAULT_FROM_HOUR = 8
export const DEFAULT_TO_HOUR = 19

export function hourRange(
  zone: string,
  posts: readonly DisplayPost[],
): { from: number; to: number } {
  const minutes = posts
    .map((post) => scheduledMinutes(zone, post.scheduled_at))
    .filter((m): m is number => m !== null)

  if (minutes.length === 0) return { from: DEFAULT_FROM_HOUR, to: DEFAULT_TO_HOUR }

  const earliest = Math.floor(Math.min(...minutes) / 60)
  const latest = Math.floor(Math.max(...minutes) / 60)

  return {
    from: Math.max(0, Math.min(earliest - 1, DEFAULT_FROM_HOUR)),
    to: Math.min(23, Math.max(latest + 1, DEFAULT_TO_HOUR)),
  }
}

/**
 * Lay overlapping posts side by side within one day.
 *
 * Posts carry a time, not a DURATION, so "overlap" is a rendering question:
 * two cards drawn at the same y would sit on top of each other. `slotMinutes`
 * is the card's visual height expressed in minutes, and anything closer than
 * that shares the column.
 */
export interface Placed {
  post: DisplayPost
  minutes: number
  /** 0-based column within its overlap group. */
  lane: number
  /** How many columns that group needs. */
  lanes: number
}

export function placeDay(
  zone: string,
  posts: readonly DisplayPost[],
  slotMinutes: number,
): Placed[] {
  const timed = posts
    .map((post) => ({ post, minutes: scheduledMinutes(zone, post.scheduled_at) }))
    .filter((p): p is { post: DisplayPost; minutes: number } => p.minutes !== null)
    .sort((a, b) => a.minutes - b.minutes)

  const out: Placed[] = []
  let group: typeof timed = []

  const flush = (): void => {
    group.forEach((entry, i) => {
      out.push({ ...entry, lane: i, lanes: group.length })
    })
    group = []
  }

  for (const entry of timed) {
    // A new group starts as soon as this post clears the FIRST post in the
    // current one: cards are a fixed height, so the group's extent is its
    // earliest member plus one slot, not its latest.
    if (group.length > 0 && entry.minutes - group[0]!.minutes >= slotMinutes) flush()
    group.push(entry)
  }
  flush()

  return out
}

/**
 * The ONE day the day view draws.
 *
 * ── A SELECTION, NOT A FILTER, AND THAT IS THE WHOLE FIX ─────────────────────
 * The page used to write `window.days.filter(isToday)`. A filter can return
 * nothing, and it did: `weekWindow(now, offset)` holds the days of the week
 * `offset` weeks away, so on any week but this one the day view was handed an
 * empty array and drew no column at all. "Next week" in day view is one click,
 * and the navigation label above the blank grid still read the full seven-day
 * range.
 *
 * The day view needs exactly one column, always. So this SELECTS one, and the
 * three fallbacks are ordered by what the reader asked for:
 *
 *   1. the date they picked, when it is in the week being shown
 *   2. today, when today is in the week being shown
 *   3. that week's Monday, which is the only remaining honest answer
 *
 * `window.days` always holds seven entries, so the last fallback cannot be
 * undefined and there is no fourth case.
 *
 * A picked date OUTSIDE the shown week falls to 2 or 3 rather than drawing
 * nothing: the page's own off-grid note already tells the reader their posts sit
 * elsewhere and offers the list, whereas a blank grid under a labelled week says
 * nothing whatever.
 */
export function dayColumn(
  zone: string,
  window: WeekWindow,
  dateKey: string | null,
  now: Date,
): Date {
  const picked = dateKey === null ? undefined : window.days.find((d) => dayKey(zone, d) === dateKey)
  const todayKey = dayKey(zone, now)
  const today = window.days.find((d) => dayKey(zone, d) === todayKey)
  return picked ?? today ?? window.days[0]!
}
