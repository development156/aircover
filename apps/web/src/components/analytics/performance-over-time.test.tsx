import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { PerformanceOverTime, pathFor } from './performance-over-time'
import type { MetricSeries, SeriesPoint } from '@/lib/analytics/series'

/**
 * The trend card, and the five things it refuses to draw.
 *
 * ── THE ONE THAT NEEDS A UNIT TEST RATHER THAN AN EYE ────────────────────────
 * A line drawn THROUGH a missing day. It looks completely correct — a smooth
 * segment between two real readings — and it is a claim that something was
 * measured in between. Nothing on screen distinguishes it from an honest line, so
 * only the path commands can be checked: a break is an `M`, a join is an `L`.
 */

const point = (day: string, total: number, series = 1): SeriesPoint => ({ day, total, series })

const ready = (points: SeriesPoint[], min = 1, max = 1): MetricSeries => ({
  kind: 'ready',
  points,
  minSeries: min,
  maxSeries: max,
})

describe('the path', () => {
  test('joins consecutive days', () => {
    const d = pathFor([point('2026-08-17', 10), point('2026-08-18', 20), point('2026-08-19', 30)])
    // One move to the start, then two joined segments.
    expect(d.match(/M/g)).toHaveLength(1)
    expect(d.match(/L/g)).toHaveLength(2)
  })

  test('BREAKS across a missing day rather than spanning it', () => {
    // The 18th was never measured. A segment drawn over it would assert a reading
    // that does not exist, and would look exactly like an honest one.
    const d = pathFor([point('2026-08-17', 10), point('2026-08-19', 30), point('2026-08-20', 40)])
    expect(d.match(/M/g)).toHaveLength(2)
    expect(d.match(/L/g)).toHaveLength(1)
  })

  test('draws a flat series down the middle rather than inventing variation', () => {
    const d = pathFor([point('2026-08-17', 50), point('2026-08-18', 50), point('2026-08-19', 50)])
    const ys = [...d.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map((m) => m[2])
    expect(new Set(ys).size).toBe(1)
  })

  test('has nothing to draw for no points', () => {
    expect(pathFor([])).toBe('')
  })
})

describe('what the card says', () => {
  test('before the migration, it says Sahoda keeps no history yet', () => {
    // The default, and the state production is in. Unchanged from what this card
    // has always said.
    render(<PerformanceOverTime />)
    expect(screen.getByText(/does not keep a history yet/i)).toBeVisible()
  })

  test('a failed read is not reported as an absence of history', () => {
    // "There is no history" is a claim about the workspace's data. This read did
    // not establish it — what failed was the reading.
    render(<PerformanceOverTime series={{ kind: 'unreadable' }} />)
    expect(screen.getByText(/could not read the history/i)).toBeVisible()
    expect(screen.queryByText(/does not keep a history/i)).toBeNull()
  })

  test('a table with nothing in it yet says so, and does not claim a fault', () => {
    render(<PerformanceOverTime series={{ kind: 'empty' }} />)
    expect(screen.getByText(/has started keeping a history/i)).toBeVisible()
  })

  test('two days states the floor and the reason for it', () => {
    render(<PerformanceOverTime series={{ kind: 'sparse', days: 2 }} />)
    expect(screen.getByText(/2 days measured so far/i)).toBeVisible()
    expect(screen.getByText(/shows a direction neither of them measured/i)).toBeVisible()
  })

  test('draws the chart once there are three days', () => {
    render(
      <PerformanceOverTime
        series={ready([
          point('2026-08-17', 100),
          point('2026-08-18', 200),
          point('2026-08-19', 300),
        ])}
      />,
    )
    expect(screen.getByRole('img')).toBeVisible()
    expect(screen.getByText(/3 measured days/i)).toBeVisible()
  })

  test('names the number as a running total, never as a per-day figure', () => {
    // The stored values are lifetime totals since each post went out. Calling them
    // anything else invites the reader to subtract, which produces a number no
    // platform ever reported.
    render(
      <PerformanceOverTime
        series={ready([
          point('2026-08-17', 100),
          point('2026-08-18', 200),
          point('2026-08-19', 300),
        ])}
      />,
    )
    expect(screen.getByText(/running total since each post went out/i)).toBeVisible()
  })

  test('states the coverage when it moved across the window', () => {
    render(
      <PerformanceOverTime
        series={ready(
          [point('2026-08-17', 100, 2), point('2026-08-18', 90, 1), point('2026-08-19', 95, 2)],
          1,
          2,
        )}
      />,
    )
    // Otherwise the dip on the 18th reads as a fall in performance rather than
    // one fewer post reporting.
    expect(screen.getByText(/how many reported rather than how they did/i)).toBeVisible()
  })

  test('says nothing about coverage when it did not move', () => {
    render(
      <PerformanceOverTime
        series={ready([
          point('2026-08-17', 100),
          point('2026-08-18', 200),
          point('2026-08-19', 300),
        ])}
      />,
    )
    expect(screen.queryByText(/how many reported/i)).toBeNull()
  })

  test('describes the chart for a reader who cannot see it', () => {
    render(
      <PerformanceOverTime
        series={ready([
          point('2026-08-17', 100),
          point('2026-08-18', 200),
          point('2026-08-19', 300),
        ])}
      />,
    )
    expect(screen.getByRole('img')).toHaveAccessibleName(/3 measured days/i)
  })
})
