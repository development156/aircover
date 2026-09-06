import { describe, expect, it } from 'vitest'

import {
  addDaysInZone,
  dayKey,
  dayOfMonth,
  fullDateLabel,
  isSameMonth,
  minutesIntoDay,
  monthLabel,
  startOfDayInZone,
  weekdayOffset,
} from './day-key'
import { partsInZone } from './zone'

/**
 * CALENDAR ARITHMETIC IN A NAMED ZONE, PROVED WHERE IT BREAKS.
 *
 * ── WHY EVERY CASE NAMES A ZONE ──────────────────────────────────────────────
 * The planner kept three copies of an IST day-key formatter and stepped days by
 * adding 86,400,000 ms. Both were right for exactly one zone. `Asia/Kolkata` has
 * no daylight saving, so a 24-hour step always lands on the next calendar day
 * and nobody ever saw it fail. The moment the workspace zone became something a
 * browser can set (commit 9415dcf2), a New York workspace got a week grid built
 * by that arithmetic: across the autumn transition a 24-hour step from midnight
 * lands at 23:00 of the SAME day, so the grid repeats a date and skips the next.
 *
 * So the cases here are mostly the awkward ones: the two US transitions of 2026
 * (8 March forward, 1 November back), New Zealand's, which run the other way
 * round the year, and Kolkata as the control that must keep behaving exactly as
 * it did.
 *
 * ── THE WORKED EXAMPLE THE AUDIT USED ────────────────────────────────────────
 * One instant, `2026-09-02T20:00-04:00`. A New York workspace must file it on
 * 2 September; a Kolkata workspace must file the same instant on 3 September,
 * where it is 05:30 the next morning. Every planner surface keys by `dayKey`,
 * so this one assertion is what keeps the list row, the mini calendar, the
 * month cell, the week column and the today count agreeing with each other.
 */

const KOLKATA = 'Asia/Kolkata'
const NEW_YORK = 'America/New_York'
const AUCKLAND = 'Pacific/Auckland'
const ZONES = [KOLKATA, NEW_YORK, AUCKLAND] as const

/** Days apart, as CALENDAR DATES: the keys re-parsed through UTC, never elapsed ms. */
function keyGap(a: string, b: string): number {
  return (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000
}

/** A wall clock in `zone`, as an instant. */
function at(zone: string, iso: string): Date {
  const [date, time] = iso.split('T') as [string, string]
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const [hh, mm] = time.split(':').map(Number) as [number, number]
  // Build through the zone rather than through a fixed offset, so a wall clock
  // on a transition day is the instant a reader there means.
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm))
  const p = partsInZone(zone, guess)
  const offsetMinutes =
    (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - guess.getTime()) / 60_000
  return new Date(guess.getTime() - offsetMinutes * 60_000)
}

describe('dayKey files an instant on the calendar day its zone reads', () => {
  const AUDIT_INSTANT = new Date('2026-09-02T20:00:00-04:00')

  it('puts the audit’s post on 2 September in New York and 3 September in Kolkata', () => {
    expect(dayKey(NEW_YORK, AUDIT_INSTANT)).toBe('2026-09-02')
    expect(dayKey(KOLKATA, AUDIT_INSTANT)).toBe('2026-09-03')
  })

  it('reads the Kolkata day exactly as the three IST formatters it replaces did', () => {
    // 00:30 IST on the 17th is 19:00 UTC on the 16th. The old `istDayKey` filed
    // this under the 17th, and this must go on doing so.
    expect(dayKey(KOLKATA, new Date('2026-08-16T19:00:00Z'))).toBe('2026-08-17')
    expect(dayOfMonth(KOLKATA, new Date('2026-08-16T19:00:00Z'))).toBe('17')
  })

  it('crosses the date line at Auckland midnight, not at UTC midnight', () => {
    // 11:59 pm NZST on 30 June is 11:59 UTC the same day; a minute later the
    // Auckland day has turned and the UTC one has not.
    expect(dayKey(AUCKLAND, new Date('2026-06-30T11:59:00Z'))).toBe('2026-06-30')
    expect(dayKey(AUCKLAND, new Date('2026-06-30T12:00:00Z'))).toBe('2026-07-01')
  })
})

describe('weekdayOffset is Monday-first in the zone, not in the server', () => {
  it('is 0 on a Monday and 6 on a Sunday', () => {
    // 8 March 2026 is a Sunday everywhere; 9 March a Monday.
    expect(weekdayOffset(NEW_YORK, at(NEW_YORK, '2026-03-08T12:00'))).toBe(6)
    expect(weekdayOffset(NEW_YORK, at(NEW_YORK, '2026-03-09T12:00'))).toBe(0)
    expect(weekdayOffset(KOLKATA, at(KOLKATA, '2026-03-09T00:30'))).toBe(0)
  })

  it('gives the same instant a different weekday in a different zone', () => {
    // The audit instant is Wednesday evening in New York and Thursday morning
    // in Kolkata. A grid keyed by one and labelled by the other puts the card
    // in the wrong column.
    const instant = new Date('2026-09-02T20:00:00-04:00')
    expect(weekdayOffset(NEW_YORK, instant)).toBe(2)
    expect(weekdayOffset(KOLKATA, instant)).toBe(3)
  })
})

describe('startOfDayInZone is that zone’s midnight, on that zone’s date', () => {
  it.each(ZONES)('in %s, reads back as 00:00 with the same day key', (zone) => {
    for (const iso of ['2026-03-08T13:00:00Z', '2026-11-01T13:00:00Z', '2026-09-03T00:00:00Z']) {
      const instant = new Date(iso)
      const start = startOfDayInZone(zone, instant)
      const p = partsInZone(zone, start)
      expect([p.hour, p.minute], `${zone} ${iso}`).toEqual([0, 0])
      expect(dayKey(zone, start), `${zone} ${iso}`).toBe(dayKey(zone, instant))
      expect(start.getTime(), `${zone} ${iso}`).toBeLessThanOrEqual(instant.getTime())
    }
  })

  it('is 25 hours before the next midnight on the day New York falls back', () => {
    // 1 November 2026: EDT ends at 02:00. Midnight that day is 04:00Z; midnight
    // the next is 05:00Z. Anything that assumed a 24-hour day here is wrong.
    const fallBack = startOfDayInZone(NEW_YORK, new Date('2026-11-01T12:00:00Z'))
    const dayAfter = startOfDayInZone(NEW_YORK, new Date('2026-11-02T12:00:00Z'))
    expect(fallBack.toISOString()).toBe('2026-11-01T04:00:00.000Z')
    expect((dayAfter.getTime() - fallBack.getTime()) / 3_600_000).toBe(25)
  })
})

describe('addDaysInZone steps by calendar date and survives daylight saving', () => {
  /**
   * THE DEFECT, REPRODUCED AS ARITHMETIC. Stepping a New York midnight by
   * 86,400,000 ms across the autumn transition lands on 23:00 of the SAME day.
   * `addDaysInZone` must not.
   */
  it('advances the New York day key by exactly one across the autumn transition', () => {
    const midnight = startOfDayInZone(NEW_YORK, new Date('2026-11-01T12:00:00Z'))
    const byMillis = new Date(midnight.getTime() + 86_400_000)
    // The arithmetic the planner used to do: same day, an hour short.
    expect(dayKey(NEW_YORK, byMillis)).toBe('2026-11-01')

    const byCalendar = addDaysInZone(NEW_YORK, midnight, 1)
    expect(dayKey(NEW_YORK, byCalendar)).toBe('2026-11-02')
    expect(partsInZone(NEW_YORK, byCalendar).hour).toBe(0)
  })

  it('keeps the wall clock across the spring transition too', () => {
    // 8 March 2026: EST becomes EDT at 02:00. Noon the day before, plus one
    // calendar day, is noon on the 8th — 23 elapsed hours, and that is correct.
    const noon = at(NEW_YORK, '2026-03-07T12:00')
    const next = addDaysInZone(NEW_YORK, noon, 1)
    expect(dayKey(NEW_YORK, next)).toBe('2026-03-08')
    expect(partsInZone(NEW_YORK, next).hour).toBe(12)
    expect((next.getTime() - noon.getTime()) / 3_600_000).toBe(23)
  })

  it.each([
    [NEW_YORK, '2026-03-02T00:00'], // the week the clocks go forward
    [NEW_YORK, '2026-10-26T00:00'], // the week the clocks go back
    [AUCKLAND, '2026-03-30T00:00'], // NZDT ends 5 April
    [AUCKLAND, '2026-09-21T00:00'], // NZDT starts 27 September
    [KOLKATA, '2026-03-02T00:00'], // the control: no transition at all
  ])('in %s from %s, 42 consecutive days have no repeat and no gap', (zone, start) => {
    const first = at(zone, start)
    const keys = Array.from({ length: 42 }, (_, i) => dayKey(zone, addDaysInZone(zone, first, i)))
    expect(new Set(keys).size).toBe(42)
    for (let i = 1; i < keys.length; i += 1) {
      expect(keyGap(keys[i - 1]!, keys[i]!), `${zone}: ${keys[i - 1]} to ${keys[i]}`).toBe(1)
    }
    // Every step keeps midnight, whatever the offset did in between.
    for (let i = 0; i < 42; i += 1) {
      expect(partsInZone(zone, addDaysInZone(zone, first, i)).hour, `${zone} day ${i}`).toBe(0)
    }
  })

  it.each(ZONES)('in %s, stepping forward and back returns to the same instant', (zone) => {
    for (const iso of ['2026-03-07T09:00', '2026-10-31T09:00', '2026-04-04T09:00']) {
      const start = at(zone, iso)
      for (const n of [1, 7, 30, -3]) {
        expect(
          addDaysInZone(zone, addDaysInZone(zone, start, n), -n).getTime(),
          `${zone} ${iso} ±${n}`,
        ).toBe(start.getTime())
      }
    }
  })

  it('a step of zero is the identity', () => {
    const start = at(NEW_YORK, '2026-11-01T01:30')
    expect(addDaysInZone(NEW_YORK, start, 0).getTime()).toBe(start.getTime())
  })
})

describe('the labels are read in the zone', () => {
  it('names the month and the full date the reader’s calendar shows', () => {
    // 19:00Z on 31 August is 00:30 on 1 September in Kolkata and still the
    // evening of 31 August in New York.
    const instant = new Date('2026-08-31T19:00:00Z')
    expect(monthLabel(KOLKATA, instant)).toBe('September 2026')
    expect(monthLabel(NEW_YORK, instant)).toBe('August 2026')
    expect(fullDateLabel(KOLKATA, instant)).toBe('1 September 2026')
    expect(fullDateLabel(NEW_YORK, instant)).toBe('31 August 2026')
  })

  it('isSameMonth compares the zone’s month AND year', () => {
    const anchor = at(KOLKATA, '2026-08-16T12:00')
    expect(isSameMonth(KOLKATA, at(KOLKATA, '2026-08-31T12:00'), anchor)).toBe(true)
    expect(isSameMonth(KOLKATA, at(KOLKATA, '2026-07-31T12:00'), anchor)).toBe(false)
    expect(isSameMonth(KOLKATA, at(KOLKATA, '2025-08-16T12:00'), anchor)).toBe(false)
    // The same two instants, read in New York, straddle a month boundary.
    const lateAugustUtc = new Date('2026-08-31T19:00:00Z')
    expect(isSameMonth(NEW_YORK, lateAugustUtc, at(NEW_YORK, '2026-08-01T12:00'))).toBe(true)
    expect(isSameMonth(KOLKATA, lateAugustUtc, at(KOLKATA, '2026-08-01T12:00'))).toBe(false)
  })
})

describe('minutesIntoDay is the row a card sits on', () => {
  it('reads the audit instant as 8 pm in New York and 5:30 am in Kolkata', () => {
    const instant = new Date('2026-09-02T20:00:00-04:00')
    expect(minutesIntoDay(NEW_YORK, instant)).toBe(20 * 60)
    expect(minutesIntoDay(KOLKATA, instant)).toBe(5 * 60 + 30)
  })

  it('reads midnight as 0, never as 24 hours', () => {
    expect(minutesIntoDay(KOLKATA, startOfDayInZone(KOLKATA, new Date()))).toBe(0)
  })
})
