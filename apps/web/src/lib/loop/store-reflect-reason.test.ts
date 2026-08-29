import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * WRITING A COLUMN THAT MAY NOT BE THERE YET, WITHOUT STRANDING THE CYCLE.
 *
 * ── WHY THIS FALLBACK EXISTS ─────────────────────────────────────────────────
 * `20260828100000_loop_reflect_reason.sql` adds `loop_cycles.reflect_reason`,
 * and migrations in this project are applied by hand rather than by a deploy.
 * `setCycleStatus` is the statement that moves a cycle from one stage to the
 * next, so naming a column that is not there yet would not cost a sentence on a
 * screen — it would raise 42703 and strand EVERY cycle in the stage it was in,
 * on a paid path, until somebody ran the migration.
 *
 * ── AND WHY THE FALLBACK MUST BE NARROW ──────────────────────────────────────
 * A `catch` that retried on anything would swallow a permissions failure, a
 * dead connection and a constraint violation, and report the cycle as moved.
 * That is the shape that turns an outage into a silent wrong answer, so the
 * code matches ONE error and the last test here is what holds it to that.
 */

const UNDEFINED_COLUMN = '42703'

const state = vi.hoisted(() => ({
  sql: [] as string[],
  /** Error the NEXT query throws, or null to answer normally. */
  failNextWith: null as { code: string } | null,
}))

vi.mock('server-only', () => ({}))

vi.mock('@sahoda/billing', () => ({
  loadBillingEnv: () => ({ databaseUrl: 'postgres://fake/db' }),
  createPgLedgerPort: () => ({
    pool: {
      query: (text: string) => {
        state.sql.push(text)
        const fail = state.failNextWith
        state.failNextWith = null
        if (fail) return Promise.reject(Object.assign(new Error('boom'), fail))
        return Promise.resolve({ rows: [], rowCount: 1 })
      },
    },
  }),
}))

import { setCycleStatus } from '@/lib/loop/store'

const CYCLE = 'cyc_1'
const WS = 'ws_1'

beforeEach(() => {
  state.sql = []
  state.failNextWith = null
})

describe('setCycleStatus and reflect_reason', () => {
  it('writes the reason when the column is there', async () => {
    const moved = await setCycleStatus(CYCLE, WS, 'planning', { reflectReason: 'too_few_days' })
    expect(moved).toBe(true)
    expect(state.sql).toHaveLength(1)
    expect(state.sql[0]).toContain('reflect_reason')
  })

  /**
   * The whole point. One statement fails on the missing column, a second runs
   * without it, and the cycle still moves — so an unapplied migration costs the
   * sentence and never the stage.
   */
  it('still moves the cycle when the column is not there yet', async () => {
    state.failNextWith = { code: UNDEFINED_COLUMN }
    const moved = await setCycleStatus(CYCLE, WS, 'planning', { reflectReason: 'too_few_days' })
    expect(moved).toBe(true)
    expect(state.sql).toHaveLength(2)
    expect(state.sql[0]).toContain('reflect_reason')
    expect(state.sql[1]).not.toContain('reflect_reason')
  })

  /** The retry keeps the terminal guard. A fallback that dropped it would let
   * a cancelled cycle advance, which is the defect store-terminal-guard.test.ts
   * exists for — reintroduced through the back door. */
  it('keeps the terminal-status guard on the fallback statement', async () => {
    state.failNextWith = { code: UNDEFINED_COLUMN }
    await setCycleStatus(CYCLE, WS, 'planning', { reflectReason: 'no_history' })
    expect(state.sql[1]).toContain("status not in ('cancelled', 'failed')")
  })

  /**
   * Anything that is NOT a missing column must propagate. A catch-all here
   * would report a cycle as moved when the database refused the write, which is
   * an outage rendered as a working product.
   */
  it('does not swallow any other database error', async () => {
    state.failNextWith = { code: '42501' } // insufficient_privilege
    await expect(
      setCycleStatus(CYCLE, WS, 'planning', { reflectReason: 'no_history' }),
    ).rejects.toThrow('boom')
    expect(state.sql).toHaveLength(1)
  })
})
