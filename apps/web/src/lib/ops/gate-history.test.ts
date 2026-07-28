import { describe, expect, it } from 'vitest'
import type { OpsQaRun } from '@sahoda/shared'

import { buildGateHistory, coverageNote } from './gate-history'

const NOW = new Date('2026-07-28T12:00:00Z')

const run = (over: Partial<OpsQaRun> & { suite: string; status: string }): OpsQaRun =>
  ({
    id: crypto.randomUUID(),
    task_code: null,
    kind: 'auto',
    summary_plain: null,
    details: null,
    actor: 'claude',
    duration_ms: 10,
    started_at: '2026-07-28T09:00:00Z',
    finished_at: '2026-07-28T09:00:01Z',
    created_at: '2026-07-28T09:00:00Z',
    updated_at: '2026-07-28T09:00:01Z',
    ...over,
  }) as OpsQaRun

const seriesFor = (history: ReturnType<typeof buildGateHistory>, suite: string) =>
  history.series.find((entry) => entry.suite === suite)!

describe('a day with no run is a GAP', () => {
  it('leaves null on days the suite did not run, rather than carrying yesterday forward', () => {
    // The single most dangerous thing this chart could do is draw a green line
    // through a week nobody tested. Absent is absent.
    const history = buildGateHistory(
      [run({ suite: 'unit', status: 'pass', finished_at: '2026-07-28T09:00:00Z' })],
      NOW,
      5,
    )

    const unit = seriesFor(history, 'unit')
    expect(unit.days.map((day) => day.status)).toEqual([null, null, null, null, 'pass'])
  })

  it('does not fill the hole BETWEEN two known points', () => {
    // Interpolating here would claim evidence for the middle days that does not
    // exist. They must stay null so the renderer breaks the line.
    const history = buildGateHistory(
      [
        run({ suite: 'unit', status: 'pass', finished_at: '2026-07-24T09:00:00Z' }),
        run({ suite: 'unit', status: 'fail', finished_at: '2026-07-28T09:00:00Z' }),
      ],
      NOW,
      5,
    )

    expect(seriesFor(history, 'unit').days.map((day) => day.status)).toEqual([
      'pass',
      null,
      null,
      null,
      'fail',
    ])
  })

  it('reports a suite that never ran as never run, not as passing', () => {
    const history = buildGateHistory([run({ suite: 'unit', status: 'pass' })], NOW, 5)

    const smoke = seriesFor(history, 'smoke')
    expect(smoke.latest).toBeNull()
    expect(smoke.measuredDays).toBe(0)
    expect(smoke.days.every((day) => day.status === null)).toBe(true)
  })
})

describe('which run speaks for a day', () => {
  it('takes the LAST run of the day — where the gate ended up', () => {
    const history = buildGateHistory(
      [
        run({ suite: 'unit', status: 'fail', finished_at: '2026-07-28T09:00:00Z' }),
        run({ suite: 'unit', status: 'pass', finished_at: '2026-07-28T17:00:00Z' }),
      ],
      NOW,
      3,
    )

    expect(seriesFor(history, 'unit').latest).toBe('pass')
  })

  it('is not fooled by the order they arrive in', () => {
    const history = buildGateHistory(
      [
        run({ suite: 'unit', status: 'pass', finished_at: '2026-07-28T17:00:00Z' }),
        run({ suite: 'unit', status: 'fail', finished_at: '2026-07-28T09:00:00Z' }),
      ],
      NOW,
      3,
    )

    expect(seriesFor(history, 'unit').latest).toBe('pass')
  })

  it('ignores runs outside the window entirely', () => {
    const history = buildGateHistory(
      [run({ suite: 'unit', status: 'pass', finished_at: '2026-01-01T09:00:00Z' })],
      NOW,
      3,
    )

    expect(seriesFor(history, 'unit').measuredDays).toBe(0)
  })

  it('counts blocked as a failure, because it is not a pass', () => {
    const history = buildGateHistory([run({ suite: 'rls', status: 'blocked' })], NOW, 3)

    expect(seriesFor(history, 'rls').failures).toBe(1)
  })
})

describe('no trend through fewer than five points', () => {
  it('refuses a trend on four measured days', () => {
    const runs = ['2026-07-25', '2026-07-26', '2026-07-27', '2026-07-28'].map((day) =>
      run({ suite: 'unit', status: 'pass', finished_at: `${day}T09:00:00Z` }),
    )

    expect(seriesFor(buildGateHistory(runs, NOW, 10), 'unit').enoughForTrend).toBe(false)
  })

  it('allows one at five', () => {
    const runs = ['2026-07-24', '2026-07-25', '2026-07-26', '2026-07-27', '2026-07-28'].map((day) =>
      run({ suite: 'unit', status: 'pass', finished_at: `${day}T09:00:00Z` }),
    )

    expect(seriesFor(buildGateHistory(runs, NOW, 10), 'unit').enoughForTrend).toBe(true)
  })

  it('counts MEASURED days, not the width of the window', () => {
    // A 30-day window with two runs in it is two points, not thirty.
    const runs = ['2026-07-27', '2026-07-28'].map((day) =>
      run({ suite: 'unit', status: 'pass', finished_at: `${day}T09:00:00Z` }),
    )

    expect(seriesFor(buildGateHistory(runs, NOW, 30), 'unit').enoughForTrend).toBe(false)
  })
})

describe('coverage is stated, not implied', () => {
  it('is zero when nothing ran', () => {
    const history = buildGateHistory([], NOW, 7)

    expect(history.coverage).toBe(0)
    expect(coverageNote(history)).toContain('empty, not green')
  })

  it('names a thin window as thin', () => {
    const history = buildGateHistory([run({ suite: 'unit', status: 'pass' })], NOW, 10)

    expect(coverageNote(history)).toMatch(/Only \d+% of this window was measured/)
  })

  it('always explains what a gap means', () => {
    const runs = ['2026-07-27', '2026-07-28'].flatMap((day) =>
      (['typecheck', 'lint', 'unit', 'rls', 'smoke'] as const).map((suite) =>
        run({ suite, status: 'pass', finished_at: `${day}T09:00:00Z` }),
      ),
    )
    const history = buildGateHistory(runs, NOW, 2)

    expect(history.coverage).toBe(1)
    expect(coverageNote(history)).toContain('did not run')
  })

  it('states the window in words', () => {
    expect(buildGateHistory([], NOW, 14).windowLabel).toContain('14 days')
  })
})
