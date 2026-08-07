import { describe, expect, it } from 'vitest'
import type { OpsRoadmapItem } from '@sahoda/shared'

import {
  currentStage,
  daysRemaining,
  stageLabel,
  summarise,
  toReachDone,
  urgencyOf,
  journeyPercent,
} from './roadmap-progress'

/**
 * NO `as OpsRoadmapItem` HERE, deliberately.
 *
 * The first draft of this helper cast its return value, and the cast let four
 * call sites pass `status: 'in_progress'` — a value the enum does not have and
 * the table's CHECK constraint rejects. The tests were green against a status
 * that could not exist, which is a test suite proving the wrong thing. The
 * annotated return type makes the enum load-bearing at every call site.
 */
function item(
  over: Partial<OpsRoadmapItem> & Pick<OpsRoadmapItem, 'code' | 'stage'>,
): OpsRoadmapItem {
  return {
    id: '00000000-0000-4000-8000-000000000000',
    title: over.code,
    weight: 1,
    status: 'todo',
    target_date: null,
    sort: 1,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...over,
  }
}

describe('currentStage', () => {
  it('skips a stage where nothing has started, to the stage with work in flight', () => {
    // The real shape: every Alpha item is recorded `todo` on purpose (the seed
    // refuses to claim a status the last gate review scored 6/14 FAIL), so
    // "earliest incomplete stage" would pin the card to Alpha forever and hide
    // the stage actually being built.
    const items = [
      item({ code: 'A1', stage: 'alpha', sort: 1 }),
      item({ code: 'AO1', stage: 'admin-ops', sort: 20, status: 'done' }),
      item({ code: 'AO2', stage: 'admin-ops', sort: 21, status: 'active' }),
    ]

    expect(currentStage(items)).toBe('admin-ops')
  })

  it('falls back to the earliest incomplete stage when nothing has started at all', () => {
    const items = [
      item({ code: 'A1', stage: 'alpha', sort: 1 }),
      item({ code: 'B1', stage: 'backlog-1', sort: 100 }),
    ]

    expect(currentStage(items)).toBe('alpha')
  })

  it('is null when every item is done', () => {
    expect(currentStage([item({ code: 'A1', stage: 'alpha', status: 'done' })])).toBeNull()
  })

  it('orders stages by the items own sort, not alphabetically', () => {
    // `admin-ops` sorts before `alpha` as a string. docs/05's ordering is the
    // ordering, and it lives in `sort`.
    const items = [
      item({ code: 'AO1', stage: 'admin-ops', sort: 20, status: 'active' }),
      item({ code: 'A1', stage: 'alpha', sort: 1, status: 'active' }),
    ]

    expect(currentStage(items)).toBe('alpha')
  })
})

describe('summarise', () => {
  const items = [
    item({ code: 'AO1', stage: 'admin-ops', sort: 20, weight: 3, status: 'done' }),
    item({ code: 'AO2', stage: 'admin-ops', sort: 21, weight: 3, status: 'done' }),
    item({ code: 'AO3', stage: 'admin-ops', sort: 22, weight: 6, status: 'active' }),
    item({ code: 'AO4', stage: 'admin-ops', sort: 23, weight: 6 }),
  ]

  it('weighs progress rather than counting items', () => {
    // Half the ITEMS are done but only a third of the WEIGHT — doc 13 §18 gives
    // each phase its timebox as weight so the bar tracks effort, not tickets.
    const stage = summarise(items)[0]!
    expect(stage.doneWeight).toBe(6)
    expect(stage.totalWeight).toBe(18)
    expect(stage.percent).toBe(33)
  })

  it('floors the percentage so a full bar never renders over an open item', () => {
    const nearlyDone = [
      item({ code: 'X1', stage: 's', weight: 999, status: 'done' }),
      item({ code: 'X2', stage: 's', weight: 1 }),
    ]

    expect(summarise(nearlyDone)[0]!.percent).toBe(99)
  })

  it('lists open items in sort order', () => {
    expect(summarise(items)[0]!.openItems.map((i) => i.code)).toEqual(['AO3', 'AO4'])
  })

  it('marks exactly one stage active and completed stages done', () => {
    const mixed = [
      item({ code: 'A1', stage: 'alpha', sort: 1, status: 'done' }),
      ...items,
      item({ code: 'B1', stage: 'backlog-1', sort: 100 }),
    ]
    const states = summarise(mixed).map((s) => `${s.stage}:${s.state}`)

    expect(states).toEqual(['alpha:done', 'admin-ops:active', 'backlog-1:todo'])
  })

  it('does not divide by zero on an empty stage', () => {
    expect(summarise([item({ code: 'Z', stage: 'z', weight: 0 })])[0]!.percent).toBe(0)
  })
})

describe('daysRemaining', () => {
  it('is null with no target, which is a real answer and not zero', () => {
    expect(daysRemaining(null, new Date('2026-07-26T00:00:00Z'))).toBeNull()
  })

  it('counts calendar days, not elapsed hours', () => {
    // 23:00 on the 26th is still 3 days from the 29th. Comparing instants would
    // say 2, and the amber threshold would trip a day early every evening.
    expect(daysRemaining('2026-07-29', new Date('2026-07-26T23:00:00Z'))).toBe(3)
    expect(daysRemaining('2026-07-29', new Date('2026-07-26T00:30:00Z'))).toBe(3)
  })

  it('goes negative when overdue', () => {
    expect(daysRemaining('2026-07-24', new Date('2026-07-26T10:00:00Z'))).toBe(-2)
  })

  it('is null for an unparseable date rather than NaN days', () => {
    expect(daysRemaining('not-a-date', new Date('2026-07-26T00:00:00Z'))).toBeNull()
  })
})

describe('urgencyOf', () => {
  it.each([
    [null, 'none'],
    [-1, 'overdue'],
    [0, 'soon'],
    [3, 'soon'],
    [4, 'calm'],
  ])('%p → %s', (days, expected) => {
    expect(urgencyOf(days as number | null)).toBe(expected)
  })
})

describe('toReachDone', () => {
  const stage = summarise([
    item({ code: 'AO3', stage: 'admin-ops', sort: 22 }),
    item({ code: 'AO4', stage: 'admin-ops', sort: 23 }),
  ])[0]!

  it('puts red gates first, then blocked cards, then the remaining build', () => {
    const list = toReachDone({
      stage,
      blockedTasks: [{ code: 'SL-020', title: 'x', blocked_reason: 'waiting on a decision' }],
      redSuites: ['unit'],
    })

    expect(list.map((entry) => entry.kind)).toEqual(['gate', 'blocked', 'roadmap', 'roadmap'])
  })

  it('says so when a card is blocked with no reason recorded', () => {
    // Silence here would read as "blocked for a good reason". It is not one.
    const entry = toReachDone({
      stage: null,
      blockedTasks: [{ code: 'SL-020', title: 'x', blocked_reason: null }],
      redSuites: [],
    })[0]!

    expect(entry.label).toContain('no reason recorded')
  })

  it('links a blocked card to its board anchor', () => {
    const entry = toReachDone({
      stage: null,
      blockedTasks: [{ code: 'SL-020', title: 'x', blocked_reason: 'r' }],
      redSuites: [],
    })[0]!

    expect(entry.href).toBe('#task-SL-020')
  })

  it('is empty when there is nothing in the way', () => {
    expect(toReachDone({ stage: null, blockedTasks: [], redSuites: [] })).toEqual([])
  })
})

describe('stageLabel', () => {
  it.each([
    ['alpha', 'Alpha'],
    ['admin-ops', 'Admin Ops'],
    ['backlog-3', 'Backlog 3'],
  ])('%s → %s', (stage, expected) => {
    expect(stageLabel(stage)).toBe(expected)
  })
})

describe('journeyPercent — the headline number (doc 16 §6)', () => {
  const item = (status: string, weight = 1) =>
    ({ status, weight, code: 'X', stage: 's', title: 't', sort: 0 }) as never

  it('measures the WHOLE roadmap, not the active stage', () => {
    // The regression: on 1 Aug the card headlined 60% (the admin-ops stage at
    // 12/20 of its own weight) while the roadmap stood at 22%. A reader takes a
    // number that size as "the product is 60% done" — doc 15 §2 rule 3.
    const items = [item('done', 12), item('todo', 8), item('todo', 34)]
    expect(journeyPercent(items)).toBe(22)
  })

  it('floors rather than rounds, so it never flatters', () => {
    expect(journeyPercent([item('done', 229), item('todo', 771)])).toBe(22)
  })

  it('is 0 when nothing is done, and 100 only when everything is', () => {
    expect(journeyPercent([item('todo'), item('todo')])).toBe(0)
    expect(journeyPercent([item('done'), item('done')])).toBe(100)
  })

  it('counts only done — active and cut are not progress', () => {
    expect(journeyPercent([item('done'), item('active'), item('cut'), item('todo')])).toBe(25)
  })

  it('does not divide by zero on an empty roadmap', () => {
    expect(journeyPercent([])).toBe(0)
  })
})

describe('journeyPercent excludes the status-only stage', () => {
  const item = (status: string, weight = 1, stage = 'alpha') =>
    ({ status, weight, stage, code: 'X', title: 't', sort: 0 }) as never

  it('does not let §6 phase markers dilute the denominator', () => {
    // They mirror work counted elsewhere; counting both understates progress.
    const product = [item('done', 12), item('todo', 42)]
    const withPhases = [...product, item('active', 6, 'beta-path'), item('todo', 22, 'beta-path')]
    expect(journeyPercent(product)).toBe(22)
    expect(journeyPercent(withPhases)).toBe(22)
  })
})
