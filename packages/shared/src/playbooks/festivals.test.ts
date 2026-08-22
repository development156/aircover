import { describe, it, expect } from 'vitest'

import { FESTIVALS, MOVING_FESTIVALS_NOT_COVERED, upcomingFestivals } from './festivals'

const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

describe('the festival calendar', () => {
  it('holds only dates that exist in EVERY year, leap and common alike', () => {
    // The whole premise: no entry needs a year, so the calendar is correct
    // forever without being re-authored. The property is not "day <= 28" —
    // Halloween is the 31st and exists every year. It is that projecting the
    // pair into any year lands on that same pair, which is false only for
    // February 29th and for a day past the end of its own month, where
    // `Date.UTC` silently rolls forward into the next one.
    for (const f of FESTIVALS) {
      for (const year of [2026, 2027, 2028 /* leap */, 2100 /* not a leap year */]) {
        const projected = new Date(Date.UTC(year, f.month - 1, f.day))
        expect(projected.getUTCMonth() + 1, `${f.key} in ${year}`).toBe(f.month)
        expect(projected.getUTCDate(), `${f.key} in ${year}`).toBe(f.day)
      }
    }
  })

  it('contains no moving festival, and names every one it omits', () => {
    const names = FESTIVALS.map((f) => f.name.toLowerCase())
    for (const moving of MOVING_FESTIVALS_NOT_COVERED) {
      // A wrong Diwali date is worse than no Diwali date. The screen says which
      // ones are missing; this makes sure none of them quietly appears.
      expect(names, moving).not.toContain(moving.toLowerCase())
    }
    expect(MOVING_FESTIVALS_NOT_COVERED.length).toBeGreaterThan(0)
  })

  it('finds a festival inside the window and nothing outside it', () => {
    // Republic Day, 26 January.
    expect(upcomingFestivals(day(2026, 1, 20), 7, ['india']).map((f) => f.key)).toEqual([
      'republic-day-in',
    ])
    expect(upcomingFestivals(day(2026, 1, 18), 7, ['india'])).toEqual([])
  })

  it('counts today as zero days away and includes it', () => {
    const found = upcomingFestivals(day(2026, 1, 26), 7, ['india'])
    expect(found[0]?.key).toBe('republic-day-in')
    expect(found[0]?.daysAway).toBe(0)
  })

  it('does not look backwards', () => {
    expect(upcomingFestivals(day(2026, 1, 27), 30, ['india']).map((f) => f.key)).not.toContain(
      'republic-day-in',
    )
  })

  it('CROSSES THE YEAR, which is the case a naive window gets wrong', () => {
    // On 28 December, New Year's Day is four days away — not 362. Without the
    // second projection the one time of year this feature is most obviously
    // useful is the one time it would go silent.
    const found = upcomingFestivals(day(2026, 12, 28), 7, ['global'])
    const newYear = found.find((f) => f.key === 'new-year')
    expect(newYear?.daysAway).toBe(4)
    expect(newYear?.occursOn.getUTCFullYear()).toBe(2027)
  })

  it('returns them soonest first', () => {
    const found = upcomingFestivals(day(2026, 12, 20), 20, ['global'])
    expect(found.map((f) => f.key)).toEqual(['christmas', 'new-years-eve', 'new-year'])
    expect(found.map((f) => f.daysAway)).toEqual([5, 11, 12])
  })

  it('honours the calendars asked for, and only those', () => {
    expect(upcomingFestivals(day(2026, 8, 10), 10, ['global'])).toEqual([])
    expect(upcomingFestivals(day(2026, 8, 10), 10, ['india']).map((f) => f.key)).toEqual([
      'independence-day-in',
    ])
    expect(upcomingFestivals(day(2026, 8, 10), 10, [])).toEqual([])
  })

  it('ignores the hour the run happened at', () => {
    // `daysAway` decides what the preview says and what the slot is, so it must
    // not depend on whether the job fired at 06:00 or 23:59.
    const early = upcomingFestivals(new Date('2026-01-20T00:01:00Z'), 7, ['india'])
    const late = upcomingFestivals(new Date('2026-01-20T23:59:00Z'), 7, ['india'])
    expect(early[0]?.daysAway).toBe(late[0]?.daysAway)
  })
})
