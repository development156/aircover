import { instantAtWallClock, partsInZone } from '@/lib/time/zone'

/**
 * CALENDAR ARITHMETIC IN A NAMED ZONE.
 *
 * ── WHAT THIS REPLACES ───────────────────────────────────────────────────────
 * The planner carried three copies of an IST day-key formatter
 * (`week-window.ts`, `month.ts`, `week.ts`), two copies of a Monday-first
 * weekday offset, and stepped days by adding 86,400,000 ms. All of it was right
 * for `Asia/Kolkata`, which has no daylight saving, and wrong for a workspace
 * whose zone does: across the autumn transition a 24-hour step from midnight
 * lands at 23:00 of the same day, so a grid built that way repeats a date and
 * skips the next. `lib/posts/calendar-month.ts` measured exactly that under
 * `America/New_York` and documented it.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────
 * Step by WALL-CLOCK DATE, never by elapsed time. Read the wall clock in the
 * zone, move the date on the calendar, and ask `instantAtWallClock` which
 * instant a reader there means by it. That function already owns the two
 * awkward cases (an hour that happens twice, an hour that never happens) and
 * is pinned by its own tests, so nothing here re-derives an offset.
 *
 * Every function takes the zone FIRST and explicitly. There is no default:
 * a call site that forgets the zone should fail to compile rather than quietly
 * rendering in Kolkata for a shop in Auckland.
 */

const MONDAY_FIRST = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** One formatter per zone and shape. `Intl.DateTimeFormat` is costly to build and these repeat per row. */
const CACHE = new Map<string, Intl.DateTimeFormat>()

function formatter(
  zone: string,
  locale: string,
  shape: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${zone}|${locale}|${shape}`
  let f = CACHE.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { ...options, timeZone: zone })
    CACHE.set(key, f)
  }
  return f
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** `YYYY-MM-DD` on the calendar a reader in `zone` keeps. The key every planner bucket uses. */
export function dayKey(zone: string, at: Date): string {
  const p = partsInZone(zone, at)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

/** How many days back the Monday on-or-before `at` is, in `zone`. 0 on a Monday, 6 on a Sunday. */
export function weekdayOffset(zone: string, at: Date): number {
  // `en-GB` is Monday-first, which is what every grid here is.
  const index = MONDAY_FIRST.indexOf(
    formatter(zone, 'en-GB', 'weekday', { weekday: 'short' }).format(at),
  )
  // An unrecognised weekday would silently shift a whole grid, so fail to 0
  // (start on the day itself) rather than to a wrong offset.
  return index < 0 ? 0 : index
}

/** Midnight in `zone` on the calendar day `at` falls on there. Never mutates the input. */
export function startOfDayInZone(zone: string, at: Date): Date {
  const p = partsInZone(zone, at)
  return instantAtWallClock(zone, { year: p.year, month: p.month, day: p.day, hour: 0, minute: 0 })
}

/**
 * `at` moved `n` calendar days in `zone`, keeping its wall clock.
 *
 * The date is normalised through `Date.UTC`, which is the one place JavaScript
 * will carry "the 31st plus one" into the next month correctly. The result is
 * then read back through the zone, so a day that is 23 or 25 hours long is
 * still one day.
 */
export function addDaysInZone(zone: string, at: Date, n: number): Date {
  if (n === 0) return new Date(at.getTime())
  const p = partsInZone(zone, at)
  const moved = new Date(Date.UTC(p.year, p.month - 1, p.day + n))
  return instantAtWallClock(zone, {
    year: moved.getUTCFullYear(),
    month: moved.getUTCMonth() + 1,
    day: moved.getUTCDate(),
    hour: p.hour,
    minute: p.minute,
  })
}

/** Minutes past midnight in `zone`. The row a card sits on in the week grid. */
export function minutesIntoDay(zone: string, at: Date): number {
  const p = partsInZone(zone, at)
  return p.hour * 60 + p.minute
}

/** "17" — the numeral in a calendar cell. */
export function dayOfMonth(zone: string, at: Date): string {
  return String(partsInZone(zone, at).day)
}

/** Same calendar month AND year in `zone`. Used to dim adjacent-month cells. */
export function isSameMonth(zone: string, a: Date, b: Date): boolean {
  const pa = partsInZone(zone, a)
  const pb = partsInZone(zone, b)
  return pa.year === pb.year && pa.month === pb.month
}

/** Same calendar day in `zone`. */
export function isSameDay(zone: string, a: Date, b: Date): boolean {
  return dayKey(zone, a) === dayKey(zone, b)
}

/**
 * "28 August 2026" — a cell's accessible name.
 *
 * A month grid runs from the Monday on or before the 1st, so it holds days from
 * three months and the day-of-month number repeats. Visually the adjacent-month
 * ones are dimmed, but a screen reader hears "28, link" twice with nothing to
 * separate them. This is the name that separates them.
 */
export function fullDateLabel(zone: string, at: Date): string {
  return formatter(zone, 'en-GB', 'full-date', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(at)
}

/** "August 2026" — a month grid's heading. */
export function monthLabel(zone: string, at: Date): string {
  return formatter(zone, 'en-GB', 'month-year', { month: 'long', year: 'numeric' }).format(at)
}
