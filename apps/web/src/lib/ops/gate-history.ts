import type { OpsQaRun } from '@sahoda/shared'

import { GATE_SUITES, type GateSuite } from './read'
import { MIN_POINTS_FOR_TREND } from './flow-history'

/**
 * Gate health per suite over time, from `ops_qa_runs` (doc 13 §12, SL-042).
 *
 * THE GAP RULE LIVES HERE. A suite that did not run on a given day has no
 * status that day — not "the same as yesterday", and certainly not a value
 * interpolated between the days either side. Joining across it would draw a
 * green line through a week nobody tested, which is the single most dangerous
 * thing this chart could do: it would claim evidence that does not exist.
 *
 * So a day with no run is `null`, callers must render it as a hole, and
 * `coverage` says out loud how much of the window was actually measured.
 */

export type GateStatus = 'pass' | 'fail' | 'blocked'

export interface GateDay {
  day: string
  /** null = this suite did not run that day. A GAP, never a carried-forward value. */
  status: GateStatus | null
}

export interface GateSeries {
  suite: GateSuite
  days: readonly GateDay[]
  /** How many of the window's days this suite actually ran. */
  measuredDays: number
  failures: number
  /** Never trend through fewer than five measured points. */
  enoughForTrend: boolean
  /** The most recent known status, or null if it has never run in the window. */
  latest: GateStatus | null
}

export interface GateHistory {
  series: readonly GateSeries[]
  windowLabel: string
  days: readonly string[]
  /** Fraction of (suite × day) cells that carry a real run, 0–1. */
  coverage: number
}

function dayOf(run: OpsQaRun): string {
  return (run.finished_at ?? run.started_at ?? run.created_at).slice(0, 10)
}

function rank(run: OpsQaRun): number {
  return Date.parse(run.finished_at ?? run.started_at ?? run.created_at) || 0
}

function isGateStatus(value: string): value is GateStatus {
  return value === 'pass' || value === 'fail' || value === 'blocked'
}

function daysBackFrom(today: string, count: number): string[] {
  const end = Date.parse(`${today}T00:00:00Z`)
  return Array.from({ length: count }, (_, i) =>
    new Date(end - (count - 1 - i) * 86_400_000).toISOString().slice(0, 10),
  )
}

export function buildGateHistory(
  runs: readonly OpsQaRun[],
  now: Date,
  windowDays = 14,
): GateHistory {
  const today = now.toISOString().slice(0, 10)
  const days = daysBackFrom(today, windowDays)
  const inWindow = new Set(days)

  // Last run of each (suite, day) wins: the gate's verdict for a day is where
  // it ended up, not the first attempt.
  const latestPerCell = new Map<string, OpsQaRun>()
  for (const run of runs) {
    if (!isGateStatus(run.status)) continue
    const day = dayOf(run)
    if (!inWindow.has(day)) continue

    const key = `${run.suite}:${day}`
    const held = latestPerCell.get(key)
    if (!held || rank(run) >= rank(held)) latestPerCell.set(key, run)
  }

  let measuredCells = 0

  const series = GATE_SUITES.map((suite): GateSeries => {
    const cells = days.map((day): GateDay => {
      const run = latestPerCell.get(`${suite}:${day}`)
      // The gap. Absent is absent.
      if (!run || !isGateStatus(run.status)) return { day, status: null }
      return { day, status: run.status }
    })

    const measured = cells.filter((cell) => cell.status !== null)
    measuredCells += measured.length

    return {
      suite,
      days: cells,
      measuredDays: measured.length,
      failures: measured.filter((cell) => cell.status !== 'pass').length,
      enoughForTrend: measured.length >= MIN_POINTS_FOR_TREND,
      latest: measured.length > 0 ? (measured[measured.length - 1]!.status as GateStatus) : null,
    }
  })

  return {
    series,
    days,
    windowLabel: `${windowDays} days · ${days[0]} to ${today}`,
    coverage: series.length === 0 ? 0 : measuredCells / (series.length * days.length),
  }
}

/**
 * How the coverage figure is said in words.
 *
 * A number alone invites the reader to round it up in their head. Naming the
 * thin case explicitly is the point of the sentence.
 */
export function coverageNote(history: GateHistory): string {
  const percent = Math.round(history.coverage * 100)
  if (percent === 0)
    return 'No gate runs landed in this window. The chart below is empty, not green.'
  if (percent < 40) {
    return `Only ${percent}% of this window was measured. Gaps are days a suite did not run, not days it passed.`
  }
  return `${percent}% of this window was measured. Gaps are days a suite did not run.`
}
