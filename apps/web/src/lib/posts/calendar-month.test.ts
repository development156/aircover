import { describe, expect, test } from 'vitest'

import {
  clockTime,
  combine,
  firstGridDay,
  isSameDay,
  isSameMonth,
  longDay,
  monthGridDays,
  MONTH_GRID_DAYS,
  shiftMonth,
  timeSlots,
  timeValue,
} from './calendar-month'
import { dayKey, weekdayOffset } from '@/lib/time/day-key'
import { partsInZone } from '@/lib/time/zone'

const IST = 'Asia/Kolkata'
const NY = 'America/New_York'

/** A wall clock in `zone`, as an instant, for building fixtures. */
function wall(zone: string, y: number, m: number, d: number, h = 12, min = 0): Date {
  return combine(zone, new Date(Date.UTC(y, m - 1, d, 12)), h, min)
}

describe('the grid starts on a Monday, whatever day the month starts on', () => {
  test('a month beginning mid-week walks back to that week Monday', () => {
    // 1 August 2026 is a Saturday.
    expect(dayKey(IST, firstGridDay(IST, wall(IST, 2026, 8, 15)))).toBe('2026-07-27')
    expect(weekdayOffset(IST, firstGridDay(IST, wall(IST, 2026, 8, 15)))).toBe(0)
  })

  test('a month beginning ON a Monday starts there, not a week early', () => {
    // 1 June 2026 is a Monday.
    expect(dayKey(IST, firstGridDay(IST, wall(IST, 2026, 6, 20)))).toBe('2026-06-01')
  })

  /**
   * THE OFF-BY-ONE THIS FILE EXISTS TO AVOID.
   *
   * A Sunday-first weekday must become 6 rather than 0 in a Monday-first grid.
   * Get it wrong and the entire grid shifts by a day for one seventh of all
   * months — a defect that reads fine in review and only shows up on the
   * calendar of a month nobody tested.
   */
  test('a month beginning on a SUNDAY walks back six days, not zero', () => {
    // 1 November 2026 is a Sunday.
    expect(dayKey(NY, firstGridDay(NY, wall(NY, 2026, 11, 10)))).toBe('2026-10-26')
    expect(weekdayOffset(NY, firstGridDay(NY, wall(NY, 2026, 11, 10)))).toBe(0)
  })
})

describe('the grid itself', () => {
  test('is always 42 days, so the box does not change height between months', () => {
    for (const month of [1, 2, 6, 8, 11]) {
      expect(monthGridDays(IST, wall(IST, 2026, month, 15))).toHaveLength(MONTH_GRID_DAYS)
    }
  })

  /**
   * ── THE MONTHS ARE CHOSEN, NOT ARBITRARY ─────────────────────────────────
   * March and November are the two US DST transitions, and they are here
   * because a grid built by adding raw milliseconds slides an hour across one
   * and lands a cell on the wrong date. August is the ordinary control.
   *
   * This used to carry a warning that the gate runs in UTC and so never
   * exercised the case. The zone is an ARGUMENT now, so the New York grid is
   * built in New York wherever the test runs, and the assertion is live on
   * every machine.
   */
  test('runs consecutively with no repeated or skipped day, DST months included', () => {
    for (const [month, name] of [
      [3, 'March'],
      [8, 'August'],
      [11, 'November'],
    ] as const) {
      const days = monthGridDays(NY, wall(NY, 2026, month, 15))
      const keys = days.map((day) => dayKey(NY, day))

      expect(new Set(keys).size, name).toBe(MONTH_GRID_DAYS)

      // Compared as CALENDAR DATES, re-parsed through UTC, not as elapsed
      // milliseconds. Two consecutive midnights are 23 hours apart across a
      // spring-forward and 25 across a fall-back — an elapsed-time assertion
      // fails on correct output, which is how the first version of this test
      // reported a bug that was its own.
      for (let index = 1; index < days.length; index += 1) {
        const gap =
          Date.parse(`${keys[index]}T00:00:00Z`) - Date.parse(`${keys[index - 1]}T00:00:00Z`)
        expect(gap / 86_400_000, `${name}: ${keys[index - 1]} to ${keys[index]}`).toBe(1)
      }
      // Every cell is that day's midnight in New York. Under raw-millisecond
      // stepping across a transition this reads 23:00 or 01:00.
      for (const day of days)
        expect(partsInZone(NY, day).hour, `${name}: ${dayKey(NY, day)}`).toBe(0)
    }
  })

  test('carries the adjacent months, so the first row is a full week', () => {
    const anchor = wall(IST, 2026, 8, 15)
    const days = monthGridDays(IST, anchor)

    expect(isSameMonth(IST, days[0]!, anchor)).toBe(false)
    expect(days.filter((day) => isSameMonth(IST, day, anchor))).toHaveLength(31)
  })
})

describe('stepping months', () => {
  test('does not skip February from the 31st', () => {
    // The classic: `setMonth(month - 1)` on 31 March lands on 3 March.
    expect(dayKey(IST, shiftMonth(IST, wall(IST, 2026, 3, 31), -1))).toBe('2026-02-01')
    expect(dayKey(IST, shiftMonth(IST, wall(IST, 2026, 1, 31), 1))).toBe('2026-02-01')
  })

  test('crosses the year boundary in both directions', () => {
    expect(dayKey(IST, shiftMonth(IST, wall(IST, 2026, 12, 15), 1))).toBe('2027-01-01')
    expect(dayKey(IST, shiftMonth(IST, wall(IST, 2026, 1, 15), -1))).toBe('2025-12-01')
  })

  test('steps to the 1st in the zone, so the month on screen is the month the reader is in', () => {
    // 19:00Z on 31 August is 1 September in Kolkata: stepping back one month
    // from there must land on 1 August, not on 1 July.
    const instant = new Date('2026-08-31T19:00:00Z')
    expect(dayKey(IST, shiftMonth(IST, instant, -1))).toBe('2026-08-01')
    expect(dayKey(NY, shiftMonth(NY, instant, -1))).toBe('2026-07-01')
  })
})

describe('putting a time onto a day', () => {
  test('keeps the day and takes the clock, in the zone', () => {
    const at = combine(IST, wall(IST, 2026, 8, 27), 9, 30)

    expect(dayKey(IST, at)).toBe('2026-08-27')
    expect(partsInZone(IST, at)).toMatchObject({ hour: 9, minute: 30 })
    // Seconds and milliseconds zeroed, so a stored schedule round-trips through
    // the minute-precision field without drifting a second each time.
    expect(at.getUTCSeconds()).toBe(0)
    expect(at.getUTCMilliseconds()).toBe(0)
    // And it IS that zone's 9:30, not the server's: 04:00Z.
    expect(at.toISOString()).toBe('2026-08-27T04:00:00.000Z')
  })

  test('builds 9:00 am on the same calendar day as different instants in different zones', () => {
    // The whole defect in one line: the same tap, on the same device, must
    // commit the instant a reader in THAT workspace's zone means.
    const day = new Date('2026-09-03T12:00:00Z')
    expect(combine(IST, day, 9, 0).toISOString()).toBe('2026-09-03T03:30:00.000Z')
    expect(combine(NY, day, 9, 0).toISOString()).toBe('2026-09-03T13:00:00.000Z')
  })

  test('is right on the day New York falls back', () => {
    // 1 November 2026. 9:00 am is after the transition, so it is EST: 14:00Z.
    // Millisecond arithmetic from midnight (04:00Z EDT) would give 13:00Z.
    const day = new Date('2026-11-01T12:00:00Z')
    expect(combine(NY, day, 9, 0).toISOString()).toBe('2026-11-01T14:00:00.000Z')
    expect(partsInZone(NY, combine(NY, day, 9, 0))).toMatchObject({ day: 1, hour: 9, minute: 0 })
  })

  test('isSameDay separates two times on the same date from the same time on two dates', () => {
    const d27 = wall(IST, 2026, 8, 27)
    const d28 = wall(IST, 2026, 8, 28)
    expect(isSameDay(IST, combine(IST, d27, 9, 0), combine(IST, d27, 18, 0))).toBe(true)
    expect(isSameDay(IST, combine(IST, d27, 9, 0), combine(IST, d28, 9, 0))).toBe(false)
  })

  test('timeValue reads the clock back in the zone the picker will show', () => {
    const at = new Date('2026-09-03T13:00:00Z')
    expect(timeValue(NY, at)).toBe('09:00')
    expect(timeValue(IST, at)).toBe('18:30')
  })
})

describe('the words on the confirmation line', () => {
  test('name the day and the clock a reader in the zone sees', () => {
    const at = new Date('2026-09-02T20:00:00-04:00')
    // ICU builds differ on the comma after the weekday; the words are the claim.
    expect(longDay(NY, at)).toMatch(/^Wednesday,? 2 September$/)
    expect(clockTime(NY, at)).toBe('8:00 pm')
    expect(longDay(IST, at)).toMatch(/^Thursday,? 3 September$/)
    expect(clockTime(IST, at)).toBe('5:30 am')
  })
})

describe('the time slots', () => {
  test('run every half hour through the day a shop actually posts in', () => {
    const slots = timeSlots()

    expect(slots[0]!.value).toBe('06:00')
    expect(slots[slots.length - 1]!.value).toBe('21:30')
    expect(slots).toHaveLength(32)
  })

  test('are half an hour apart with no duplicate', () => {
    const values = timeSlots().map((slot) => slot.value)
    expect(new Set(values).size).toBe(values.length)
  })

  test('label a wall clock, whatever zone the machine is in', () => {
    expect(timeSlots().find((s) => s.value === '16:30')?.label).toBe('4:30 pm')
  })
})
