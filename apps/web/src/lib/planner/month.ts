import { addDaysInZone, dayKey, startOfDayInZone, weekdayOffset } from '@/lib/time/day-key'
import { instantAtWallClock, partsInZone } from '@/lib/time/zone'

/**
 * Month-grid dates, in the WORKSPACE'S zone.
 *
 * This file used to pin every formatter to `Asia/Kolkata` and step days by
 * 24 hours, with a comment noting that "IST has no DST, so a 24h step advances
 * the IST day exactly once". True, and the reason it could not be reused for
 * any other zone. The formatters now live in `lib/time/day-key.ts`, take the
 * zone as an argument, and step by calendar date; what is left here is the one
 * decision a month grid makes: where it starts.
 */

/** A 6×7 grid — the most any month needs, and a constant height as months change. */
export const MONTH_GRID_DAYS = 42

/**
 * Midnight, in `zone`, of the Monday on or before the 1st of `anchor`'s month —
 * where the grid starts, so the first row is a full week rather than a ragged
 * one.
 */
export function firstGridDay(zone: string, anchor: Date): Date {
  // Walk back to the 1st by the zone's day-of-month, then back to that week's
  // Monday. Both steps are calendar steps, so a transition week is one day
  // shorter or longer and still one day.
  const first = startOfDayInZone(
    zone,
    addDaysInZone(zone, anchor, 1 - partsInZone(zone, anchor).day),
  )
  return addDaysInZone(zone, first, -weekdayOffset(zone, first))
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** `YYYY-MM` on the calendar a reader in `zone` keeps — the `?month=` a grid is anchored on. */
export function monthKeyOf(zone: string, at: Date): string {
  const p = partsInZone(zone, at)
  return `${p.year}-${pad(p.month)}`
}

/**
 * The instant a `?month=` key anchors on: the 1st of that month at the zone's
 * midnight. With no key the anchor is `now` itself, so "this month" needs no
 * parameter and has one canonical URL.
 */
export function monthAnchorFrom(zone: string, monthKey: string | null, now: Date): Date {
  if (monthKey === null) return now
  const [year, month] = monthKey.split('-').map(Number)
  if (year === undefined || month === undefined) return now
  return instantAtWallClock(zone, { year, month, day: 1, hour: 0, minute: 0 })
}

/**
 * The 1st of the month `months` away, at the zone's midnight. To the 1st so
 * 31 March back one lands on 1 February rather than on 3 March. The same
 * arithmetic as `calendar-month.ts`'s `shiftMonth`, kept here because that
 * module imports this one and the planner must not import it back.
 */
export function stepMonth(zone: string, anchor: Date, months: number): Date {
  const p = partsInZone(zone, anchor)
  // `Date.UTC` normalises a month outside 0-11 into the right year.
  const moved = new Date(Date.UTC(p.year, p.month - 1 + months, 1))
  return instantAtWallClock(zone, {
    year: moved.getUTCFullYear(),
    month: moved.getUTCMonth() + 1,
    day: 1,
    hour: 0,
    minute: 0,
  })
}

/** The 42 day keys a month grid for `anchor` draws, in `zone`. */
export function monthGridKeys(zone: string, anchor: Date): string[] {
  const start = firstGridDay(zone, anchor)
  return Array.from({ length: MONTH_GRID_DAYS }, (_, i) =>
    dayKey(zone, addDaysInZone(zone, start, i)),
  )
}
