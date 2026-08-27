/**
 * A MONTH GRID IN THE READER'S OWN ZONE.
 *
 * ── WHY THIS DOES NOT REUSE `lib/planner/month.ts` ───────────────────────────
 * That file is the planner's, and every one of its formatters is pinned to
 * `Asia/Kolkata` on purpose: the planner buckets posts by IST day, and labelling
 * those buckets in any other zone would put a post scheduled for 00:30 IST on
 * the previous day's cell. It is correct there and it must stay pinned.
 *
 * The composer's schedule field has always worked in LOCAL wall-clock, and it
 * has to: the native control behind it is `<input type="datetime-local">`, which
 * is local by definition, and `toLocalInput` has always fed it `getFullYear()`
 * and friends. A calendar that highlighted IST days while the field beside it
 * accepted local ones would disagree with itself for every reader outside India
 * — the same off-by-one, one layer up.
 *
 * So this is a second implementation, deliberately, and the comment above is the
 * reason. It is small, pure, and takes its clock as an argument so nothing here
 * can drift from what the caller validated.
 */

/** A 6x7 grid — the most any month needs, and a constant height as months change. */
export const MONTH_GRID_DAYS = 42

/** Monday-first, which is what the planner's grid is and what this matches. */
export const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const

const MONTH_YEAR = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' })
const FULL_DAY = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})
const TIME = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })

/** Midnight local on the same day as `at`. Never mutates the input. */
export function startOfDay(at: Date): Date {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate())
}

/**
 * The Monday on or before the 1st of `anchor`'s month.
 *
 * `getDay()` is Sunday-first (0 = Sunday), and this grid is Monday-first, so
 * Sunday has to become 6 rather than 0. Getting that wrong shifts the entire
 * grid by a day for one seventh of all months, which is exactly the kind of
 * defect that survives review and is caught by a test.
 */
export function firstGridDay(anchor: Date): Date {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const mondayFirst = (first.getDay() + 6) % 7
  return new Date(first.getFullYear(), first.getMonth(), 1 - mondayFirst)
}

/**
 * The 42 days the grid shows, including the trailing days of the previous month
 * and the leading days of the next.
 *
 * ── CALENDAR ARITHMETIC, NOT MILLISECOND ARITHMETIC ──────────────────────────
 * `new Date(y, m, d + index)` asks the constructor to normalise a day number
 * that runs past the end of the month, which is exactly the question being
 * asked. Adding `index * 86_400_000` to a timestamp is a different question and
 * it gets a different answer twice a year.
 *
 * MEASURED under `TZ=America/New_York`, which is why this is not a matter of
 * taste. Stepping by milliseconds and re-normalising through the constructor —
 * the obvious fix, and the one written here first — is right across the spring
 * transition and WRONG across the autumn one: adding 24h to midnight on the
 * fall-back day lands on 23:00 of the SAME day, so the grid repeats a date and
 * skips the next. The test caught it; the reasoning had not.
 */
export function monthGridDays(anchor: Date): Date[] {
  const start = firstGridDay(anchor)
  return Array.from(
    { length: MONTH_GRID_DAYS },
    (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index),
  )
}

/** Same calendar month AND year — used to dim the adjacent-month cells. */
export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

/** Same calendar day — used to mark today and the chosen cell. */
export function isSameDay(a: Date, b: Date): boolean {
  return isSameMonth(a, b) && a.getDate() === b.getDate()
}

/** Step the anchor a whole month, clamped so 31 March back one does not land on 3 March. */
export function shiftMonth(anchor: Date, months: number): Date {
  return new Date(anchor.getFullYear(), anchor.getMonth() + months, 1)
}

/** "August 2026" — the grid's heading. */
export function monthLabel(at: Date): string {
  return MONTH_YEAR.format(at)
}

/** "Thursday, 27 August" — the confirmation line's date half. */
export function longDay(at: Date): string {
  return FULL_DAY.format(at)
}

/** "9:00 am" — the confirmation line's time half. */
export function clockTime(at: Date): string {
  return TIME.format(at)
}

/** Put `time`'s hours and minutes onto `day`'s date, in local zone. */
export function combine(day: Date, hours: number, minutes: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes, 0, 0)
}

/**
 * THE TIMES A PERSON ACTUALLY PICKS.
 *
 * Every half hour from 06:00 to 21:30, which is the window a small business
 * posts in. Not every minute: a 1,440-entry list is a scroll, and the exact
 * control below the grid is still there for 4:45 pm on the 3rd.
 */
export function timeSlots(): { value: string; label: string }[] {
  const slots: { value: string; label: string }[] = []
  for (let minutes = 6 * 60; minutes <= 21 * 60 + 30; minutes += 30) {
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    const value = `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
    slots.push({ value, label: clockTime(new Date(2000, 0, 1, hours, rest)) })
  }
  return slots
}
