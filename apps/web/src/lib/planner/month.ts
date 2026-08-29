/**
 * Month-grid dates, in IST — the same zone `bucketWeek` keys days by.
 *
 * Everything here formats through `Asia/Kolkata` rather than the server's local
 * zone. A planner that bucketed by IST but labelled by UTC would put a post
 * scheduled for 00:30 IST on the previous day's cell, which is the classic
 * off-by-one that only shows up after midnight and only for some users.
 * IST has no DST, so a 24h step advances the IST day exactly once.
 */

const DAY_MS = 86_400_000
const IST = 'Asia/Kolkata'

/** A 6×7 grid — the most any month needs, and a constant height as months change. */
export const MONTH_GRID_DAYS = 42

const DAY_OF_MONTH = new Intl.DateTimeFormat('en-CA', { timeZone: IST, day: 'numeric' })
const MONTH_YEAR = new Intl.DateTimeFormat('en-GB', {
  timeZone: IST,
  month: 'long',
  year: 'numeric',
})
const MONTH_KEY = new Intl.DateTimeFormat('en-CA', {
  timeZone: IST,
  year: 'numeric',
  month: '2-digit',
})
/** `en-GB` is Monday-first, which is what the grid is. */
const WEEKDAY = new Intl.DateTimeFormat('en-GB', { timeZone: IST, weekday: 'short' })
const DAY_KEY = new Intl.DateTimeFormat('en-CA', {
  timeZone: IST,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const FULL_DATE = new Intl.DateTimeFormat('en-GB', {
  timeZone: IST,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const MONDAY_FIRST = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** How many days back the Monday on-or-before `at` is, in IST. */
function istWeekdayOffset(at: Date): number {
  const index = MONDAY_FIRST.indexOf(WEEKDAY.format(at))
  // An unrecognised weekday would silently shift the whole grid, so fail to 0
  // (start on the day itself) rather than to a wrong offset.
  return index < 0 ? 0 : index
}

/**
 * "28 August 2026" — a cell's accessible name.
 *
 * A month grid runs from the Monday on or before the 1st, so it holds days from
 * THREE months and the day-of-month number repeats: a 42-cell August grid has
 * two cells reading "28". Visually the adjacent-month ones are dimmed, but a
 * screen reader hears "28, link" twice with nothing to separate them. This is
 * the name that separates them.
 */
export function istFullDate(at: Date): string {
  return FULL_DATE.format(at)
}

/** The IST day-of-month number, as displayed in a cell. */
export function istDayOfMonth(at: Date): string {
  return DAY_OF_MONTH.format(at)
}

/** "August 2026" — the grid's heading. */
export function istMonthLabel(at: Date): string {
  return MONTH_YEAR.format(at)
}

/** Same IST calendar month AND year — used to dim adjacent-month cells. */
export function isSameIstMonth(a: Date, b: Date): boolean {
  return MONTH_KEY.format(a) === MONTH_KEY.format(b)
}

/**
 * The Monday on or before the 1st of `anchor`'s IST month — where the grid
 * starts, so the first row is a full week rather than a ragged one.
 */
export function firstGridDay(anchor: Date): Date {
  // Walk back to the 1st by IST day-of-month, then back to that week's Monday.
  const dayOfMonth = Number(DAY_OF_MONTH.format(anchor))
  const first = new Date(anchor.getTime() - (dayOfMonth - 1) * DAY_MS)
  return new Date(first.getTime() - istWeekdayOffset(first) * DAY_MS)
}

/** The IST date key (YYYY-MM-DD), matching `bucketWeek`'s own keys. */
export function istDayKey(at: Date): string {
  return DAY_KEY.format(at)
}
