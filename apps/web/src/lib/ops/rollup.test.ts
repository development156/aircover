import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import type { BoardCard } from '@/lib/ops/board'
import { isRed, rollup, rollupRedIsDerived, UNPLANNED_KEY, UNPLANNED_LABEL } from '@/lib/ops/rollup'

/**
 * An annotated return type, never `as BoardCard` — SL-038 is a card about a
 * factory whose cast let four call sites pass a status the database rejects,
 * and twenty-five tests were green against a value that cannot exist.
 */
function card(over: Partial<BoardCard> & { code: string }): BoardCard {
  return {
    code: over.code,
    title: over.title ?? `Card ${over.code}`,
    detail: over.detail ?? null,
    roadmapCode: over.roadmapCode ?? null,
    assignee: over.assignee ?? 'claude',
    column: over.column ?? 'todo',
    blocked: over.blocked ?? false,
    blockedReason: over.blockedReason ?? null,
    commitSha: over.commitSha ?? null,
    prRef: over.prRef ?? null,
    qa: over.qa ?? 'none',
    ageMs: over.ageMs ?? null,
    movedBy: over.movedBy ?? 'claude',
  }
}

describe('rollup groups the board without losing a card', () => {
  it('puts every card in exactly one group', () => {
    const cards = [
      card({ code: 'SL-001', roadmapCode: 'AO1' }),
      card({ code: 'SL-002', roadmapCode: 'AO1' }),
      card({ code: 'SL-003', roadmapCode: 'AO2' }),
      card({ code: 'SL-004' }),
    ]
    const stages = rollup(cards)

    expect(stages.flatMap((stage) => stage.cards.map((c) => c.code)).sort()).toEqual([
      'SL-001',
      'SL-002',
      'SL-003',
      'SL-004',
    ])
    expect(stages.reduce((sum, stage) => sum + stage.total, 0)).toBe(cards.length)
  })

  it('files cards with no roadmap code under Found along the way, last', () => {
    const stages = rollup([card({ code: 'SL-002' }), card({ code: 'SL-001', roadmapCode: 'AO1' })])

    expect(stages.at(-1)?.key).toBe(UNPLANNED_KEY)
    expect(stages.at(-1)?.label).toBe(UNPLANNED_LABEL)
  })

  it('keeps roadmap groups in board order, not alphabetical', () => {
    const stages = rollup([
      card({ code: 'SL-001', roadmapCode: 'AO3' }),
      card({ code: 'SL-002', roadmapCode: 'AO1' }),
    ])
    expect(stages.map((stage) => stage.key)).toEqual(['AO3', 'AO1'])
  })

  it('names a group from the roadmap item title when there is one', () => {
    const stages = rollup([card({ code: 'SL-001', roadmapCode: 'AO1' })], {
      AO1: 'Foundations — ops tables, RLS, shared contracts',
    })
    expect(stages[0]!.label).toBe('Foundations — ops tables, RLS, shared contracts')
  })

  it('falls back to the code rather than rendering an empty heading', () => {
    expect(rollup([card({ code: 'SL-001', roadmapCode: 'AO9' })])[0]!.label).toBe('AO9')
  })

  it('floors the percentage, so a group with an open card never reads 100%', () => {
    const cards = Array.from({ length: 200 }, (_, i) =>
      card({ code: `SL-${i}`, roadmapCode: 'AO1', column: i === 0 ? 'todo' : 'done' }),
    )
    expect(rollup(cards)[0]!.percent).toBe(99)
  })
})

describe('THE RED RULE — nothing red may be hidden by a rollup', () => {
  it('a group containing a blocked card says so on its face', () => {
    const stages = rollup([
      card({ code: 'SL-001', roadmapCode: 'AO1' }),
      card({
        code: 'SL-002',
        roadmapCode: 'AO1',
        blocked: true,
        blockedReason: 'waiting on a key',
      }),
    ])

    expect(stages[0]!.hasRed).toBe(true)
    expect(stages[0]!.redSummary).toBe('SL-002 blocked')
  })

  it('a group containing a failing QA run says so on its face', () => {
    const stages = rollup([card({ code: 'SL-009', roadmapCode: 'AO2', qa: 'fail' })])

    expect(stages[0]!.hasRed).toBe(true)
    expect(stages[0]!.redSummary).toBe('SL-009 failing tests')
  })

  it('names both kinds of red in one sentence', () => {
    const stages = rollup([
      card({ code: 'SL-001', roadmapCode: 'AO1', blocked: true }),
      card({ code: 'SL-002', roadmapCode: 'AO1', qa: 'fail' }),
    ])
    expect(stages[0]!.redSummary).toBe('SL-001 blocked · SL-002 failing tests')
  })

  it('counts instead of listing past three, because a list of nine is not read', () => {
    const stages = rollup(
      Array.from({ length: 4 }, (_, i) =>
        card({ code: `SL-00${i}`, roadmapCode: 'AO1', blocked: true }),
      ),
    )
    expect(stages[0]!.redSummary).toBe('4 cards blocked')
  })

  it('says nothing when a group is clean — silence must mean clean', () => {
    const stages = rollup([
      card({ code: 'SL-001', roadmapCode: 'AO1', column: 'done', qa: 'pass' }),
    ])
    expect(stages[0]!.hasRed).toBe(false)
    expect(stages[0]!.redSummary).toBeNull()
  })

  it('does not treat a card that is merely unfinished as red', () => {
    // Red means blocked or failing. "Not done yet" is the normal state of most
    // of the board and must not cry wolf, or the real red stops being read.
    const stages = rollup([card({ code: 'SL-001', roadmapCode: 'AO1', column: 'in_progress' })])
    expect(stages[0]!.hasRed).toBe(false)
  })

  it('holds the derived-red invariant over the whole board', () => {
    const stages = rollup([
      card({ code: 'SL-001', roadmapCode: 'AO1' }),
      card({ code: 'SL-002', roadmapCode: 'AO1', blocked: true }),
      card({ code: 'SL-003', roadmapCode: 'AO2', qa: 'fail' }),
      card({ code: 'SL-004', column: 'done' }),
    ])
    expect(rollupRedIsDerived(stages)).toBe(true)
  })
})

/**
 * THE MUTATION CHECK the rollup was asked for: flip one real card to blocked
 * and prove the summary containing it changes. A rollup that passed every test
 * above could still be blind to a card it had already grouped.
 */
describe('flipping a real card to blocked surfaces it in its own stage summary', () => {
  const BOARD = resolve(import.meta.dirname, '../../../../../ops/state/board.json')

  function boardCards(): BoardCard[] {
    const raw = JSON.parse(readFileSync(BOARD, 'utf8')) as {
      tasks: {
        code: string
        title: string
        detail: string | null
        roadmap_code: string | null
        board_column: string
        blocked?: boolean
        blocked_reason?: string | null
      }[]
    }
    return raw.tasks.map((task) =>
      card({
        code: task.code,
        title: task.title,
        detail: task.detail,
        roadmapCode: task.roadmap_code,
        column: task.board_column as BoardCard['column'],
        blocked: task.blocked ?? false,
        blockedReason: task.blocked_reason ?? null,
      }),
    )
  }

  it('rolls the real board up into the 6–10 summaries the default view wants', () => {
    const stages = rollup(boardCards())
    expect(stages.length).toBeGreaterThanOrEqual(6)
    expect(stages.length).toBeLessThanOrEqual(10)
  })

  it('a stage that was clean reports red the moment one of its cards blocks', () => {
    const cards = boardCards()
    // A stage with no red today. AO1 is six done foundation cards.
    const target = cards.find((c) => c.roadmapCode === 'AO1')
    expect(target, 'expected an AO1 card on the real board').toBeDefined()

    const before = rollup(cards).find((stage) => stage.key === 'AO1')!
    expect(before.hasRed, 'AO1 was already red — pick another stage for this check').toBe(false)
    expect(before.redSummary).toBeNull()

    // Immutably, as the repo requires: a new card, a new array, same rollup.
    const mutated = cards.map((c) =>
      c.code === target!.code ? { ...c, blocked: true, blockedReason: 'mutation check' } : c,
    )
    const after = rollup(mutated).find((stage) => stage.key === 'AO1')!

    expect(after.hasRed).toBe(true)
    expect(after.redSummary).toBe(`${target!.code} blocked`)
    expect(after.total).toBe(before.total)
  })

  it('a stage that was clean reports red the moment one of its cards fails tests', () => {
    const cards = boardCards()
    const target = cards.find((c) => c.roadmapCode === 'AO2')!
    const before = rollup(cards).find((stage) => stage.key === 'AO2')!
    expect(before.hasRed).toBe(false)

    const mutated = cards.map((c) => (c.code === target.code ? { ...c, qa: 'fail' as const } : c))
    const after = rollup(mutated).find((stage) => stage.key === 'AO2')!

    expect(after.hasRed).toBe(true)
    expect(after.redSummary).toBe(`${target.code} failing tests`)
  })

  it('surfaces the card that is genuinely blocked on the board today', () => {
    // Not a fixture: if the real board's blocked card ever stops being visible
    // in a rollup, this fails on the next run.
    const cards = boardCards()
    const blocked = cards.filter((c) => c.blocked)
    const stages = rollup(cards)

    for (const card of blocked) {
      const stage = stages.find((s) => s.cards.some((c) => c.code === card.code))!
      expect(stage.hasRed, `${card.code} is blocked but its stage reads clean`).toBe(true)
      expect(stage.redSummary).toContain(card.code)
    }
    expect(rollupRedIsDerived(stages)).toBe(true)
  })
})

describe('isRed', () => {
  it('is red for a blocked card', () => {
    expect(isRed(card({ code: 'A', blocked: true }))).toBe(true)
  })
  it('is red for a failing card', () => {
    expect(isRed(card({ code: 'A', qa: 'fail' }))).toBe(true)
  })
  it('is not red for a card with no QA run — no verdict is not a failure', () => {
    expect(isRed(card({ code: 'A', qa: 'none' }))).toBe(false)
  })
})
