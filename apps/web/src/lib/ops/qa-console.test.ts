import { describe, expect, it } from 'vitest'
import type { OpsQaRun } from '@sahoda/shared'

import {
  applyQaFilters,
  buildFeed,
  facetsOf,
  formatDuration,
  NO_QA_FILTERS,
  standingFailures,
} from './qa-console'

const NOW = new Date('2026-07-26T12:00:00Z')

function run(over: Partial<OpsQaRun> & Pick<OpsQaRun, 'id'>): OpsQaRun {
  return {
    task_code: 'SL-018',
    kind: 'auto',
    suite: 'unit',
    status: 'pass',
    summary_plain: null,
    details: null,
    actor: 'claude',
    duration_ms: null,
    started_at: '2026-07-26T11:00:00Z',
    finished_at: '2026-07-26T11:00:10Z',
    created_at: '2026-07-26T11:00:10Z',
    updated_at: '2026-07-26T11:00:10Z',
    ...over,
  }
}

describe('standingFailures', () => {
  it('pins a failure that is the newest run for its card and suite', () => {
    expect(standingFailures([run({ id: 'a', status: 'fail' })]).map((r) => r.id)).toEqual(['a'])
  })

  it('clears the pin once a later run of the SAME suite answers', () => {
    // Superseded, not resolved-by-hand: the check was re-run and it answered.
    const runs = [
      run({ id: 'old', status: 'fail', started_at: '2026-07-26T10:00:00Z' }),
      run({ id: 'new', status: 'pass', started_at: '2026-07-26T11:00:00Z' }),
    ]

    expect(standingFailures(runs)).toEqual([])
  })

  it('replaces rather than stacks when the re-run fails again', () => {
    const runs = [
      run({ id: 'old', status: 'fail', started_at: '2026-07-26T10:00:00Z' }),
      run({ id: 'new', status: 'fail', started_at: '2026-07-26T11:00:00Z' }),
    ]

    expect(standingFailures(runs).map((r) => r.id)).toEqual(['new'])
  })

  it('does NOT let a green run in another suite bury a red one', () => {
    // The failure this prevents: a passing unit run clearing a failing rls run
    // on the same card. Unrelated evidence must not count as an answer.
    const runs = [
      run({ id: 'rls', suite: 'rls', status: 'fail', started_at: '2026-07-26T10:00:00Z' }),
      run({ id: 'unit', suite: 'unit', status: 'pass', started_at: '2026-07-26T11:00:00Z' }),
    ]

    expect(standingFailures(runs).map((r) => r.id)).toEqual(['rls'])
  })

  it('does not let a pass on a DIFFERENT card clear a pin', () => {
    const runs = [
      run({ id: 'a', task_code: 'SL-018', status: 'fail', started_at: '2026-07-26T10:00:00Z' }),
      run({ id: 'b', task_code: 'SL-019', status: 'pass', started_at: '2026-07-26T11:00:00Z' }),
    ]

    expect(standingFailures(runs).map((r) => r.id)).toEqual(['a'])
  })

  it('keeps card-less runs in their own lane rather than one shared bucket', () => {
    const runs = [
      run({ id: 'a', task_code: null, suite: 'smoke', status: 'fail' }),
      run({ id: 'b', task_code: null, suite: 'lint', status: 'pass' }),
    ]

    expect(standingFailures(runs).map((r) => r.id)).toEqual(['a'])
  })

  it('pins nothing when every newest run passed', () => {
    expect(standingFailures([run({ id: 'a' }), run({ id: 'b', suite: 'lint' })])).toEqual([])
  })

  it('does not pin a resolved failure — history is not a wall of old reds', () => {
    const runs = [
      run({ id: 'r1', status: 'fail', started_at: '2026-07-24T10:00:00Z' }),
      run({ id: 'r2', status: 'fail', started_at: '2026-07-25T10:00:00Z' }),
      run({ id: 'r3', status: 'pass', started_at: '2026-07-26T10:00:00Z' }),
    ]

    expect(standingFailures(runs)).toEqual([])
  })
})

describe('buildFeed', () => {
  const runs = [
    run({ id: 'fail', status: 'fail', suite: 'rls', started_at: '2026-07-26T09:00:00Z' }),
    run({ id: 'pass', status: 'pass', started_at: '2026-07-26T11:00:00Z' }),
  ]

  it('pins the standing failure above a newer passing run', () => {
    const feed = buildFeed(runs)
    expect(feed.pinned.map((r) => r.id)).toEqual(['fail'])
  })

  it('does not repeat a pinned run in the history below', () => {
    const feed = buildFeed(runs)
    expect(feed.history.map((r) => r.id)).toEqual(['pass'])
  })

  it('orders history newest first', () => {
    const feed = buildFeed([
      run({ id: 'old', started_at: '2026-07-26T09:00:00Z' }),
      run({ id: 'new', started_at: '2026-07-26T11:00:00Z' }),
    ])

    expect(feed.history.map((r) => r.id)).toEqual(['new', 'old'])
  })
})

describe('applyQaFilters', () => {
  const runs = [
    run({ id: 'a', suite: 'unit', status: 'pass', actor: 'claude', task_code: 'SL-018' }),
    run({ id: 'b', suite: 'manual', status: 'fail', actor: 'divas', task_code: 'SL-017' }),
    // Card-less and old — it exists to prove the date window, and must not
    // quietly join the SL-018 lane via the factory default.
    run({
      id: 'c',
      suite: 'unit',
      status: 'pass',
      task_code: null,
      started_at: '2026-07-01T10:00:00Z',
    }),
  ]

  it.each([
    [{ suite: 'manual' }, ['b']],
    [{ status: 'fail' }, ['b']],
    [{ actor: 'divas' }, ['b']],
    [{ taskCode: 'SL-018' }, ['a']],
  ])('filters by %o', (patch, expected) => {
    const got = applyQaFilters(runs, { ...NO_QA_FILTERS, ...patch }, NOW)
    expect(got.map((r) => r.id)).toEqual(expected)
  })

  it('windows by date without dropping anything when set to all', () => {
    expect(applyQaFilters(runs, NO_QA_FILTERS, NOW)).toHaveLength(3)
    expect(
      applyQaFilters(runs, { ...NO_QA_FILTERS, window: 'today' }, NOW).map((r) => r.id),
    ).toEqual(['a', 'b'])
    expect(applyQaFilters(runs, { ...NO_QA_FILTERS, window: 'week' }, NOW)).toHaveLength(2)
  })

  it('combines filters rather than replacing them', () => {
    const got = applyQaFilters(runs, { ...NO_QA_FILTERS, suite: 'unit', status: 'fail' }, NOW)
    expect(got).toEqual([])
  })
})

describe('facetsOf', () => {
  it('lists only values actually present, so no filter offers an empty result', () => {
    const facets = facetsOf([
      run({ id: 'a', suite: 'unit', status: 'pass', actor: 'claude', task_code: 'SL-018' }),
      run({ id: 'b', suite: 'manual', status: 'fail', actor: 'divas', task_code: null }),
    ])

    expect(facets).toEqual({
      suites: ['manual', 'unit'],
      statuses: ['fail', 'pass'],
      actors: ['claude', 'divas'],
      taskCodes: ['SL-018'],
    })
  })
})

describe('formatDuration', () => {
  it.each([
    [null, null],
    [-1, null],
    [812, '812 ms'],
    [1400, '1.4 s'],
    [125_000, '2 min 5 s'],
  ])('%p → %p', (ms, expected) => {
    expect(formatDuration(ms as number | null)).toBe(expected)
  })
})
