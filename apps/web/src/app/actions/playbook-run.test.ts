import { describe, it, expect, vi, beforeEach } from 'vitest'
import { creditCost } from '@sahoda/shared'

/**
 * THE EXECUTOR'S GATE, AND THE TWO BRANCHES ONLY IT DECIDES.
 *
 * The SQL suite proves the database refuses an unapproved run. This proves the
 * EXECUTOR does — which is a different claim, because `executeRun` writes over an
 * owner connection and could set the status itself. The row policies protect the
 * screen; `readApprovedRunForExecute` protects this.
 *
 * ── WHAT IS MOCKED, AND WHY THAT IS HONEST HERE ─────────────────────────────
 * Everything with I/O. What is left is the decision sequence, which is the whole
 * subject: does a charge get ATTEMPTED at all, and in what order. A test that let
 * the real ledger through would be measuring the ledger, which has its own suite,
 * and it would still tell us nothing about whether the gate was consulted first.
 */

const DRAFT = creditCost('post_variants')
const RUN = creditCost('playbook_run')

/** Real UUIDs: `PostInsertSchema` parses the row this action inserts, and it
 *  refuses a workspace id that is not one — as it should. */
const WS = '11111111-1111-4111-8111-111111111111'
const POST = '22222222-2222-4222-8222-222222222222'

/**
 * THE WRAPPER'S TWO SHAPES, WRITTEN OUT RATHER THAN INFERRED.
 *
 * A factory that only ever returns the happy path types `withCredits` as always
 * `{ ok: true }`, and every failure-branch test below becomes a type error. That
 * is how a suite ends up exercising only the branch that works — `pnpm gate`
 * caught it here as seven `TS2322`s, which is the friendly version.
 */
type ChargeResult = { ok: true; data: unknown } | { ok: false; error: { code: string } }
type ChargeFn = (opts: unknown, fn: (ctx: unknown) => Promise<unknown>) => Promise<ChargeResult>
type InsertFn = (row: Record<string, unknown>) => {
  select: () => { single: () => Promise<{ data: { id: string } | null; error: unknown }> }
}

const h = vi.hoisted(() => {
  const store = {
    readApprovedRunForExecute: vi.fn(),
    readItems: vi.fn(),
    readPlaybook: vi.fn(),
    openRun: vi.fn(),
    writeItems: vi.fn(),
    haltForCostApproval: vi.fn(),
    finishNothingToDo: vi.fn(),
    markRan: vi.fn(),
    linkItemToPost: vi.fn(),
    addSpend: vi.fn(),
    setRunStatus: vi.fn(),
    finishRun: vi.fn(),
    writeVariants: vi.fn(),
    availableCredits: vi.fn<() => Promise<number | null>>(async () => 0),
  }
  const withCredits = vi.fn<ChargeFn>(async (_opts, fn) => ({
    ok: true,
    data: await fn({ actionType: 'post_variants', creditsCharged: 0 }),
  }))
  const insert = vi.fn<InsertFn>(() => ({
    select: () => ({
      single: async () => ({ data: { id: '22222222-2222-4222-8222-222222222222' }, error: null }),
    }),
  }))
  return { store, withCredits, insert }
})

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_a' }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))
vi.mock('@/lib/workspaces', () => ({
  workspaceForWrite: async () => ({
    ok: true,
    workspace: { id: '11111111-1111-4111-8111-111111111111' },
  }),
}))
vi.mock('@/lib/playbooks/store', () => h.store)
vi.mock('@sahoda/billing', () => ({
  createPgLedgerPort: () => ({}),
  createWithCredits: () => h.withCredits,
  loadBillingEnv: () => ({ databaseUrl: 'postgres://stub' }),
}))
vi.mock('@sahoda/mesh', () => ({
  createMesh: () => ({
    runTask: async () => ({ ok: true, data: { variants: [{ channel: 'instagram', body: 'v' }] } }),
  }),
  contentVariantsTask: { def: {} },
}))
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: () => ({
      insert: h.insert,
      select: () => ({ eq: async () => ({ data: [{ channel: 'instagram', level: LEVEL }] }) }),
    }),
  }),
}))

/** The dial the mocked Supabase client hands back. Set per test. */
let LEVEL = 1

import { executeRun, startRun } from './playbook-run'

const item = (id: string) => ({
  id,
  workspace_id: WS,
  run_id: 'run-1',
  position: 1,
  title: 'Republic Day',
  body: 'a plain first draft',
  channels: ['instagram'] as unknown as never,
  suggested_slot: '2026-01-25T00:00:00.000Z',
  estimated_credits: DRAFT,
  included: true,
  post_id: null,
  outcome: 'proposed',
})

const APPROVED_RUN = {
  id: 'run-1',
  workspace_id: WS,
  recipe_key: 'festival_calendar',
  approved_credits: DRAFT,
}

beforeEach(() => {
  vi.clearAllMocks()
  LEVEL = 1
  h.store.readItems.mockResolvedValue([item('i1')])
  h.store.availableCredits.mockResolvedValue(0)
  h.withCredits.mockImplementation(async (_opts, fn) => ({
    ok: true,
    data: await fn({ actionType: 'post_variants', creditsCharged: DRAFT }),
  }))
})

describe('executeRun', () => {
  it('REFUSES an unapproved run, and attempts no charge at all', async () => {
    // The gate. `readApprovedRunForExecute` carries `cost_approved_at is not
    // null` in its WHERE clause, so null here means the row was not approved.
    h.store.readApprovedRunForExecute.mockResolvedValue(null)

    const out = await executeRun('run-1')

    expect(out.ok).toBe(false)
    expect(out.message).toMatch(/nothing has been spent/i)
    // The claim that matters is not the sentence — it is that the wrapper which
    // takes the HOLD was never reached.
    expect(h.withCredits).not.toHaveBeenCalled()
    expect(h.insert).not.toHaveBeenCalled()
    expect(h.store.setRunStatus).not.toHaveBeenCalled()
  })

  it('takes the per-run charge BEFORE any draft, so a broke run fails cheaply', async () => {
    h.store.readApprovedRunForExecute.mockResolvedValue(APPROVED_RUN)
    await executeRun('run-1')
    const actions = h.withCredits.mock.calls.map((c) => (c[0] as { action: string }).action)
    // A run that charged per item and only then failed to take its own fee would
    // have spent the expensive half and skipped the cheap one.
    expect(actions[0]).toBe('playbook_run')
    expect(actions[1]).toBe('post_variants')
  })

  it('writes nothing and charges nothing per item at L0', async () => {
    LEVEL = 0
    h.store.readApprovedRunForExecute.mockResolvedValue(APPROVED_RUN)

    const out = await executeRun('run-1')

    expect(out.ok).toBe(true)
    expect(out.suggested).toBe(1)
    expect(out.drafted).toBe(0)
    // The item IS the suggestion and it already exists. One charge — the run's —
    // and no post.
    expect(h.withCredits).toHaveBeenCalledTimes(1)
    expect(h.insert).not.toHaveBeenCalled()
    expect(h.store.linkItemToPost).toHaveBeenCalledWith('i1', WS, null, 'suggested')
    expect(out.spent).toBe(RUN)
  })

  it('leaves an L1 draft in the Planner with no schedule on it', async () => {
    LEVEL = 1
    h.store.readApprovedRunForExecute.mockResolvedValue(APPROVED_RUN)

    const out = await executeRun('run-1')

    expect(out.drafted).toBe(1)
    const row = h.insert.mock.calls[0]![0]
    expect(row.status).toBe('draft')
    expect(row.scheduled_at).toBeNull()
    expect(row.origin).toBe('playbook')
    expect(h.store.linkItemToPost).toHaveBeenCalledWith('i1', WS, POST, 'drafted')
    expect(out.spent).toBe(RUN + DRAFT)
  })

  it('schedules an L2 draft as approved — and STILL does not publish', async () => {
    LEVEL = 2
    h.store.readApprovedRunForExecute.mockResolvedValue(APPROVED_RUN)

    await executeRun('run-1')

    const row = h.insert.mock.calls[0]![0]
    // `approved` is where the dispatcher would pick it up, and the dispatcher is
    // behind its own flag. There is no L3 branch anywhere in this function,
    // because L3 cannot be stored — and that absence is what makes an unattended
    // publish unreachable from here.
    expect(row.status).toBe('approved')
    expect(row.scheduled_at).toBe('2026-01-25T00:00:00.000Z')
    expect(h.store.linkItemToPost).toHaveBeenCalledWith('i1', WS, POST, 'awaiting_approval')
  })

  it('marks an item failed and charges nothing for it when the model call fails', async () => {
    h.store.readApprovedRunForExecute.mockResolvedValue(APPROVED_RUN)
    h.withCredits
      .mockImplementationOnce(async (_o, fn) => ({ ok: true, data: await fn({}) }))
      .mockImplementationOnce(async () => ({ ok: false, error: { code: 'PROVIDER_ERROR' } }))

    const out = await executeRun('run-1')

    expect(out.ok).toBe(true)
    expect(out.drafted).toBe(0)
    // Users never pay for failures: the run's own charge stands, the item's does
    // not, and the item says so rather than disappearing.
    expect(out.spent).toBe(RUN)
    expect(h.store.linkItemToPost).toHaveBeenCalledWith('i1', WS, null, 'failed')
  })

  it('does NOT blame the wallet when the ledger write itself failed', async () => {
    // MEASURED 2026-08-22: this branch used to render the shortfall sentence for
    // EVERY charge failure, so a pooler hiccup produced "This run needs 8 credits
    // and your workspace has 100 credits" — a sentence that contradicts itself
    // and blames the customer for our outage.
    //
    // The test that missed it set `error.code` and the code never read it, so the
    // fixture LOOKED discriminating while nothing discriminated. This one changes
    // only that field, which is the mutation the old test could not feel.
    h.store.readApprovedRunForExecute.mockResolvedValue(APPROVED_RUN)
    h.store.availableCredits.mockResolvedValue(100)
    h.withCredits.mockImplementation(async () => ({
      ok: false,
      error: { code: 'PROVIDER_ERROR' },
    }))

    const out = await executeRun('run-1')

    expect(out.ok).toBe(false)
    expect(out.message).toMatch(/Nothing was charged\./)
    // The claim: no balance is quoted, because none was consulted.
    expect(out.message).not.toMatch(/\d/)
    expect(h.store.availableCredits).not.toHaveBeenCalled()
    expect(h.store.setRunStatus).toHaveBeenCalledWith('run-1', WS, 'failed', 'CHARGE_FAILED')
  })

  it('says the balance is UNREADABLE rather than calling it zero', async () => {
    // A balance that cannot be read is not a balance of none. Collapsing null to
    // 0 would tell a funded customer they are broke.
    h.store.readApprovedRunForExecute.mockResolvedValue(APPROVED_RUN)
    h.store.availableCredits.mockResolvedValue(null)
    h.withCredits.mockImplementation(async () => ({
      ok: false,
      error: { code: 'CREDIT_INSUFFICIENT' },
    }))

    const out = await executeRun('run-1')

    expect(out.message).toMatch(/could not read your balance/i)
    expect(out.message).not.toMatch(/has 0 credits/)
    expect(out.message).toMatch(/Nothing was charged\./)
  })

  it('STOPS when the credits run out partway, rather than finishing "completed"', async () => {
    // Continuing would take one futile HOLD per remaining item and then file the
    // run beside the ones that worked — a run that wrote nothing, reported as a
    // success.
    h.store.readApprovedRunForExecute.mockResolvedValue(APPROVED_RUN)
    h.store.readItems.mockResolvedValue([item('i1'), item('i2')])
    h.store.availableCredits.mockResolvedValue(1)
    h.withCredits
      .mockImplementationOnce(async (_o, fn) => ({ ok: true, data: await fn({}) }))
      .mockImplementationOnce(async () => ({ ok: false, error: { code: 'CREDIT_INSUFFICIENT' } }))

    const out = await executeRun('run-1')

    expect(out.ok).toBe(false)
    expect(h.store.finishRun).not.toHaveBeenCalled()
    expect(h.store.setRunStatus).toHaveBeenCalledWith('run-1', WS, 'failed', 'CREDITS')
    // Only two charges attempted — the run's and the first item's — not one per
    // remaining item.
    expect(h.withCredits).toHaveBeenCalledTimes(2)
  })

  it('refuses honestly at zero balance, naming both numbers', async () => {
    h.store.readApprovedRunForExecute.mockResolvedValue(APPROVED_RUN)
    h.store.availableCredits.mockResolvedValue(0)
    h.withCredits.mockImplementation(async () => ({
      ok: false,
      error: { code: 'CREDIT_INSUFFICIENT' },
    }))

    const out = await executeRun('run-1')

    expect(out.ok).toBe(false)
    expect(out.message).toMatch(new RegExp(`needs ${DRAFT + RUN} credits`))
    expect(out.message).toMatch(/has 0 credits/)
    expect(out.message).toMatch(/Nothing was charged\./)
    expect(h.store.setRunStatus).toHaveBeenCalledWith('run-1', WS, 'failed', 'CREDITS')
  })

  // ── startRun: the free half ────────────────────────────────────────────
  //
  // THIS HALF HAD NO EXECUTION COVERAGE AT ALL until 2026-08-22, and that is how
  // `openRun`'s broken ON CONFLICT survived every other suite. The tests below
  // drive the real function; only its I/O is stubbed.
  describe('startRun', () => {
    const PLAYBOOK = {
      id: 'pb-1',
      workspace_id: WS,
      recipe_key: 'festival_calendar',
      enabled: true,
      params: { channels: ['instagram'], calendars: ['india'], lead_days: 7 },
      trigger_kind: 'manual',
      cadence: null,
      last_run_at: null,
    }
    const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

    beforeEach(() => {
      h.store.readPlaybook.mockResolvedValue(PLAYBOOK)
      h.store.openRun.mockResolvedValue('run-1')
    })

    it('halts at the cost preview with the whole price, having charged nothing', async () => {
      // 20 January 2026: Republic Day is six days away, inside the window.
      const out = await startRun('pb-1', day(2026, 1, 20))

      expect(out.ok).toBe(true)
      expect(out.estimatedCredits).toBe(DRAFT + RUN)
      const [, , estimate] = h.store.haltForCostApproval.mock.calls[0] as unknown as [
        string,
        string,
        number,
      ]
      expect(estimate).toBe(DRAFT + RUN)
      // The whole point of the halt: proposing reads a calendar, so there is no
      // honest reason to take money before the number has been seen.
      expect(h.withCredits).not.toHaveBeenCalled()
      expect(h.store.writeItems).toHaveBeenCalled()
    })

    it('ends at nothing_to_do on a quiet week — an ending, not a failure', async () => {
      const out = await startRun('pb-1', day(2026, 3, 20))

      expect(out.ok).toBe(true)
      expect(out.nothingToDo).toBe(true)
      expect(h.store.finishNothingToDo).toHaveBeenCalledWith('run-1', WS)
      expect(h.store.writeItems).not.toHaveBeenCalled()
      expect(h.store.haltForCostApproval).not.toHaveBeenCalled()
      expect(h.withCredits).not.toHaveBeenCalled()
    })

    it('records that it ran even when it found nothing', async () => {
      // Otherwise a quiet day leaves the playbook permanently due and the cron
      // re-opens it on every tick.
      await startRun('pb-1', day(2026, 3, 20))
      expect(h.store.markRan).toHaveBeenCalledWith('pb-1', WS)
    })

    it('says so rather than opening a second run when one is already live', async () => {
      // `openRun` returns null when the partial unique index refuses. That is a
      // normal answer — opening a second would charge twice for one festival.
      h.store.openRun.mockResolvedValue(null)
      const out = await startRun('pb-1', day(2026, 1, 20))
      expect(out.ok).toBe(false)
      expect(out.message).toMatch(/already running/i)
      expect(h.store.writeItems).not.toHaveBeenCalled()
    })

    it('refuses a blocked recipe by naming the one thing it needs', async () => {
      h.store.readPlaybook.mockResolvedValue({ ...PLAYBOOK, recipe_key: 'rss_to_post' })
      const out = await startRun('pb-1', day(2026, 1, 20))
      expect(out.ok).toBe(false)
      expect(out.message).toMatch(/safe to point at any address/i)
      expect(h.store.openRun).not.toHaveBeenCalled()
    })
  })
})
