import { firstGridDay, MONTH_GRID_DAYS } from '@/lib/planner/month'
import {
  addDaysInZone,
  dayOfMonth,
  isSameDay,
  isSameMonth,
  monthLabel,
  startOfDayInZone,
} from '@/lib/time/day-key'
import { instantAtWallClock, partsInZone } from '@/lib/time/zone'

/**
 * A MONTH GRID IN THE WORKSPACE'S ZONE.
 *
 * ── WHAT CHANGED, AND WHY THE OLD HEADER IS GONE ─────────────────────────────
 * This file used to say, at length, why it could not reuse `lib/planner/month.ts`:
 * that file was pinned to IST and this one worked in the BROWSER'S local clock,
 * because the native control behind it was `<input type="datetime-local">`. Both
 * halves of that are over. The planner takes its zone as an argument now, and
 * the picker builds its instants with `instantAtWallClock` in the same zone the
 * planner draws in — the workspace's — so a customer in Dubai who picks
 * "tomorrow morning" is confirmed 9:00 am GST and the posts list calls the same
 * post 9:00 am GST. One post, one time. Founder's ruling, 2026-09-06.
 *
 * So the grid's start and its 42-day run come from the planner's own module,
 * and the calendar arithmetic that MEASURED wrong under `America/New_York`
 * (a 24-hour step across the autumn transition repeating a date) lives once, in
 * `lib/time/day-key.ts`, with the transition weeks pinned there.
 *
 * Every function takes the zone FIRST and explicitly. No default: a call site
 * that forgets it should fail to compile rather than quietly build a time on
 * somebody else's clock.
 */

export { MONTH_GRID_DAYS, firstGridDay }
export { dayOfMonth, isSameDay, isSameMonth, monthLabel }

/** Monday-first, which is what the planner's grid is and what this matches. */
export const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const

const CACHE = new Map<string, Intl.DateTimeFormat>()

function formatter(zone: string, shape: string, options: Intl.DateTimeFormatOptions) {
  const key = `${zone}|${shape}`
  let f = CACHE.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { ...options, timeZone: zone })
    CACHE.set(key, f)
  }
  return f
}

/** Midnight in `zone` on the same day as `at`. Never mutates the input. */
export function startOfDay(zone: string, at: Date): Date {
  return startOfDayInZone(zone, at)
}

/**
 * The 42 days the grid shows, including the trailing days of the previous month
 * and the leading days of the next — each one that day's midnight in `zone`.
 */
export function monthGridDays(zone: string, anchor: Date): Date[] {
  const start = firstGridDay(zone, anchor)
  return Array.from({ length: MONTH_GRID_DAYS }, (_, index) => addDaysInZone(zone, start, index))
}

/** Step the anchor a whole month, to the 1st, so 31 March back one does not land on 3 March. */
export function shiftMonth(zone: string, anchor: Date, months: number): Date {
  const p = partsInZone(zone, anchor)
  // `Date.UTC` normalises a month outside 0–11 into the right year.
  const moved = new Date(Date.UTC(p.year, p.month - 1 + months, 1))
  return instantAtWallClock(zone, {
    year: moved.getUTCFullYear(),
    month: moved.getUTCMonth() + 1,
    day: 1,
    hour: 0,
    minute: 0,
  })
}

/** "Thursday, 27 August" — the confirmation line's date half. */
export function longDay(zone: string, at: Date): string {
  return formatter(zone, 'long-day', { weekday: 'long', day: 'numeric', month: 'long' }).format(at)
}

/** "Thursday, 27 August 2026" — a cell's accessible name, which a grid spanning December needs. */
export function longLabel(zone: string, at: Date): string {
  return formatter(zone, 'long-label', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(at)
}

/** "9:00 am" — the confirmation line's time half. */
export function clockTime(zone: string, at: Date): string {
  return formatter(zone, 'clock', { hour: 'numeric', minute: '2-digit', hour12: true }).format(at)
}

const pad = (value: number): string => String(value).padStart(2, '0')

/** `HH:mm` in `zone`, which is what both time controls speak. */
export function timeValue(zone: string, at: Date): string {
  const p = partsInZone(zone, at)
  return `${pad(p.hour)}:${pad(p.minute)}`
}

/**
 * The instant a reader in `zone` means by `hours:minutes` on `day`'s date.
 *
 * Seconds and milliseconds are zero by construction, so a stored schedule
 * round-trips through the minute-precision field without drifting.
 */
export function combine(zone: string, day: Date, hours: number, minutes: number): Date {
  const p = partsInZone(zone, day)
  return instantAtWallClock(zone, {
    year: p.year,
    month: p.month,
    day: p.day,
    hour: hours,
    minute: minutes,
  })
}

/** "4:45 pm" for an `HH:mm` value. Zone-free: it labels a wall clock, not an instant. */
export function slotLabel(value: string): string {
  const [hours, minutes] = value.split(':').map(Number)
  return clockTime('UTC', new Date(Date.UTC(2000, 0, 1, hours ?? 9, minutes ?? 0)))
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
    const value = `${pad(hours)}:${pad(rest)}`
    slots.push({ value, label: slotLabel(value) })
  }
  return slots
}
