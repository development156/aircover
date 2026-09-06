import { describe, expect, test } from 'vitest'

import { weekOffsetOf, weekWindow } from './week-window'
import { dayKey } from '@/lib/time/day-key'

const IST = 'Asia/Kolkata'
const NY = 'America/New_York'

// A Sunday, 6 September 2026 — the LAST day of its Monday-first week, so an
// off-by-one in either direction shows up as a different week.
const NOW = new Date('2026-09-06T12:00:00Z')

/**
 * PICKING A DAY IN THE MINI CALENDAR MUST MOVE THE WEEK THE GRID DRAWS.
 *
 * It carried `week` unchanged, so picking the 17th from this week's grid gave
 * `?view=week&date=2026-09-17` — the posts narrowed to the 17th, the columns
 * still this week, and "3 posts are not on this view" beside an empty grid.
 * The offset is a function of the day; this is that function.
 */
describe('weekOffsetOf', () => {
  test('a day in the current week is offset 0, whichever end of the week it is', () => {
    expect(weekOffsetOf(IST, NOW, new Date('2026-08-31T12:00:00+05:30'))).toBe(0) // Monday
    expect(weekOffsetOf(IST, NOW, NOW)).toBe(0) // Sunday
  })

  test('the next Monday is +1 and the previous Sunday is -1', () => {
    expect(weekOffsetOf(IST, NOW, new Date('2026-09-07T12:00:00+05:30'))).toBe(1)
    expect(weekOffsetOf(IST, NOW, new Date('2026-08-30T12:00:00+05:30'))).toBe(-1)
  })

  test('agrees with weekWindow: the offset it returns draws the week holding that day', () => {
    for (const zone of [IST, NY]) {
      for (const iso of ['2026-09-17T12:00:00Z', '2026-08-03T12:00:00Z', '2026-12-28T12:00:00Z']) {
        const day = new Date(iso)
        const offset = weekOffsetOf(zone, NOW, day)
        const keys = weekWindow(zone, NOW, offset).days.map((d) => dayKey(zone, d))
        expect(keys, `${zone} ${iso}`).toContain(dayKey(zone, day))
      }
    }
  })

  test('reads the day on the workspace’s calendar', () => {
    // 20:00 New York on Sunday the 6th is Monday morning in Kolkata: this week
    // for New York, next week for Kolkata.
    const evening = new Date('2026-09-06T20:00:00-04:00')
    expect(weekOffsetOf(NY, NOW, evening)).toBe(0)
    expect(weekOffsetOf(IST, NOW, evening)).toBe(1)
  })

  test('survives the New York clock change without drifting a week', () => {
    // 1 November 2026 is the transition Sunday. Eight weeks on from early
    // September must still be exactly eight.
    const now = new Date('2026-09-07T12:00:00-04:00')
    expect(weekOffsetOf(NY, now, new Date('2026-11-02T12:00:00-05:00'))).toBe(8)
  })
})
