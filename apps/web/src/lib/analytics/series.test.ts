import { describe, expect, test } from 'vitest'

import { MIN_SERIES_DAYS, seriesFromRows, windowStart } from './series'

/**
 * Turning stored measurements into days, and deciding whether there is a chart.
 *
 * ── THE TWO PROPERTIES ───────────────────────────────────────────────────────
 * A day nothing was measured produces NO POINT — never a zero — because a zero
 * plotted on a chart draws a cliff that never happened and is indistinguishable
 * from a real reading.
 *
 * And below three measured days there is no chart at all. Two points are a
 * straight line between them: they show a direction neither of them measured.
 * The floor is on the SERIES being drawn, not on the size of the table.
 */

const row = (day: string, value: number | string) => ({ measured_on: day, value })

describe('the three-day floor', () => {
  test('one day is not a trend', () => {
    expect(seriesFromRows([row('2026-08-17', 1200)])).toEqual({ kind: 'sparse', days: 1 })
  })

  test('two days is still not a trend — this is the boundary', () => {
    // The case the floor exists for. A line between two readings implies a rate
    // of change that two readings cannot support.
    const series = seriesFromRows([row('2026-08-17', 1200), row('2026-08-18', 1450)])
    expect(series).toEqual({ kind: 'sparse', days: 2 })
  })

  test('three days is', () => {
    const series = seriesFromRows([
      row('2026-08-17', 1200),
      row('2026-08-18', 1450),
      row('2026-08-19', 1600),
    ])
    expect(series.kind).toBe('ready')
    expect(MIN_SERIES_DAYS).toBe(3)
  })

  test('counts DAYS, not rows — many channels on two days is still sparse', () => {
    // Six rows, two days. Counting rows would clear the floor with a two-point
    // line, which is exactly the chart the floor forbids.
    const series = seriesFromRows([
      row('2026-08-17', 10),
      row('2026-08-17', 20),
      row('2026-08-17', 30),
      row('2026-08-18', 11),
      row('2026-08-18', 21),
      row('2026-08-18', 31),
    ])
    expect(series).toEqual({ kind: 'sparse', days: 2 })
  })
})

describe('building the days', () => {
  test('sums every channel measured on a day, and counts them', () => {
    const series = seriesFromRows([
      row('2026-08-17', 100),
      row('2026-08-17', 200),
      row('2026-08-18', 400),
      row('2026-08-19', 500),
    ])

    expect(series).toMatchObject({
      kind: 'ready',
      points: [
        { day: '2026-08-17', total: 300, series: 2 },
        { day: '2026-08-18', total: 400, series: 1 },
        { day: '2026-08-19', total: 500, series: 1 },
      ],
    })
  })

  test('reads a bigint that arrived as a string', () => {
    // `value` is a bigint, and bigints come back as strings over the wire. Read as
    // a plain number they become NaN, and a NaN in a sum poisons the whole day.
    const series = seriesFromRows([
      row('2026-08-17', '4000000000'),
      row('2026-08-18', '10'),
      row('2026-08-19', '20'),
    ])
    expect(series).toMatchObject({ kind: 'ready' })
    if (series.kind === 'ready') expect(series.points[0]?.total).toBe(4_000_000_000)
  })

  test('leaves a day with no measurement out entirely', () => {
    // The 18th is missing. It must NOT appear as a point, with any value.
    const series = seriesFromRows([
      row('2026-08-17', 100),
      row('2026-08-19', 300),
      row('2026-08-20', 400),
    ])

    expect(series.kind).toBe('ready')
    if (series.kind === 'ready') {
      expect(series.points.map((p) => p.day)).toEqual(['2026-08-17', '2026-08-19', '2026-08-20'])
    }
  })

  test('drops a row it cannot read rather than counting it as zero', () => {
    // An unreadable row is not evidence anything was measured, so it neither adds
    // to a total nor creates a day.
    const series = seriesFromRows([
      row('2026-08-17', 'not a number'),
      row('2026-08-18', 400),
      row('2026-08-19', 500),
      row('2026-08-20', 600),
    ])

    expect(series.kind).toBe('ready')
    if (series.kind === 'ready') {
      expect(series.points.map((p) => p.day)).toEqual(['2026-08-18', '2026-08-19', '2026-08-20'])
    }
  })

  test('says nothing is measured rather than drawing an empty chart', () => {
    expect(seriesFromRows([])).toEqual({ kind: 'empty' })
  })

  test('reports the coverage range, so a dip can be read honestly', () => {
    // Two channels on one day and one on the next makes the total fall for a
    // reason that is not performance. The card states this rather than hiding it.
    const series = seriesFromRows([
      row('2026-08-17', 100),
      row('2026-08-17', 100),
      row('2026-08-18', 100),
      row('2026-08-19', 100),
    ])

    expect(series).toMatchObject({ kind: 'ready', minSeries: 1, maxSeries: 2 })
  })

  test('sorts the days, whatever order the rows arrived in', () => {
    const series = seriesFromRows([
      row('2026-08-19', 3),
      row('2026-08-17', 1),
      row('2026-08-18', 2),
    ])
    if (series.kind === 'ready') {
      expect(series.points.map((p) => p.day)).toEqual(['2026-08-17', '2026-08-18', '2026-08-19'])
    }
  })
})

describe('the window', () => {
  test('starts thirty days back, in UTC days', () => {
    expect(windowStart(new Date('2026-08-19T02:00:00Z'))).toBe('2026-07-20')
  })
})
