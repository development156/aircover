import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { OpsQaRun, OpsTask } from '@sahoda/shared'

import { TECHNICAL_MARKER } from '@/lib/ops/card-copy'
import { cannotProve, RECORDED_UNPROVEN, unrunSuites } from '@/lib/ops/cannot-prove'
import { blockedNow, shippedThisWeek, whatsNext } from '@/lib/ops/hero'
import { GATE_SUITES, type GateSuite } from '@/lib/ops/read'
import { WAITING_ON } from '@/lib/ops/waiting'

const NOW = new Date('2026-08-01T12:00:00.000Z')
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()

function task(over: Partial<OpsTask> & { code: string }): OpsTask {
  return {
    id: '00000000-0000-4000-8000-000000000000',
    code: over.code,
    title: over.title ?? `Title ${over.code}`,
    detail: over.detail ?? null,
    doc_ref: null,
    roadmap_code: over.roadmap_code ?? null,
    board_column: over.board_column ?? 'todo',
    assignee: over.assignee ?? 'claude',
    blocked: over.blocked ?? false,
    blocked_reason: over.blocked_reason ?? null,
    archived: false,
    pr_ref: null,
    commit_sha: over.commit_sha ?? null,
    started_at: over.started_at ?? null,
    review_at: over.review_at ?? null,
    done_at: over.done_at ?? null,
    moved_by: over.moved_by ?? 'claude',
    sort: over.sort ?? 10,
    created_at: ago(30),
    updated_at: ago(1),
  }
}

describe('shippedThisWeek', () => {
  it('lists cards finished inside the window, newest first', () => {
    const shipped = shippedThisWeek(
      [
        task({ code: 'SL-001', board_column: 'done', done_at: ago(5) }),
        task({ code: 'SL-002', board_column: 'done', done_at: ago(1) }),
        task({ code: 'SL-003', board_column: 'done', done_at: ago(20) }),
      ],
      NOW,
    )
    expect(shipped.map((c) => c.code)).toEqual(['SL-002', 'SL-001'])
  })

  it('does NOT announce a reopened card as shipped, even with a stale done date', () => {
    // SL-036: a card moved backward keeps a done_at it no longer deserves. The
    // column is the current fact; the stamp is the stale one.
    const shipped = shippedThisWeek(
      [task({ code: 'SL-028', board_column: 'review', done_at: ago(2) })],
      NOW,
    )
    expect(shipped).toEqual([])
  })

  it('ignores a card in Done with no finish date rather than guessing one', () => {
    expect(shippedThisWeek([task({ code: 'SL-001', board_column: 'done' })], NOW)).toEqual([])
  })

  it('shows the plain half of the card, never the technical half', () => {
    const shipped = shippedThisWeek(
      [
        task({
          code: 'SL-001',
          title: 'Fallback title',
          detail: `It locks the console. Second sentence.${TECHNICAL_MARKER}middleware.ts:44`,
          board_column: 'done',
          done_at: ago(1),
        }),
      ],
      NOW,
    )
    expect(shipped[0]!.headline).toBe('It locks the console.')
  })

  it('falls back to the title when a card has no detail', () => {
    const shipped = shippedThisWeek(
      [task({ code: 'SL-001', title: 'A plain title', board_column: 'done', done_at: ago(1) })],
      NOW,
    )
    expect(shipped[0]!.headline).toBe('A plain title')
  })
})

describe('blockedNow', () => {
  it('keeps a blocked card that has no reason, rather than hiding it', () => {
    // Dropping it would make the unexplained case invisible — the opposite of
    // what a blocker list is for.
    const blocked = blockedNow([task({ code: 'SL-040', blocked: true })])
    expect(blocked).toHaveLength(1)
    expect(blocked[0]!.reason).toBeNull()
  })

  it('carries the reason when there is one', () => {
    const blocked = blockedNow([
      task({ code: 'SL-040', blocked: true, blocked_reason: 'waiting on a login' }),
    ])
    expect(blocked[0]!.reason).toBe('waiting on a login')
  })
})

describe('whatsNext', () => {
  it('puts work in flight ahead of the queue', () => {
    const { next } = whatsNext([
      task({ code: 'SL-002', board_column: 'todo' }),
      task({ code: 'SL-001', board_column: 'in_progress' }),
    ])
    expect(next.map((c) => c.code)).toEqual(['SL-001', 'SL-002'])
  })

  it('leaves blocked cards out — they are on the blocked list, not the next list', () => {
    const { next } = whatsNext([task({ code: 'SL-040', board_column: 'todo', blocked: true })])
    expect(next).toEqual([])
  })

  it('admits its cap instead of quietly truncating', () => {
    const many = Array.from({ length: 10 }, (_, i) => task({ code: `SL-0${i}` }))
    const { next, remaining } = whatsNext(many, 4)
    expect(next).toHaveLength(4)
    expect(remaining).toBe(6)
  })
})

describe('what we cannot yet prove', () => {
  function gates(run: readonly GateSuite[]): Record<GateSuite, OpsQaRun | null> {
    const qaRun = {
      id: '00000000-0000-4000-8000-000000000001',
      task_code: null,
      kind: 'auto',
      suite: 'unit',
      status: 'pass',
      summary_plain: null,
      details: null,
      actor: 'claude',
      started_at: ago(1),
      finished_at: ago(1),
      created_at: ago(1),
      updated_at: ago(1),
    } as OpsQaRun

    return Object.fromEntries(
      GATE_SUITES.map((suite) => [suite, run.includes(suite) ? qaRun : null]),
    ) as Record<GateSuite, OpsQaRun | null>
  }

  it('names a suite that has never run — an absence is not a pass', () => {
    const claims = unrunSuites(gates(['typecheck', 'lint', 'unit']))
    expect(claims.map((c) => c.key)).toEqual(['unrun:rls', 'unrun:smoke'])
    expect(claims[0]!.what).toContain('database access-control tests')
  })

  it('says nothing derived once every suite has run', () => {
    expect(unrunSuites(gates([...GATE_SUITES]))).toEqual([])
  })

  it('treats an unreadable test record as its own gap, never as an empty one', () => {
    const claims = cannotProve(null)
    expect(claims.some((c) => c.key === 'gates-unreadable')).toBe(true)
    // And it does not swallow the recorded half on the way.
    expect(claims.length).toBe(1 + RECORDED_UNPROVEN.length)
  })

  it('puts the live derived gaps ahead of the transcribed ones', () => {
    const claims = cannotProve(gates(['typecheck']))
    expect(claims[0]!.source).toBe('derived')
    expect(claims.at(-1)!.source).toBe('recorded')
  })

  it('labels every claim with where it came from, so none reads as a measurement', () => {
    for (const claim of cannotProve(gates([]))) {
      expect(claim.from.length).toBeGreaterThan(0)
      expect(['derived', 'recorded']).toContain(claim.source)
    }
  })
})

describe('who is waiting on whom', () => {
  const BOARD = resolve(import.meta.dirname, '../../../../../ops/state/board.json')

  it('names a card that actually exists on the board', () => {
    // A recorded list rots. This is the half a machine can check: an entry
    // pointing at a card nobody can find is a ghost, and it fails here.
    const board = JSON.parse(readFileSync(BOARD, 'utf8')) as { tasks: { code: string }[] }
    const codes = new Set(board.tasks.map((t) => t.code))

    const ghosts = WAITING_ON.filter((entry) => !codes.has(entry.code)).map((e) => e.code)
    expect(ghosts, 'waiting-on entries naming a card that is not on the board').toEqual([])
  })

  it('names a person or a decision, never "the team" or "someone"', () => {
    for (const entry of WAITING_ON) {
      expect(entry.who).not.toMatch(/\b(someone|somebody|the team|TBD)\b/i)
      expect(entry.who.trim().length).toBeGreaterThan(0)
    }
  })

  it('gives every entry one concrete next action and a date', () => {
    for (const entry of WAITING_ON) {
      expect(entry.action.trim().length).toBeGreaterThan(0)
      expect(entry.since).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})
