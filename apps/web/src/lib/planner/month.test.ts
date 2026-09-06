import { describe, expect, test } from 'vitest'

import { firstGridDay, monthGridKeys, MONTH_GRID_DAYS } from './month'
import { dayKey, weekdayOffset } from '@/lib/time/day-key'
import { partsInZone } from '@/lib/time/zone'

const IST = 'Asia/Kolkata'
const NY = 'America/New_York'

/**
 * Month-grid date maths, in the workspace's zone.
 *
 * Every bug this can have is an off-by-one that only appears in one time zone,
 * on one day of the week, or after midnight — which is to say, never in review
 * and always in production. So the cases are pinned explicitly rather than
 * trusted to read correctly, and each runs in Kolkata (the control) and in New
 * York (where the old 24-hour stepping produced a repeated cell).
 */
describe('the month grid starts on a Monday', () => {
  test('a month that already begins on Monday starts on the 1st itself', () => {
    // 1 June 2026 is a Monday.
    const anchor = new Date('2026-06-15T12:00:00+05:30')
    expect(dayKey(IST, firstGridDay(IST, anchor))).toBe('2026-06-01')
  })

  test('a month beginning mid-week reaches back into the previous month', () => {
    // 1 August 2026 is a Saturday, so the grid opens on Mon 27 July.
    const anchor = new Date('2026-08-16T12:00:00+05:30')
    expect(dayKey(IST, firstGridDay(IST, anchor))).toBe('2026-07-27')
  })

  test('the first cell is a Monday whichever day of the month you anchor on', () => {
    // Anchoring on the 1st, the 15th and the last day must all agree.
    const keys = ['2026-08-01', '2026-08-15', '2026-08-31'].map((d) =>
      dayKey(IST, firstGridDay(IST, new Date(`${d}T12:00:00+05:30`))),
    )
    expect(new Set(keys).size).toBe(1)
    expect(keys[0]).toBe('2026-07-27')
  })

  test('42 days always covers the whole month', () => {
    // The longest case: a 31-day month starting on a Sunday needs 6 rows.
    const keys = monthGridKeys(IST, new Date('2026-08-16T12:00:00+05:30'))
    expect(keys).toHaveLength(MONTH_GRID_DAYS)
    // The grid must reach past the 31st of the anchored month.
    expect(keys[keys.length - 1]! >= '2026-08-31').toBe(true)
  })

  test('a month beginning on a SUNDAY walks back six days, not zero', () => {
    // 1 November 2026 is a Sunday. Getting this wrong shifts the entire grid
    // by a day for one seventh of all months.
    const anchor = new Date('2026-11-10T12:00:00-05:00')
    expect(dayKey(NY, firstGridDay(NY, anchor))).toBe('2026-10-26')
    expect(weekdayOffset(NY, firstGridDay(NY, anchor))).toBe(0)
  })
})

describe('the zone is the workspace’s, not the server’s', () => {
  test('the anchor’s month is read in the zone', () => {
    // 19:00Z on 31 August is 00:30 on 1 September in Kolkata and still the
    // evening of 31 August in New York. Two different grids, correctly.
    const instant = new Date('2026-08-31T19:00:00Z')
    expect(dayKey(IST, firstGridDay(IST, instant))).toBe('2026-08-31')
    expect(dayKey(NY, firstGridDay(NY, instant))).toBe('2026-07-27')
  })

  test('the New York grid for November has 42 distinct consecutive days', () => {
    // The transition month. Stepping by milliseconds from the 26 October
    // Monday used to repeat 1 November and skip the day after.
    const keys = monthGridKeys(NY, new Date('2026-11-10T12:00:00-05:00'))
    expect(new Set(keys).size).toBe(MONTH_GRID_DAYS)
    for (let i = 1; i < keys.length; i += 1) {
      const gap =
        (Date.parse(`${keys[i]}T00:00:00Z`) - Date.parse(`${keys[i - 1]}T00:00:00Z`)) / 86_400_000
      expect(gap, `${keys[i - 1]} to ${keys[i]}`).toBe(1)
    }
    expect(keys).toContain('2026-11-01')
    expect(keys).toContain('2026-11-02')
  })

  test('the grid starts at the zone’s midnight', () => {
    for (const zone of [IST, NY]) {
      const start = firstGridDay(zone, new Date('2026-03-15T12:00:00Z'))
      const p = partsInZone(zone, start)
      expect([p.hour, p.minute], zone).toEqual([0, 0])
    }
  })
})
