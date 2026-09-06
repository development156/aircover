import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * TWO WAYS THE SUNDAY TICK USED TO SAY SOMETHING THAT WAS NOT SO.
 *
 * ── A REFUSED CHARGE REACHED NOBODY ──────────────────────────────────────────
 * `createWithCredits(ledger)` was built without `onError`. The wrapper hands
 * the raw cause to that hook and deliberately keeps it OFF the returned result,
 * so a ledger that refused, a hold that could not be placed, a model that
 * threw: every one of them became `{ ok: false }` and a `failed` outcome with
 * no cause anywhere. The manual path (`actions/loop-cycle.ts`) reports through
 * `reportPaidActionFailure`; the cron, which runs with nobody watching, is the
 * path that most needs to.
 *
 * ── `planned` AND 20 CREDITS FOR A CYCLE THAT WAS STOPPED ────────────────────
 * `haltForCostApproval` returns false when the cycle reached a terminal status
 * before the halt could be written: a person pressed Stop the Loop, or the
 * kill switch fired, between the plan and the preview. The cron ignored the
 * boolean, reported `planned` and added the orchestration fee to
 * `spent_credits` of a cycle that was cancelled.
 *
 * The store, the mesh and the ledger are stubbed the way
 * `run-loop-resources.test.ts` stubs them, for the same reason: this is a test
 * of what the cron DOES with an answer, not of the SQL behind it.
 */

const pool = { query: vi.fn() }
const close = vi.fn(async () => {})
const createPgLedgerPort = vi.fn(() => ({ pool, close }))

/** What the next `withCredits` call answers, and the cause it reports first. */
let chargeAnswer: { ok: true; data: { count: number } } | { ok: false; error: unknown } = {
  ok: true,
  data: { count: 1 },
}
const chargeCause = new Error('ledger refused the hold')

const createWithCredits = vi.fn(
  (_port: unknown, deps?: { onError?: (cause: unknown, traceId: string) => void }) => async () => {
    if (!chargeAnswer.ok) deps?.onError?.(chargeCause, 'trace-1')
    return chargeAnswer
  },
)

vi.mock('@sahoda/billing', () => ({
  createPgLedgerPort,
  createWithCredits,
  loadBillingEnv: () => ({ databaseUrl: 'postgres://stub/stub' }),
}))
vi.mock('@sahoda/mesh', () => ({
  createMesh: () => ({ runTask: vi.fn() }),
  planWeekTask: { def: {} },
}))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))
vi.mock('@/lib/actions/paid-failure', () => ({ reportPaidActionFailure: vi.fn() }))
vi.mock('@/lib/loop/store', () => ({
  openCycle: vi.fn(async () => ({ cycle: { id: 'cyc-1' }, created: true })),
  readObservations: vi.fn(async () => []),
  proposeLearning: vi.fn(async () => {}),
  setCycleStatus: vi.fn(async () => true),
  writeBriefs: vi.fn(async () => []),
  readBriefs: vi.fn(async () => []),
  haltForCostApproval: vi.fn(async () => true),
  addSpend: vi.fn(async () => {}),
}))

import { reportPaidActionFailure } from '@/lib/actions/paid-failure'
import { reportServerError } from '@/lib/observability/report'
import * as store from '@/lib/loop/store'

const { runScheduledLoopCycles } = await import('./run-loop')

/** One workspace that is eligible all the way to the paid step. */
const ELIGIBLE = [
  {
    workspace_id: 'ws-0',
    paused: false,
    weekly_budget_credits: 150,
    available_credits: '5000',
    open_cycle_id: null,
    open_cycle_status: null,
    connections: [{ platform: 'instagram', status: 'active' }],
    dial: [{ channel: 'instagram', level: 1 }],
    brain_payload: { field_meta: {} },
    total_eligible: 1,
  },
]

const SUNDAY = new Date('2026-08-23T20:00:00Z')

beforeEach(() => {
  vi.clearAllMocks()
  pool.query.mockResolvedValue({ rows: ELIGIBLE })
  chargeAnswer = { ok: true, data: { count: 1 } }
  vi.mocked(store.haltForCostApproval).mockResolvedValue(true)
})

describe('a refused charge is reported, not swallowed', () => {
  it('hands the cause to the same paid-failure report the manual path uses', async () => {
    chargeAnswer = { ok: false, error: { code: 'LEDGER_UNAVAILABLE' } }

    const result = await runScheduledLoopCycles(SUNDAY)

    expect(result.outcomes[0]?.outcome).toBe('failed')
    expect(reportPaidActionFailure).toHaveBeenCalledWith(expect.stringMatching(/loop/), chargeCause)
  })

  it('and to the error tracker, tagged with the workspace so one tenant is visible', async () => {
    chargeAnswer = { ok: false, error: { code: 'LEDGER_UNAVAILABLE' } }

    await runScheduledLoopCycles(SUNDAY)

    expect(reportServerError).toHaveBeenCalledWith(
      chargeCause,
      expect.objectContaining({ workspaceId: 'ws-0', action: expect.stringMatching(/loop/) }),
    )
  })

  it('reports nothing when the charge succeeds', async () => {
    await runScheduledLoopCycles(SUNDAY)
    expect(reportPaidActionFailure).not.toHaveBeenCalled()
    expect(reportServerError).not.toHaveBeenCalled()
  })
})

describe('a cycle stopped between the plan and the preview', () => {
  it('is reported as cancelled, not planned, and the orchestration fee is NOT added', async () => {
    vi.mocked(store.haltForCostApproval).mockResolvedValue(false)

    const result = await runScheduledLoopCycles(SUNDAY)

    expect(result.planned).toBe(0)
    expect(result.outcomes[0]?.outcome).toBe('cancelled')
    expect(store.addSpend).not.toHaveBeenCalled()
  })

  it('a cycle that DID halt for approval is planned and carries the fee', async () => {
    const result = await runScheduledLoopCycles(SUNDAY)

    expect(result.planned).toBe(1)
    expect(result.outcomes[0]?.outcome).toBe('planned')
    expect(store.addSpend).toHaveBeenCalledTimes(1)
  })
})

describe('the deferred count is the whole remainder, not one', () => {
  it('reads the total the query carries rather than the cap plus one', async () => {
    // 45 eligible, cap 40: the query returns 40 rows each carrying the total.
    const rows = Array.from({ length: 40 }, (_, i) => ({
      ...ELIGIBLE[0],
      workspace_id: `ws-${i}`,
      total_eligible: 45,
    }))
    pool.query.mockResolvedValue({ rows })

    const result = await runScheduledLoopCycles(SUNDAY)

    expect(result.outcomes).toHaveLength(40)
    expect(result.deferred).toBe(5)
  })
})
