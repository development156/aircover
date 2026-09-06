import { describe, expect, it } from 'vitest'

import { dayColumn, mondayOf, scheduledMinutes, weekWindow } from './week-window'
import { dayKey, weekdayOffset } from '@/lib/time/day-key'
import { partsInZone } from '@/lib/time/zone'

/**
 * THE DAY VIEW, AND THE DAY IT COULD NOT DRAW.
 *
 * ── THE DEFECT ───────────────────────────────────────────────────────────────
 * `view === 'day'` was expressed as a FILTER over the week window:
 *
 *   days={view === 'day' ? window.days.filter(isToday) : window.days}
 *
 * A filter can return nothing. The day view needs exactly one column, always.
 * `weekWindow(now, offset)` returns the days of the week `offset` weeks away, so
 * for any offset but 0 that filter is EMPTY and `WeekTimeline` maps over an
 * empty array: no column, no now-line, just an hour rail inside a frame, under a
 * navigation label still reading the whole seven-day range.
 *
 * That URL is one click away. The day view renders `WeekNav`, whose step links
 * carry the view forward, so "Next week" in Day view goes to `?view=day&week=1`
 * and lands on a blank grid.
 *
 * The mini calendar reaches the same place by the other road: it carries the
 * view and adds `?date=`, so picking tomorrow narrows the POSTS to tomorrow
 * while `days` stays `[today]` — and the drawn hour range is then computed from
 * posts that are not drawn. Today's column, tomorrow's hours, no cards.
 *
 * ── AND THEN THE ZONE ────────────────────────────────────────────────────────
 * Every function here was built in a hardcoded IST. The window now takes the
 * workspace's zone, and the cases below run in Kolkata (the control, which must
 * not move) and in New York (where the week the clocks change used to come out
 * with a repeated day).
 *
 * Pure: no I/O, no clock beyond what it is handed.
 */

const IST = 'Asia/Kolkata'
const NY = 'America/New_York'

// A Thursday, so "today" is neither end of the week and a picked day can sit on
// either side of it.
const NOW = new Date('2026-09-03T06:00:00Z')

describe('the filter that could return nothing', () => {
  /**
   * The regression itself, written as the fact that made it possible. This is
   * exactly what the page used to hand to the grid.
   */
  it('filtering the week to today is empty on every week but this one', () => {
    for (const offset of [-4, -1, 1, 4]) {
      const week = weekWindow(IST, NOW, offset)
      const filtered = week.days.filter((day) => dayKey(IST, day) === dayKey(IST, NOW))
      expect(filtered, `offset ${offset}`).toHaveLength(0)
    }
    expect(
      weekWindow(IST, NOW, 0).days.filter((day) => dayKey(IST, day) === dayKey(IST, NOW)),
    ).toHaveLength(1)
  })
})

describe('dayColumn always yields exactly one day to draw', () => {
  it('never returns nothing, on any week offset', () => {
    for (const offset of [-4, -1, 0, 1, 4]) {
      const week = weekWindow(IST, NOW, offset)
      const picked = dayColumn(IST, week, null, NOW)
      expect(picked, `offset ${offset}`).toBeInstanceOf(Date)
      // And the day it picks is one of the seven that week actually holds, not
      // a date invented outside the window the navigation says it is showing.
      expect(
        week.days.map((d) => dayKey(IST, d)),
        `offset ${offset}`,
      ).toContain(dayKey(IST, picked))
    }
  })

  it('draws today when today is in the week being shown', () => {
    expect(dayKey(IST, dayColumn(IST, weekWindow(IST, NOW, 0), null, NOW))).toBe(dayKey(IST, NOW))
  })

  it('draws the picked day rather than today when the calendar picked one', () => {
    const week = weekWindow(IST, NOW, 0)
    const picked = dayKey(IST, week.days[5]!)

    expect(dayKey(IST, dayColumn(IST, week, picked, NOW))).toBe(picked)
    expect(dayKey(IST, dayColumn(IST, week, picked, NOW))).not.toBe(dayKey(IST, NOW))
  })

  /**
   * A picked date outside the shown week is not a reason to draw nothing. The
   * page's own off-grid note already tells the reader their posts are elsewhere
   * and offers the list; a blank grid under a labelled week would say nothing at
   * all.
   */
  it('falls back to a real day when the picked date is not in this week', () => {
    const week = weekWindow(IST, NOW, 3)
    const picked = dayColumn(IST, week, '2020-01-01', NOW)

    expect(week.days.map((d) => dayKey(IST, d))).toContain(dayKey(IST, picked))
  })

  it('falls back to the start of the week when neither the pick nor today is in it', () => {
    const week = weekWindow(IST, NOW, 3)

    expect(dayKey(IST, dayColumn(IST, week, null, NOW))).toBe(dayKey(IST, week.days[0]!))
  })
})

describe('the week is the workspace’s week', () => {
  it('starts on Monday and runs seven consecutive days in the zone', () => {
    for (const zone of [IST, NY]) {
      const week = weekWindow(zone, NOW, 0)
      expect(week.days).toHaveLength(7)
      expect(week.days.map((d) => weekdayOffset(zone, d))).toEqual([0, 1, 2, 3, 4, 5, 6])
      expect(dayKey(zone, week.days[0]!)).toBe('2026-08-31')
      expect(dayKey(zone, week.days[6]!)).toBe('2026-09-06')
    }
  })

  it('files the audit’s post on Wednesday in New York and Thursday in Kolkata', () => {
    // 2026-09-02T20:00-04:00. Same instant, different column, and the row is
    // 8 pm in one and 5:30 am in the other. The card that was drawn in the Sept
    // 3 column at the 5 am row captioned "08:00 pm EDT" came from mixing them.
    const post = '2026-09-02T20:00:00-04:00'
    const at = new Date(post)
    expect(dayKey(NY, at)).toBe('2026-09-02')
    expect(dayKey(IST, at)).toBe('2026-09-03')
    expect(scheduledMinutes(NY, post)).toBe(20 * 60)
    expect(scheduledMinutes(IST, post)).toBe(5 * 60 + 30)

    // And the column index in each zone's week agrees with that key.
    const nyWeek = weekWindow(NY, NOW, 0).days.map((d) => dayKey(NY, d))
    const istWeek = weekWindow(IST, NOW, 0).days.map((d) => dayKey(IST, d))
    expect(nyWeek.indexOf(dayKey(NY, at))).toBe(2)
    expect(istWeek.indexOf(dayKey(IST, at))).toBe(3)
  })

  it('is seven distinct days across the week New York falls back', () => {
    // 1 November 2026 is the Sunday the clocks go back. Stepping by 24 hours
    // from that week's Monday used to land Sunday's column on Saturday again.
    const inThatWeek = new Date('2026-10-29T12:00:00Z')
    const week = weekWindow(NY, inThatWeek, 0)
    const keys = week.days.map((d) => dayKey(NY, d))
    expect(keys).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ])
    // Every column starts at that day's midnight, including the 25-hour one.
    for (const day of week.days) expect(partsInZone(NY, day).hour).toBe(0)
  })

  it('steps a whole week per offset, across the spring transition too', () => {
    const before = new Date('2026-03-04T12:00:00Z')
    const next = weekWindow(NY, before, 1)
    expect(dayKey(NY, next.days[0]!)).toBe('2026-03-09')
    expect(dayKey(NY, mondayOf(NY, before))).toBe('2026-03-02')
  })

  it('a stamp that does not parse has no minute to sit at', () => {
    expect(scheduledMinutes(IST, null)).toBeNull()
    expect(scheduledMinutes(IST, 'soon')).toBeNull()
  })
})
