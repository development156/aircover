import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * TWO THINGS THAT ARE FINE AT ONE WORKSPACE AND NOT AT FIFTY.
 *
 * ── ONE POOL, NOT ONE PER WORKSPACE ──────────────────────────────────────────
 * `createPgLedgerPort` is `new Pool({ max: 10 })` every time it is called, and it
 * was called once by the tick AND once more inside `planOneWorkspace` — per
 * workspace, in a loop, never closed. At fifty workspaces that is fifty-one pools
 * and up to 510 connections opened by one scheduled request and held until the
 * function is torn down. A long run holding pools is how a cron takes a database
 * down.
 *
 * ── A TICK THAT CANNOT FINISH MUST SAY SO ────────────────────────────────────
 * One cycle is a paid model call measured at 14 seconds and the cap was 40
 * workspaces, against a `maxDuration` that did not exist (so: 10 seconds). Even
 * at the platform ceiling of 300s, 40 × 14s does not fit. Being killed mid-loop
 * reports the unreached workspaces as NEITHER planned NOR deferred, which reads
 * as "everyone was planned".
 *
 * ── THE FIRST VERSION OF THIS FILE COULD NOT SEE THE POOL DEFECT ─────────────
 * It drove workspaces that all REFUSED, so `planOneWorkspace` — the function that
 * held the extra pool — was never entered. Restoring the defect left the suite
 * GREEN, which is the same blind spot as the code it was guarding: a fixture
 * where the bug cannot happen proves nothing about the bug.
 *
 * So the pool count is now taken with a workspace that is ELIGIBLE and goes all
 * the way through planning. The store and the mesh are stubbed, which is what
 * lets the paid path run without a database or a model.
 */

const pool = { query: vi.fn() }
const close = vi.fn(async () => {})
const createPgLedgerPort = vi.fn(() => ({ pool, close }))

vi.mock('@sahoda/billing', () => ({
  createPgLedgerPort,
  createWithCredits: () => async () => ({ ok: true, data: { count: 0 } }),
  loadBillingEnv: () => ({ databaseUrl: 'postgres://stub/stub' }),
}))
vi.mock('@sahoda/mesh', () => ({
  createMesh: () => ({ runTask: vi.fn() }),
  planWeekTask: { def: {} },
}))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))
vi.mock('@/lib/loop/store', () => ({
  openCycle: vi.fn(async () => ({ cycle: { id: 'cyc-1' }, created: true })),
  readObservations: vi.fn(async () => []),
  proposeLearning: vi.fn(async () => {}),
  setCycleStatus: vi.fn(async () => true),
  writeBriefs: vi.fn(async () => []),
  readBriefs: vi.fn(async () => []),
  haltForCostApproval: vi.fn(async () => true),
  addSpend: vi.fn(async () => true),
}))

const { runScheduledLoopCycles } = await import('./run-loop')

/** N workspaces that all refuse, so the tick reaches no paid work. */
function rowsOf(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    workspace_id: `ws-${i}`,
    paused: null, // never enabled — refused before anything is written
    weekly_budget_credits: null,
    available_credits: '0',
    open_cycle_id: null,
    open_cycle_status: null,
    connections: [],
    dial: [],
  }))
}

/** N workspaces that are all ELIGIBLE, so the paid path is entered for each. */
function eligibleRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    workspace_id: `ws-${i}`,
    paused: false,
    weekly_budget_credits: 150,
    available_credits: '5000',
    open_cycle_id: null,
    open_cycle_status: null,
    connections: [{ platform: 'instagram', status: 'active' }],
    dial: [{ channel: 'instagram', level: 1 }],
  }))
}

beforeEach(() => {
  createPgLedgerPort.mockClear()
  close.mockClear()
  pool.query.mockReset()
})

describe('one scheduled tick, at a scale this product will reach', () => {
  it('opens ONE pool for fifty workspaces, not fifty-one', async () => {
    pool.query.mockResolvedValue({ rows: rowsOf(50) })

    const result = await runScheduledLoopCycles(new Date('2026-08-23T20:00:00Z'))

    expect(createPgLedgerPort).toHaveBeenCalledTimes(1)
    expect(result.outcomes).toHaveLength(40) // MAX_WORKSPACES_PER_TICK
  })

  it('opens ONE pool for twenty workspaces that are all PLANNED', async () => {
    // The test that matters: these workspaces reach `planOneWorkspace`, which is
    // where the second pool used to be made. Twenty of them means twenty-one
    // pools under the defect, and one under the fix.
    pool.query.mockResolvedValue({ rows: eligibleRows(20) })

    const result = await runScheduledLoopCycles(new Date('2026-08-23T20:00:00Z'))

    expect(result.eligible).toBe(20)
    expect(createPgLedgerPort).toHaveBeenCalledTimes(1)
  })

  it('closes the pool it opened, even though every workspace refused', async () => {
    pool.query.mockResolvedValue({ rows: rowsOf(3) })
    await runScheduledLoopCycles(new Date('2026-08-23T20:00:00Z'))
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('closes the pool when the query itself throws', async () => {
    pool.query.mockRejectedValue(new Error('connection refused'))
    await expect(runScheduledLoopCycles(new Date('2026-08-23T20:00:00Z'))).rejects.toThrow()
    // The `finally` is the whole point: a tick that fails still gives back its
    // connections, or a broken database becomes a leaking one.
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('counts workspaces it ran out of time for, rather than dropping them', async () => {
    pool.query.mockResolvedValue({ rows: rowsOf(30) })

    // A clock already past the deadline: nothing may be started.
    const result = await runScheduledLoopCycles(new Date('2026-08-23T20:00:00Z'), {
      deadline: 1_000,
      monotonicNow: () => 2_000,
    })

    expect(result.outcomes).toHaveLength(0)
    expect(result.deferred).toBe(30)
    expect(result.planned).toBe(0)
  })

  it('stops partway through and reports exactly what it did not reach', async () => {
    pool.query.mockResolvedValue({ rows: rowsOf(30) })

    // Time passes on every read; the deadline lands after ten workspaces.
    let tick = 0
    const result = await runScheduledLoopCycles(new Date('2026-08-23T20:00:00Z'), {
      deadline: 10,
      monotonicNow: () => tick++,
    })

    expect(result.outcomes).toHaveLength(10)
    expect(result.deferred).toBe(20)
    // Nothing is lost: everything looked at is either an outcome or deferred.
    expect(result.outcomes.length + result.deferred).toBe(30)
  })

  it('gives every refusal a sentence, not a boolean', async () => {
    pool.query.mockResolvedValue({ rows: rowsOf(3) })
    const result = await runScheduledLoopCycles(new Date('2026-08-23T20:00:00Z'))
    for (const outcome of result.outcomes) {
      expect(outcome.outcome).toBe('never_enabled')
      expect(outcome.message).toBe('Turn the Loop on and Sahoda will plan your week every Sunday.')
    }
  })
})
