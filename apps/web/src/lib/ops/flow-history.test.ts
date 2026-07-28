import { describe, expect, it } from 'vitest'
import type { OpsTask } from '@sahoda/shared'

import { buildFlowHistory, stageOn } from './flow-history'

const NOW = new Date('2026-07-28T12:00:00Z')
const END = (day: string) => Date.parse(`${day}T23:59:59.999Z`)

const task = (over: Partial<OpsTask> = {}): OpsTask =>
  ({
    code: 'SL-001',
    title: 'x',
    detail: null,
    doc_ref: null,
    roadmap_code: null,
    board_column: 'todo',
    assignee: 'claude',
    blocked: false,
    blocked_reason: null,
    pr_ref: null,
    commit_sha: null,
    started_at: null,
    review_at: null,
    done_at: null,
    moved_by: 'claude',
    sort: 10,
    created_at: '2026-07-20T09:00:00Z',
    updated_at: '2026-07-20T09:00:00Z',
    ...over,
  }) as OpsTask

describe('which column a task was in on a given day', () => {
  it('does not count a task before it existed', () => {
    // Otherwise the chart opens with work that had not been thought of yet.
    expect(stageOn(task({ created_at: '2026-07-20T09:00:00Z' }), END('2026-07-19'))).toBeNull()
    expect(stageOn(task({ created_at: '2026-07-20T09:00:00Z' }), END('2026-07-20'))).toBe('todo')
  })

  it('takes the furthest stage reached by that day, not the first', () => {
    const moved = task({
      created_at: '2026-07-20T09:00:00Z',
      started_at: '2026-07-21T09:00:00Z',
      review_at: '2026-07-22T09:00:00Z',
      done_at: '2026-07-23T09:00:00Z',
    })

    expect(stageOn(moved, END('2026-07-20'))).toBe('todo')
    expect(stageOn(moved, END('2026-07-21'))).toBe('in_progress')
    expect(stageOn(moved, END('2026-07-22'))).toBe('review')
    expect(stageOn(moved, END('2026-07-23'))).toBe('done')
  })

  it('counts a stamp made anywhere in the day as reached that day', () => {
    // A card finished at 23:50 was done that day, not the next.
    expect(stageOn(task({ done_at: '2026-07-23T23:50:00Z' }), END('2026-07-23'))).toBe('done')
  })

  it('handles a card that skipped a column', () => {
    // Straight from todo to done, with no started_at, still reads as done.
    expect(stageOn(task({ done_at: '2026-07-22T09:00:00Z' }), END('2026-07-22'))).toBe('done')
  })

  it('ignores an unparseable stamp instead of throwing', () => {
    expect(stageOn(task({ done_at: 'not a date' }), END('2026-07-25'))).toBe('todo')
  })
})

describe('building the series', () => {
  it('returns nothing to draw when there are no tasks', () => {
    const history = buildFlowHistory([], NOW)

    expect(history.days).toEqual([])
    expect(history.enoughForTrend).toBe(false)
    expect(history.windowLabel).toBe('No tasks yet')
  })

  it('starts at the FIRST task, not a fixed number of days back', () => {
    // A window padded with empty days before any work existed reads as a
    // period of no progress, which is a different claim entirely.
    const history = buildFlowHistory([task({ created_at: '2026-07-26T09:00:00Z' })], NOW, 30)

    expect(history.days).toHaveLength(3)
    expect(history.days[0]!.day).toBe('2026-07-26')
    expect(history.days.at(-1)!.day).toBe('2026-07-28')
  })

  it('caps a long history at the requested window', () => {
    const history = buildFlowHistory([task({ created_at: '2020-01-01T09:00:00Z' })], NOW, 7)

    expect(history.days).toHaveLength(7)
    expect(history.windowLabel).toContain('7 days')
  })

  it('counts every task into exactly one stage per day', () => {
    const history = buildFlowHistory(
      [
        task({ code: 'SL-1', created_at: '2026-07-26T09:00:00Z', done_at: '2026-07-27T09:00:00Z' }),
        task({ code: 'SL-2', created_at: '2026-07-26T09:00:00Z' }),
      ],
      NOW,
      30,
    )

    const last = history.days.at(-1)!
    expect(last.counts).toEqual({ todo: 1, in_progress: 0, review: 0, done: 1 })
    expect(last.total).toBe(2)
  })

  it('shows the backlog growing as tasks are created', () => {
    const history = buildFlowHistory(
      [
        task({ code: 'SL-1', created_at: '2026-07-26T09:00:00Z' }),
        task({ code: 'SL-2', created_at: '2026-07-28T09:00:00Z' }),
      ],
      NOW,
      30,
    )

    expect(history.days.map((day) => day.total)).toEqual([1, 1, 2])
  })

  it('refuses a trend under five days', () => {
    const history = buildFlowHistory([task({ created_at: '2026-07-26T09:00:00Z' })], NOW, 30)

    expect(history.days).toHaveLength(3)
    expect(history.enoughForTrend).toBe(false)
  })

  it('allows a trend at five days', () => {
    const history = buildFlowHistory([task({ created_at: '2026-07-24T09:00:00Z' })], NOW, 30)

    expect(history.days).toHaveLength(5)
    expect(history.enoughForTrend).toBe(true)
  })

  it('says so when there is only one day', () => {
    const history = buildFlowHistory([task({ created_at: '2026-07-28T09:00:00Z' })], NOW, 30)

    expect(history.windowLabel).toContain('one day of history')
  })
})
