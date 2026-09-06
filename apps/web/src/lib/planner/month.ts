import { addDaysInZone, dayKey, startOfDayInZone, weekdayOffset } from '@/lib/time/day-key'
import { partsInZone } from '@/lib/time/zone'

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

/** The 42 day keys a month grid for `anchor` draws, in `zone`. */
export function monthGridKeys(zone: string, anchor: Date): string[] {
  const start = firstGridDay(zone, anchor)
  return Array.from({ length: MONTH_GRID_DAYS }, (_, i) =>
    dayKey(zone, addDaysInZone(zone, start, i)),
  )
}
