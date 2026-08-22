import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * A CANCELLED CYCLE STAYS CANCELLED — AND THE WRITER KNOWS WHEN IT DID NOT WIN.
 *
 * ── THE HOLE, AND THE GUARD THAT WAS DEFEATED BY ITS NEIGHBOUR ──────────────
 * `finishCycle` already carried `and status not in ('cancelled','failed')`, and
 * its own comment is the reason: the kill switch may have cancelled this cycle
 * while the create stage was in flight, and a cancelled week must not be
 * reported as done.
 *
 * It did not work, for two separate reasons.
 *
 * FIRST, the line above it. `loop-create.ts:155-156` is:
 *
 *     await store.setCycleStatus(cycleId, workspaceId, 'staging')
 *     await store.finishCycle(cycleId, workspaceId)
 *
 * `setCycleStatus` had NO terminal guard, so it moved a `cancelled` cycle to
 * `staging` — and `finishCycle`, one line later, then saw a status that is not
 * cancelled and reported the week. A guard is worth nothing when the statement
 * before it launders the value the guard inspects.
 *
 * SECOND, `haltForCostApproval` had no guard either, and it is the write that
 * ends `runCycleToPreview`. Press the kill switch while the plan stage is
 * waiting on a model — seconds to minutes — and the cycle comes back as
 * `awaiting_cost_approval`, approve button and all. `loop_approve_cost` checks
 * only that status, and its step 5 re-includes every brief the kill switch had
 * marked `skipped`, so the create stage then writes and charges for the week the
 * customer had just cancelled.
 *
 * The SQL knew this was needed. `20260820000400_loop_rpcs.sql:296-298` says the
 * kill switch takes `pg_advisory_xact_lock('loop_cycle:'||ws)` and calls it
 * "the same key the cycle writer takes, so a cycle cannot advance a stage while
 * this runs." The cycle writer takes no lock: a grep for `pg_advisory` across
 * apps/web and apps/jobs finds nothing. A comment asserting a guarantee the code
 * does not provide is worse than no comment, because it stops the next reader
 * looking.
 *
 * The guard here is not the lock — it is the WHERE clause, which needs no lock
 * to be correct: whichever UPDATE commits second sees the other's status.
 *
 * ── AND EVERY ONE OF THESE WRITES RETURNED `void` ────────────────────────────
 * So no caller could tell a write that landed from one the guard refused. They
 * now return whether a row moved, and the callers that make a claim check it.
 */

const state = vi.hoisted(() => ({
  /** Rows the next UPDATE reports as changed. */
  rowCount: 1,
  /** Every statement the module ran, in order. */
  sql: [] as string[],
  params: [] as unknown[][],
}))

vi.mock('server-only', () => ({}))

vi.mock('@sahoda/billing', () => ({
  loadBillingEnv: () => ({ databaseUrl: 'postgres://fake/db' }),
  createPgLedgerPort: () => ({
    pool: {
      query: (text: string, params: unknown[]) => {
        state.sql.push(text)
        state.params.push(params)
        return Promise.resolve({ rows: [], rowCount: state.rowCount })
      },
    },
  }),
}))

import { finishCycle, haltForCostApproval, setCycleStatus } from '@/lib/loop/store'

const CYCLE = 'cyc_1'
const WS = 'ws_1'

/** Every write that moves `loop_cycles.status`, with the call that drives it. */
const STATUS_WRITES = [
  { name: 'setCycleStatus', run: () => setCycleStatus(CYCLE, WS, 'staging') },
  { name: 'haltForCostApproval', run: () => haltForCostApproval(CYCLE, WS, 21) },
  { name: 'finishCycle', run: () => finishCycle(CYCLE, WS) },
] as const

beforeEach(() => {
  state.rowCount = 1
  state.sql = []
  state.params = []
})

describe.each(STATUS_WRITES)('$name', ({ run }) => {
  test('refuses to move a cycle out of a terminal status', async () => {
    await run()

    const sql = state.sql.join(' ').replace(/\s+/g, ' ')
    // The clause, not a mood. Without it the kill switch is advisory.
    expect(sql).toMatch(/status not in \('cancelled', 'failed'\)/)
  })

  test('reports that no row moved, rather than nothing at all', async () => {
    state.rowCount = 0

    // `void` was the old return type, so a refused write and a completed one
    // were the same value — and `loop-create.ts` then told the customer the
    // week was reported.
    await expect(run()).resolves.toBe(false)
  })

  test('reports that a row did move', async () => {
    state.rowCount = 1

    // The other half. A function that always returned false would satisfy the
    // assertion above and stop the Loop entirely.
    await expect(run()).resolves.toBe(true)
  })

  test('is still scoped to one cycle in one workspace', async () => {
    await run()

    // The module bypasses RLS by design (owner connection), so the WHERE clause
    // is the only tenant boundary these statements have.
    expect(state.params[0]?.slice(0, 2)).toEqual([CYCLE, WS])
    expect(state.sql[0]).toMatch(/where id = \$1 and workspace_id = \$2/)
  })
})

describe('the create stage cannot launder a cancelled cycle into a reported one', () => {
  test('setCycleStatus refuses first, so finishCycle is never handed a laundered status', async () => {
    // The exact two-line sequence from loop-create.ts:155-156, against a cycle
    // the kill switch has already cancelled.
    state.rowCount = 0

    const staged = await setCycleStatus(CYCLE, WS, 'staging')
    const reported = await finishCycle(CYCLE, WS)

    expect(staged, 'a cancelled cycle was moved to staging').toBe(false)
    expect(reported, 'a cancelled cycle was reported as done').toBe(false)
  })
})
