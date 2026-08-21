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

const h = vi.hoisted(() => {
  const store = {
    readApprovedRunForExecute: vi.fn(),
    readItems: vi.fn(),
    linkItemToPost: vi.fn(),
    addSpend: vi.fn(),
    setRunStatus: vi.fn(),
    finishRun: vi.fn(),
    writeVariants: vi.fn(),
    availableCredits: vi.fn(async () => 0),
  }
  const withCredits = vi.fn(async (_opts: unknown, fn: (ctx: unknown) => Promise<unknown>) => ({
    ok: true,
    data: await fn({ actionType: 'post_variants', creditsCharged: DRAFT }),
  }))
  const insert = vi.fn(() => ({
    select: () => ({ single: async () => ({ data: { id: '22222222-2222-4222-8222-222222222222' }, error: null }) }),
  }))
  return { store, withCredits, insert }
})

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_a' }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))
vi.mock('@/lib/workspaces', () => ({
  workspaceForWrite: async () => ({ ok: true, workspace: { id: '11111111-1111-4111-8111-111111111111' } }),
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

import { executeRun } from './playbook-run'

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
    const row = h.insert.mock.calls[0]![0] as Record<string, unknown>
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

    const row = h.insert.mock.calls[0]![0] as Record<string, unknown>
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
})
