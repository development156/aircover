import { describe, expect, test } from 'vitest'

import {
  firstGridDay,
  istDayKey,
  istDayOfMonth,
  istMonthLabel,
  isSameIstMonth,
  MONTH_GRID_DAYS,
} from './month'

const DAY_MS = 86_400_000

/**
 * Month-grid date maths, in IST.
 *
 * Every bug this can have is an off-by-one that only appears in one time zone,
 * on one day of the week, or after midnight — which is to say, never in review
 * and always in production. So the cases are pinned explicitly rather than
 * trusted to read correctly.
 */
describe('the month grid starts on a Monday', () => {
  test('a month that already begins on Monday starts on the 1st itself', () => {
    // 1 June 2026 is a Monday in IST.
    const anchor = new Date('2026-06-15T12:00:00+05:30')
    expect(istDayKey(firstGridDay(anchor))).toBe('2026-06-01')
  })

  test('a month beginning mid-week reaches back into the previous month', () => {
    // 1 August 2026 is a Saturday in IST, so the grid opens on Mon 27 July.
    const anchor = new Date('2026-08-16T12:00:00+05:30')
    expect(istDayKey(firstGridDay(anchor))).toBe('2026-07-27')
  })

  test('the first cell is a Monday whichever day of the month you anchor on', () => {
    // Anchoring on the 1st, the 15th and the last day must all agree.
    const keys = ['2026-08-01', '2026-08-15', '2026-08-31'].map((d) =>
      istDayKey(firstGridDay(new Date(`${d}T12:00:00+05:30`))),
    )
    expect(new Set(keys).size).toBe(1)
    expect(keys[0]).toBe('2026-07-27')
  })

  test('42 days always covers the whole month', () => {
    // The longest case: a 31-day month starting on a Sunday needs 6 rows.
    const anchor = new Date('2026-08-16T12:00:00+05:30')
    const start = firstGridDay(anchor)
    const last = new Date(start.getTime() + (MONTH_GRID_DAYS - 1) * DAY_MS)
    // The grid must reach past the 31st of the anchored month.
    expect(istDayKey(last) >= '2026-08-31').toBe(true)
  })
})

describe('IST is the zone, not the server', () => {
  test('an instant just after IST midnight belongs to the NEW day', () => {
    // 00:30 IST on the 17th is 19:00 UTC on the 16th. Formatting in the
    // server's zone would file it under the 16th.
    const justAfterIstMidnight = new Date('2026-08-16T19:00:00Z')
    expect(istDayKey(justAfterIstMidnight)).toBe('2026-08-17')
    expect(istDayOfMonth(justAfterIstMidnight)).toBe('17')
  })

  test('a day in an adjacent month is not the anchored month', () => {
    const anchor = new Date('2026-08-16T12:00:00+05:30')
    expect(isSameIstMonth(new Date('2026-08-31T12:00:00+05:30'), anchor)).toBe(true)
    expect(isSameIstMonth(new Date('2026-07-31T12:00:00+05:30'), anchor)).toBe(false)
    // Same month number, different YEAR — must not be treated as the same.
    expect(isSameIstMonth(new Date('2025-08-16T12:00:00+05:30'), anchor)).toBe(false)
  })

  test('the heading names the anchored month', () => {
    expect(istMonthLabel(new Date('2026-08-16T12:00:00+05:30'))).toBe('August 2026')
  })
})
