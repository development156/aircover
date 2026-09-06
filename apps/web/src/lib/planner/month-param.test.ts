import { describe, expect, test } from 'vitest'

import { parseMonth } from './filters'
import { monthAnchorFrom, monthKeyOf, stepMonth } from './month'
import { dayKey } from '@/lib/time/day-key'
import { partsInZone } from '@/lib/time/zone'

const IST = 'Asia/Kolkata'
const NY = 'America/New_York'

/**
 * `?month=YYYY-MM` — the month the grid and the mini calendar anchor on.
 *
 * Until now both anchored on NOW and nothing could move them: the month grid
 * had no previous/next, so a post booked for the 3rd of next month was on no
 * calendar the reader could reach. The key is parsed like `?date=`: a value that
 * is not a month falls back to "this month" rather than to a grid of nothing.
 */
describe('parseMonth', () => {
  test('accepts YYYY-MM and nothing else', () => {
    expect(parseMonth('2026-09')).toBe('2026-09')
    expect(parseMonth('2026-12')).toBe('2026-12')
    expect(parseMonth('2026-13')).toBeNull()
    expect(parseMonth('2026-00')).toBeNull()
    expect(parseMonth('2026-9')).toBeNull()
    expect(parseMonth('2026-09-01')).toBeNull()
    expect(parseMonth('')).toBeNull()
    expect(parseMonth(undefined)).toBeNull()
  })
})

describe('monthKeyOf and monthAnchorFrom', () => {
  test('the key is the month on the workspace’s calendar, not the server’s', () => {
    // 19:00Z on 31 August is already September in Kolkata and still August in
    // New York.
    const instant = new Date('2026-08-31T19:00:00Z')
    expect(monthKeyOf(IST, instant)).toBe('2026-09')
    expect(monthKeyOf(NY, instant)).toBe('2026-08')
  })

  test('a key anchors on the 1st at the zone’s midnight', () => {
    for (const zone of [IST, NY]) {
      const anchor = monthAnchorFrom(zone, '2026-11', new Date('2026-09-06T12:00:00Z'))
      const p = partsInZone(zone, anchor)
      expect([p.year, p.month, p.day, p.hour, p.minute], zone).toEqual([2026, 11, 1, 0, 0])
    }
  })

  test('no key means this month — the anchor is now itself', () => {
    const now = new Date('2026-09-06T12:00:00Z')
    expect(monthAnchorFrom(IST, null, now)).toEqual(now)
  })

  test('the key round-trips through the anchor', () => {
    for (const zone of [IST, NY]) {
      for (const key of ['2026-01', '2026-06', '2026-12']) {
        expect(monthKeyOf(zone, monthAnchorFrom(zone, key, new Date())), `${zone} ${key}`).toBe(key)
      }
    }
  })
})

describe('stepMonth', () => {
  test('steps to the 1st of the adjacent month, across a year boundary', () => {
    const dec = monthAnchorFrom(IST, '2026-12', new Date())
    expect(monthKeyOf(IST, stepMonth(IST, dec, 1))).toBe('2027-01')
    expect(monthKeyOf(IST, stepMonth(IST, dec, -1))).toBe('2026-11')
  })

  test('from 31 March back one month is 1 February, never 3 March', () => {
    const anchor = new Date('2026-03-31T12:00:00-04:00')
    expect(dayKey(NY, stepMonth(NY, anchor, -1))).toBe('2026-02-01')
  })

  test('lands on the zone’s midnight, in New York across the clock change too', () => {
    // October → November crosses the autumn transition in New York.
    const oct = monthAnchorFrom(NY, '2026-10', new Date())
    const nov = stepMonth(NY, oct, 1)
    const p = partsInZone(NY, nov)
    expect([p.month, p.day, p.hour, p.minute]).toEqual([11, 1, 0, 0])
  })
})
