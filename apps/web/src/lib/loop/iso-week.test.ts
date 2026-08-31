import { describe, it, expect } from 'vitest'

import { isoWeekOf, isoWeekStart, planningWeekFor, reflectionWindow } from './iso-week'

const at = (iso: string) => new Date(iso)

describe('isoWeekOf', () => {
  it('agrees with Postgres on today', () => {
    // Production reports extract(isoyear/week from '2026-08-20') as 2026 / 34.
    expect(isoWeekOf(at('2026-08-20T12:00:00Z'))).toEqual({ isoYear: 2026, isoWeek: 34 })
  })

  it('puts Monday and the following Sunday in the SAME week', () => {
    // ISO weeks run Monday to Sunday. A calendar-week implementation that starts
    // on Sunday splits these two into different weeks.
    expect(isoWeekOf(at('2026-08-17T00:00:00Z'))).toEqual({ isoYear: 2026, isoWeek: 34 })
    expect(isoWeekOf(at('2026-08-23T23:59:00Z'))).toEqual({ isoYear: 2026, isoWeek: 34 })
    // …and the next Monday in the next one.
    expect(isoWeekOf(at('2026-08-24T00:00:00Z'))).toEqual({ isoYear: 2026, isoWeek: 35 })
  })

  it('handles the year boundary, where a hand-rolled version fails once a year', () => {
    // 2027-01-01 is a Friday, so it belongs to ISO week 53 OF 2026 — the ISO
    // year is the year containing the week's Thursday, and that Thursday is
    // 2026-12-31. A "day of year over seven" would call this week 1 of 2027 and
    // collide with the cycle actually planned for that week.
    expect(isoWeekOf(at('2027-01-01T12:00:00Z'))).toEqual({ isoYear: 2026, isoWeek: 53 })
    expect(isoWeekOf(at('2026-12-31T12:00:00Z'))).toEqual({ isoYear: 2026, isoWeek: 53 })
    // And the first Monday of 2027 opens week 1.
    expect(isoWeekOf(at('2027-01-04T12:00:00Z'))).toEqual({ isoYear: 2027, isoWeek: 1 })
  })

  it('handles the other direction: a January date belonging to the previous year', () => {
    // 2026-01-01 is a Thursday, so it IS in week 1 of 2026.
    expect(isoWeekOf(at('2026-01-01T00:00:00Z'))).toEqual({ isoYear: 2026, isoWeek: 1 })
  })
})

describe('planningWeekFor', () => {
  it('files a SUNDAY run under the week it is planning, not the one ending', () => {
    // 2026-08-23 is a Sunday, the last day of ISO week 34. The cycle that runs
    // that evening plans week 35. Filing it under 34 would collide with the
    // cycle already there.
    expect(isoWeekOf(at('2026-08-23T21:00:00Z'))).toEqual({ isoYear: 2026, isoWeek: 34 })
    expect(planningWeekFor(at('2026-08-23T21:00:00Z'))).toEqual({ isoYear: 2026, isoWeek: 35 })
  })

  it('treats any other day as planning the week it is in', () => {
    // Someone pressing "Plan my week now" on a Wednesday means this week.
    expect(planningWeekFor(at('2026-08-20T12:00:00Z'))).toEqual({ isoYear: 2026, isoWeek: 34 })
  })

  it('rolls a Sunday at a year boundary into the right ISO year', () => {
    // 2026-12-27 is a Sunday in week 52; the week it plans is 53.
    expect(planningWeekFor(at('2026-12-27T21:00:00Z'))).toEqual({ isoYear: 2026, isoWeek: 53 })
  })
})

describe('reflectionWindow', () => {
  it('looks back seven days from the instant it is given', () => {
    expect(reflectionWindow(at('2026-08-20T12:00:00Z'))).toEqual({
      fromIso: '2026-08-13',
      toIso: '2026-08-20',
    })
  })

  it('covers the snapshots production actually holds', () => {
    // Measured 2026-08-20: post_metric_snapshots spans 2026-08-17 to 08-19.
    const w = reflectionWindow(at('2026-08-20T12:00:00Z'))
    expect(w.fromIso <= '2026-08-17').toBe(true)
    expect(w.toIso >= '2026-08-19').toBe(true)
  })

  it('reads no clock — the same instant always gives the same window', () => {
    const a = reflectionWindow(at('2026-08-20T00:00:00Z'))
    const b = reflectionWindow(at('2026-08-20T23:59:59Z'))
    expect(a).toEqual(b)
  })
})

/**
 * The inverse, which shipped with no test at all until an audit said so.
 *
 * It decides the DATE RANGE printed on every weekly report card, so an off-by-one
 * here labels a whole screen of real figures with the wrong seven days. Nothing
 * else in the product would notice.
 */
describe('isoWeekStart', () => {
  it('returns the Monday of the week it names', () => {
    // ISO week 34 of 2026 starts Monday 17 August. Same week `isoWeekOf` reports
    // for 20 August in the test at the top of this file.
    expect(isoWeekStart(2026, 34).toISOString().slice(0, 10)).toBe('2026-08-17')
  })

  it('round trips against isoWeekOf across thirty-six years', () => {
    // A property test rather than a handful of dates, because the failures worth
    // catching all live at year boundaries and there are only a few dozen of
    // those in a range this size. Every day from 1999 to 2035: the week a day
    // falls in must start on or before that day, and within seven days of it.
    let checked = 0
    for (let ms = Date.UTC(1999, 0, 1); ms <= Date.UTC(2035, 11, 31); ms += 86_400_000) {
      const day = new Date(ms)
      const week = isoWeekOf(day)
      const start = isoWeekStart(week.isoYear, week.isoWeek)
      const offset = (ms - start.getTime()) / 86_400_000
      expect(offset).toBeGreaterThanOrEqual(0)
      expect(offset).toBeLessThanOrEqual(6)
      // And the Monday it returns must belong to the week it was asked for.
      expect(isoWeekOf(start)).toEqual(week)
      checked += 1
    }
    expect(checked).toBeGreaterThan(13_000)
  })

  it('handles a 53-week year, where counting forward from 1 January is wrong', () => {
    // 2020 has 53 ISO weeks. 1 January 2021 is a Friday and belongs to week 53
    // OF 2020, which is the case a "day of year over seven" calculation gets
    // wrong once a year, silently.
    expect(isoWeekOf(new Date('2021-01-01T12:00:00Z'))).toEqual({ isoYear: 2020, isoWeek: 53 })
    expect(isoWeekStart(2020, 53).toISOString().slice(0, 10)).toBe('2020-12-28')
  })
})
