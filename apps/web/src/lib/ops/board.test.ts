import { describe, expect, it } from 'vitest'
import type { OpsQaRun, OpsTask } from '@sahoda/shared'

import {
  applyFilters,
  columnEnteredAt,
  groupByColumn,
  NO_FILTERS,
  qaByTask,
  shortAge,
  stagesOn,
  toCards,
  WIP_NUDGE_AT,
} from './board'

const NOW = new Date('2026-07-26T10:00:00Z')

function task(over: Partial<OpsTask> & Pick<OpsTask, 'code'>): OpsTask {
  return {
    id: '00000000-0000-4000-8000-000000000003',
    title: over.code,
    detail: null,
    doc_ref: null,
    roadmap_code: null,
    board_column: 'todo',
    assignee: 'claude',
    blocked: false,
    blocked_reason: null,
    archived: false,
    pr_ref: null,
    commit_sha: null,
    started_at: null,
    review_at: null,
    done_at: null,
    moved_by: 'claude',
    sort: 10,
    created_at: '2026-07-26T09:00:00Z',
    updated_at: '2026-07-26T09:00:00Z',
    ...over,
  }
}

function run(over: Partial<OpsQaRun> & Pick<OpsQaRun, 'status'>): OpsQaRun {
  return {
    id: '00000000-0000-4000-8000-000000000004',
    task_code: 'SL-001',
    kind: 'auto',
    suite: 'unit',
    summary_plain: null,
    details: null,
    actor: 'claude',
    duration_ms: null,
    started_at: '2026-07-26T09:30:00Z',
    finished_at: '2026-07-26T09:30:10Z',
    created_at: '2026-07-26T09:30:10Z',
    updated_at: '2026-07-26T09:30:10Z',
    ...over,
  }
}

describe('columnEnteredAt', () => {
  it.each([
    ['todo', 'created_at'],
    ['in_progress', 'started_at'],
    ['review', 'review_at'],
    ['done', 'done_at'],
  ])('reads %s from %s', (column, field) => {
    const stamped = task({
      code: 'SL-001',
      board_column: column as OpsTask['board_column'],
      [field]: '2026-07-26T08:00:00Z',
    })

    expect(columnEnteredAt(stamped)).toBe('2026-07-26T08:00:00Z')
  })

  it('is null when the stamp for the current column is missing', () => {
    // No fallback on purpose. ops_ingest only ever COALESCES these stamps, so a
    // card moved backward keeps one it no longer deserves (SL-036) — an age of
    // "just now" on a week-old card is a confident wrong answer, and no age is
    // an honest one.
    expect(columnEnteredAt(task({ code: 'SL-001', board_column: 'review' }))).toBeNull()
  })
})

describe('qaByTask', () => {
  it('keeps only the newest verdict per card', () => {
    const dots = qaByTask([
      run({ status: 'fail', started_at: '2026-07-26T09:00:00Z' }),
      run({ status: 'pass', started_at: '2026-07-26T09:45:00Z' }),
    ])

    expect(dots.get('SL-001')).toBe('pass')
  })

  it('does not let `running` or `blocked` set a dot', () => {
    // A card mid-run has not passed. Showing green would be a claim nobody made.
    const dots = qaByTask([
      run({ status: 'running', started_at: '2026-07-26T09:50:00Z' }),
      run({ status: 'blocked', started_at: '2026-07-26T09:49:00Z' }),
    ])

    expect(dots.has('SL-001')).toBe(false)
  })

  it('ignores runs with no card attached', () => {
    expect(qaByTask([run({ status: 'pass', task_code: null })]).size).toBe(0)
  })
})

describe('toCards', () => {
  it('gives a card with no QA run the `none` dot, never green', () => {
    const [card] = toCards([task({ code: 'SL-009' })], [], NOW)
    expect(card!.qa).toBe('none')
  })

  it('measures age from the stamp of the column it is in', () => {
    const [card] = toCards(
      [task({ code: 'SL-001', board_column: 'in_progress', started_at: '2026-07-26T09:00:00Z' })],
      [],
      NOW,
    )

    expect(card!.ageMs).toBe(60 * 60 * 1000)
  })

  it('reports a null age rather than zero when the stamp is missing', () => {
    const [card] = toCards([task({ code: 'SL-001', board_column: 'done' })], [], NOW)
    expect(card!.ageMs).toBeNull()
  })

  it('clamps a future stamp to zero instead of negative time', () => {
    const [card] = toCards(
      [task({ code: 'SL-001', board_column: 'in_progress', started_at: '2026-07-26T11:00:00Z' })],
      [],
      NOW,
    )

    expect(card!.ageMs).toBe(0)
  })
})

describe('applyFilters', () => {
  const cards = toCards(
    [
      task({ code: 'SL-001', roadmap_code: 'AO1', assignee: 'claude' }),
      task({ code: 'SL-013', roadmap_code: 'AO3', assignee: 'divas' }),
      task({ code: 'SL-036', roadmap_code: null, assignee: 'claude', blocked: true }),
    ],
    [],
    NOW,
  )

  it('matches a stage by roadmap-code prefix, so AO covers AO1…AO5', () => {
    expect(applyFilters(cards, { ...NO_FILTERS, stage: 'AO' }).map((c) => c.code)).toEqual([
      'SL-001',
      'SL-013',
    ])
  })

  it('excludes cards with no roadmap code when a stage is selected', () => {
    // They belong to no stage. Including them would file mid-build debt under
    // whichever stage happens to be selected.
    expect(applyFilters(cards, { ...NO_FILTERS, stage: 'AO' }).map((c) => c.code)).not.toContain(
      'SL-036',
    )
  })

  it('shows unlinked cards when no stage filter is set', () => {
    expect(applyFilters(cards, NO_FILTERS)).toHaveLength(3)
  })

  it('filters by assignee and by blocked, and combines them', () => {
    expect(applyFilters(cards, { ...NO_FILTERS, assignee: 'divas' }).map((c) => c.code)).toEqual([
      'SL-013',
    ])
    expect(applyFilters(cards, { ...NO_FILTERS, blockedOnly: true }).map((c) => c.code)).toEqual([
      'SL-036',
    ])
    expect(
      applyFilters(cards, { ...NO_FILTERS, blockedOnly: true, assignee: 'divas' }),
    ).toHaveLength(0)
  })
})

describe('groupByColumn', () => {
  it('returns all four columns even when some are empty', () => {
    // An absent key would render three columns and silently lose one.
    const grouped = groupByColumn(toCards([task({ code: 'SL-001' })], [], NOW))

    expect(Object.keys(grouped)).toEqual(['todo', 'in_progress', 'review', 'done'])
    expect(grouped.done).toEqual([])
  })

  it('nudges rather than blocks — the threshold is a suggestion', () => {
    expect(WIP_NUDGE_AT).toBe(5)
  })
})

describe('shortAge', () => {
  it.each([
    [null, null],
    [30_000, 'just now'],
    [4 * 60_000, '4 min'],
    [3 * 3_600_000, '3 h'],
    [26 * 3_600_000, '1 day'],
    [72 * 3_600_000, '3 days'],
  ])('%p → %p', (ms, expected) => {
    expect(shortAge(ms as number | null)).toBe(expected)
  })
})

describe('stagesOn', () => {
  it('lists the distinct stage prefixes present, ignoring unlinked cards', () => {
    const cards = toCards(
      [
        task({ code: 'SL-001', roadmap_code: 'AO1' }),
        task({ code: 'SL-002', roadmap_code: 'AO3' }),
        task({ code: 'SL-003', roadmap_code: 'A5' }),
        task({ code: 'SL-036', roadmap_code: null }),
      ],
      [],
      NOW,
    )

    expect(stagesOn(cards)).toEqual(['A', 'AO'])
  })
})
