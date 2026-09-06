import { describe, expect, test } from 'vitest'

import { readWindowBounds } from './read-window'
import { monthGridKeys } from './month'
import { weekWindow } from './week-window'
import { dayKey } from '@/lib/time/day-key'

const IST = 'Asia/Kolkata'
const NY = 'America/New_York'
const AKL = 'Pacific/Auckland'

const NOW = new Date('2026-09-06T12:00:00Z')

/**
 * THE INSTANTS THE CALENDAR QUERY ASKS FOR.
 *
 * Computed WITHOUT the workspace's zone, on purpose: the zone comes from the
 * workspace read, and waiting for it before asking for the posts would add a
 * round trip to every planner render. Instead the bounds are read in UTC and
 * padded by a day on each side, which covers every zone the runtime knows
 * (UTC-12 to UTC+14). The over-fetch is filtered by the drawn day keys; the
 * under-fetch is what this file exists to make impossible.
 */
describe('readWindowBounds', () => {
  test('covers every day the week grid draws, in Kolkata, New York and Auckland', () => {
    for (const zone of [IST, NY, AKL]) {
      for (const weekOffset of [-3, 0, 5]) {
        const { fromIso, toIso } = readWindowBounds({ now: NOW, weekOffset, monthKey: null })
        const from = Date.parse(fromIso)
        const to = Date.parse(toIso)
        for (const day of weekWindow(zone, NOW, weekOffset).days) {
          // The whole day: its first instant and its last.
          const start = day.getTime()
          const end = start + 24 * 3_600_000 - 1
          expect(
            start,
            `${zone} week ${weekOffset} start ${day.toISOString()}`,
          ).toBeGreaterThanOrEqual(from)
          expect(end, `${zone} week ${weekOffset} end`).toBeLessThan(to)
        }
      }
    }
  })

  test('covers all 42 days of the month grid for the anchored month, in every zone', () => {
    for (const zone of [IST, NY, AKL]) {
      for (const monthKey of [null, '2026-11', '2027-02']) {
        const { fromIso, toIso } = readWindowBounds({ now: NOW, weekOffset: 0, monthKey })
        const anchor = monthKey === null ? NOW : new Date(`${monthKey}-01T12:00:00Z`)
        const keys = monthGridKeys(zone, anchor)
        // Each drawn key must sit strictly inside the bounds, read as a UTC day.
        expect(keys[0]! >= dayKey('UTC', new Date(fromIso)), `${zone} ${monthKey} first`).toBe(true)
        expect(
          keys[keys.length - 1]! < dayKey('UTC', new Date(toIso)),
          `${zone} ${monthKey} last`,
        ).toBe(true)
      }
    }
  })

  test('is the UNION of the week and the month: a far week does not drop this month’s dots', () => {
    const { fromIso, toIso } = readWindowBounds({ now: NOW, weekOffset: 10, monthKey: null })
    // Ten weeks ahead ends no earlier than 15 November; this month's grid
    // starts on 31 August. Both edges must be inside one window.
    expect(Date.parse(fromIso)).toBeLessThanOrEqual(Date.parse('2026-08-30T00:00:00Z'))
    expect(Date.parse(toIso)).toBeGreaterThan(Date.parse('2026-11-15T23:59:59Z'))
  })

  test('a zone whose Monday has already begun is still inside the week — Auckland at 12:00Z Sunday', () => {
    // 2026-09-06T12:00Z is Monday 00:00 in Auckland, so Auckland's "this week"
    // is a whole week later than UTC's. One day of padding cannot cover a
    // seven-day flip; the bounds must be built from every day `now` can be.
    const { toIso } = readWindowBounds({ now: NOW, weekOffset: 0, monthKey: null })
    const aucklandSunday = weekWindow(AKL, NOW, 0).days[6]!
    expect(aucklandSunday.getTime() + 24 * 3_600_000).toBeLessThanOrEqual(Date.parse(toIso))
  })

  test('the audit’s post, 2026-09-02T20:00-04:00, is inside this week’s bounds', () => {
    const { fromIso, toIso } = readWindowBounds({ now: NOW, weekOffset: 0, monthKey: null })
    const at = Date.parse('2026-09-02T20:00:00-04:00')
    expect(at).toBeGreaterThanOrEqual(Date.parse(fromIso))
    expect(at).toBeLessThan(Date.parse(toIso))
  })

  test('emits ISO strings Postgres can compare', () => {
    const { fromIso, toIso } = readWindowBounds({ now: NOW, weekOffset: 0, monthKey: null })
    expect(fromIso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(toIso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(Date.parse(fromIso)).toBeLessThan(Date.parse(toIso))
  })
})
