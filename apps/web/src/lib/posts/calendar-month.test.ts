import { describe, expect, test } from 'vitest'

import {
  combine,
  firstGridDay,
  isSameDay,
  isSameMonth,
  monthGridDays,
  MONTH_GRID_DAYS,
  shiftMonth,
  timeSlots,
} from './calendar-month'

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

describe('the grid starts on a Monday, whatever day the month starts on', () => {
  test('a month beginning mid-week walks back to that week Monday', () => {
    // 1 August 2026 is a Saturday.
    expect(iso(firstGridDay(new Date(2026, 7, 15)))).toBe('2026-07-27')
    expect(firstGridDay(new Date(2026, 7, 15)).getDay()).toBe(1)
  })

  test('a month beginning ON a Monday starts there, not a week early', () => {
    // 1 June 2026 is a Monday.
    expect(iso(firstGridDay(new Date(2026, 5, 20)))).toBe('2026-06-01')
  })

  /**
   * THE OFF-BY-ONE THIS FILE EXISTS TO AVOID.
   *
   * `getDay()` is Sunday-first and this grid is Monday-first, so Sunday must
   * become 6 rather than 0. Get it wrong and the entire grid shifts by a day
   * for one seventh of all months — a defect that reads fine in review and
   * only shows up on the calendar of a month nobody tested.
   */
  test('a month beginning on a SUNDAY walks back six days, not zero', () => {
    // 1 November 2026 is a Sunday.
    expect(iso(firstGridDay(new Date(2026, 10, 10)))).toBe('2026-10-26')
    expect(firstGridDay(new Date(2026, 10, 10)).getDay()).toBe(1)
  })
})

describe('the grid itself', () => {
  test('is always 42 days, so the box does not change height between months', () => {
    for (const month of [0, 1, 5, 7, 10]) {
      expect(monthGridDays(new Date(2026, month, 15))).toHaveLength(MONTH_GRID_DAYS)
    }
  })

  /**
   * ── THE MONTHS ARE CHOSEN, NOT ARBITRARY ─────────────────────────────────
   * March and November are the two US DST transitions, and they are here
   * because a grid built by adding raw milliseconds slides an hour across one
   * and lands a cell on the wrong date. August is the ordinary control.
   *
   * STATED PLAINLY: the gate runs in UTC, which has no DST, and in UTC the
   * re-normalisation this checks is a no-op — MEASURED, removing it leaves all
   * twelve tests green here. Run under `TZ=America/New_York` it goes red on the
   * March and November grids. So this assertion is real, and the gate does not
   * exercise it; a reader who trusts a green run to have covered the DST case
   * would be wrong, which is why the sentence is here rather than absent.
   */
  test('runs consecutively with no repeated or skipped day, DST months included', () => {
    for (const [month, name] of [
      [2, 'March'],
      [7, 'August'],
      [10, 'November'],
    ] as const) {
      const days = monthGridDays(new Date(2026, month, 15))
      const keys = days.map(iso)

      expect(new Set(keys).size, name).toBe(MONTH_GRID_DAYS)

      // Compared as CALENDAR DATES, re-parsed through UTC, not as elapsed
      // milliseconds. Two consecutive local midnights are 23 hours apart across
      // a spring-forward and 25 across a fall-back — an elapsed-time assertion
      // fails on correct output, which is how the first version of this test
      // reported a bug that was its own.
      for (let index = 1; index < days.length; index += 1) {
        const gap =
          Date.parse(`${keys[index]}T00:00:00Z`) - Date.parse(`${keys[index - 1]}T00:00:00Z`)
        expect(gap / 86_400_000, `${name}: ${keys[index - 1]} to ${keys[index]}`).toBe(1)
      }
      // Every cell is local midnight. Under raw-millisecond stepping across a
      // transition this reads 23:00 or 01:00, which is the same defect seen
      // from the other side.
      for (const day of days) expect(day.getHours(), `${name}: ${iso(day)}`).toBe(0)
    }
  })

  test('carries the adjacent months, so the first row is a full week', () => {
    const anchor = new Date(2026, 7, 15)
    const days = monthGridDays(anchor)

    expect(isSameMonth(days[0]!, anchor)).toBe(false)
    expect(days.filter((day) => isSameMonth(day, anchor))).toHaveLength(31)
  })
})

describe('stepping months', () => {
  test('does not skip February from the 31st', () => {
    // The classic: `setMonth(month - 1)` on 31 March lands on 3 March.
    expect(iso(shiftMonth(new Date(2026, 2, 31), -1))).toBe('2026-02-01')
    expect(iso(shiftMonth(new Date(2026, 0, 31), 1))).toBe('2026-02-01')
  })

  test('crosses the year boundary in both directions', () => {
    expect(iso(shiftMonth(new Date(2026, 11, 15), 1))).toBe('2027-01-01')
    expect(iso(shiftMonth(new Date(2026, 0, 15), -1))).toBe('2025-12-01')
  })
})

describe('putting a time onto a day', () => {
  test('keeps the day and takes the clock', () => {
    const at = combine(new Date(2026, 7, 27), 9, 30)

    expect(iso(at)).toBe('2026-08-27')
    expect(at.getHours()).toBe(9)
    expect(at.getMinutes()).toBe(30)
    // Seconds and milliseconds zeroed, so a stored schedule round-trips through
    // the minute-precision field without drifting a second each time.
    expect(at.getSeconds()).toBe(0)
    expect(at.getMilliseconds()).toBe(0)
  })

  test('isSameDay separates two times on the same date from the same time on two dates', () => {
    expect(
      isSameDay(combine(new Date(2026, 7, 27), 9, 0), combine(new Date(2026, 7, 27), 18, 0)),
    ).toBe(true)
    expect(
      isSameDay(combine(new Date(2026, 7, 27), 9, 0), combine(new Date(2026, 7, 28), 9, 0)),
    ).toBe(false)
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
})
