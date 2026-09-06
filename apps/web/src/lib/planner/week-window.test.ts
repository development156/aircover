import { describe, expect, it } from 'vitest'

import { dayColumn, istDayKey, weekWindow } from './week-window'

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
 * ── WHY THE HELPER LIVES HERE ────────────────────────────────────────────────
 * Beside the window it selects from, so the two cannot drift, and so the
 * expression exists ONCE rather than being duplicated at the two call sites that
 * both had the broken filter.
 *
 * Pure: no I/O, no clock beyond what it is handed.
 */

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
      const week = weekWindow(NOW, offset)
      const filtered = week.days.filter((day) => istDayKey(day) === istDayKey(NOW))
      expect(filtered, `offset ${offset}`).toHaveLength(0)
    }
    expect(weekWindow(NOW, 0).days.filter((day) => istDayKey(day) === istDayKey(NOW))).toHaveLength(
      1,
    )
  })
})

describe('dayColumn always yields exactly one day to draw', () => {
  it('never returns nothing, on any week offset', () => {
    for (const offset of [-4, -1, 0, 1, 4]) {
      const week = weekWindow(NOW, offset)
      const picked = dayColumn(week, null, NOW)
      expect(picked, `offset ${offset}`).toBeInstanceOf(Date)
      // And the day it picks is one of the seven that week actually holds, not
      // a date invented outside the window the navigation says it is showing.
      expect(week.days.map(istDayKey), `offset ${offset}`).toContain(istDayKey(picked))
    }
  })

  it('draws today when today is in the week being shown', () => {
    expect(istDayKey(dayColumn(weekWindow(NOW, 0), null, NOW))).toBe(istDayKey(NOW))
  })

  it('draws the picked day rather than today when the calendar picked one', () => {
    const week = weekWindow(NOW, 0)
    const picked = istDayKey(week.days[5]!)

    expect(istDayKey(dayColumn(week, picked, NOW))).toBe(picked)
    expect(istDayKey(dayColumn(week, picked, NOW))).not.toBe(istDayKey(NOW))
  })

  /**
   * A picked date outside the shown week is not a reason to draw nothing. The
   * page's own off-grid note already tells the reader their posts are elsewhere
   * and offers the list; a blank grid under a labelled week would say nothing at
   * all.
   */
  it('falls back to a real day when the picked date is not in this week', () => {
    const week = weekWindow(NOW, 3)
    const picked = dayColumn(week, '2020-01-01', NOW)

    expect(week.days.map(istDayKey)).toContain(istDayKey(picked))
  })

  it('falls back to the start of the week when neither the pick nor today is in it', () => {
    const week = weekWindow(NOW, 3)

    expect(istDayKey(dayColumn(week, null, NOW))).toBe(istDayKey(week.days[0]!))
  })
})
