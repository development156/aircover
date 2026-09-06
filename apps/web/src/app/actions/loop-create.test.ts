import { describe, it, expect, vi, beforeEach } from 'vitest'
import { creditCost, DISPATCHABLE_STATUSES } from '@sahoda/shared'

import { APPROVABLE_FROM } from '@/lib/planner/transitions'

/**
 * THE CREATE STAGE: what the per-brief charge buys, and what each rung writes.
 *
 * ── THE TWO DEFECTS THIS FILE EXISTS FOR ─────────────────────────────────────
 * MEASURED 2026-09-02. The stage charged `post_variants` per brief, called no
 * model and wrote no `post_variants` row, so the dispatcher expired every Loop
 * post for having no variants and the customer had paid for nothing. And at L2
 * it wrote `status = 'approved'` with a slot, which is inside the sweep's gate
 * and outside the approvals queue, so "publishes each post once you approve it"
 * described a post nobody could approve and the sweep would send.
 *
 * ── WHAT IS MOCKED, AND WHY THAT IS HONEST HERE ─────────────────────────────
 * Everything with I/O, as in `playbook-run.test.ts`. What is left is the
 * decision sequence: is a model asked, is the result filtered, is the variant
 * write inside the hold, and what status does the row carry. The ledger and
 * the store have their own suites.
 */

const DRAFT = creditCost('post_variants')

const WS = '11111111-1111-4111-8111-111111111111'
const POST = '22222222-2222-4222-8222-222222222222'
const SLOT = '2026-01-27T04:30:00.000Z'

type ChargeResult = { ok: true; data: unknown } | { ok: false; error: { code: string } }
type ChargeFn = (
  opts: unknown,
  fn: (ctx: { actionType: string; creditsCharged: number }) => Promise<unknown>,
) => Promise<ChargeResult>
type InsertFn = (row: Record<string, unknown>) => {
  select: () => { single: () => Promise<{ data: { id: string } | null; error: unknown }> }
}

const h = vi.hoisted(() => {
  const store = {
    readApprovedCycleForCreate: vi.fn(),
    claimCreateStage: vi.fn(async () => true),
    readBriefs: vi.fn(),
    linkBriefToPost: vi.fn(async () => true),
    addSpend: vi.fn(),
    setCycleStatus: vi.fn(),
    finishCycle: vi.fn(async () => true),
    writeVariants: vi.fn(),
  }
  const withCredits = vi.fn<ChargeFn>()
  const insert = vi.fn<InsertFn>(() => ({
    select: () => ({
      single: async () => ({ data: { id: '22222222-2222-4222-8222-222222222222' }, error: null }),
    }),
  }))
  const runTask = vi.fn()
  return { store, withCredits, insert, runTask }
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
vi.mock('@/lib/loop/store', () => h.store)
vi.mock('@sahoda/billing', () => ({
  createPgLedgerPort: () => ({}),
  createWithCredits: () => h.withCredits,
  loadBillingEnv: () => ({ databaseUrl: 'postgres://stub' }),
}))
vi.mock('@sahoda/mesh', () => ({
  createMesh: () => ({ runTask: h.runTask }),
  contentVariantsTask: { def: { name: 'content_variants' } },
}))
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: () => ({
      insert: h.insert,
      select: () => ({ eq: async () => ({ data: DIAL }) }),
    }),
  }),
}))

/** The dial the mocked Supabase client hands back. Set per test. */
let DIAL: { channel: string; level: number }[] = [{ channel: 'instagram', level: 1 }]

import { runCreateStage } from './loop-create'

const brief = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  workspace_id: WS,
  cycle_id: 'cycle-1',
  priority: 1,
  title: 'Monsoon offer',
  body: 'a plain first draft',
  channels: ['instagram', 'linkedin'] as unknown as never,
  suggested_slot: SLOT,
  rationale: null,
  estimated_credits: DRAFT,
  included: true,
  post_id: null,
  stage_outcome: 'planned',
  ...over,
})

const APPROVED_CYCLE = { id: 'cycle-1', workspace_id: WS, status: 'creating' }

/** A faithful stand-in for `withCredits`: a throw inside becomes a RELEASE. */
const charging = (): ChargeFn => async (_opts, fn) => {
  try {
    return { ok: true, data: await fn({ actionType: 'post_variants', creditsCharged: DRAFT }) }
  } catch {
    return { ok: false, error: { code: 'PROVIDER_ERROR' } }
  }
}

const twoVariants = {
  ok: true,
  data: {
    variants: [
      { channel: 'instagram', body: 'for instagram' },
      { channel: 'linkedin', body: 'for linkedin' },
    ],
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  DIAL = [{ channel: 'instagram', level: 1 }]
  h.store.readApprovedCycleForCreate.mockResolvedValue(APPROVED_CYCLE)
  h.store.claimCreateStage.mockResolvedValue(true)
  h.store.readBriefs.mockResolvedValue([brief('b1')])
  h.store.linkBriefToPost.mockResolvedValue(true)
  h.store.finishCycle.mockResolvedValue(true)
  h.withCredits.mockImplementation(charging())
  h.runTask.mockResolvedValue(twoVariants)
})

describe('runCreateStage', () => {
  it('REFUSES an unapproved cycle, and attempts no charge and no model call', async () => {
    h.store.readApprovedCycleForCreate.mockResolvedValue(null)

    const out = await runCreateStage('cycle-1')

    expect(out.ok).toBe(false)
    expect(out.message).toMatch(/nothing has been spent/i)
    expect(h.withCredits).not.toHaveBeenCalled()
    expect(h.runTask).not.toHaveBeenCalled()
    expect(h.insert).not.toHaveBeenCalled()
  })

  // ── THE CHARGE BUYS THE WORK ──────────────────────────────────────────────
  it('asks the model for one body per channel and writes a variant per channel, inside the hold', async () => {
    const out = await runCreateStage('cycle-1')

    expect(out.ok).toBe(true)
    expect(out.created).toBe(1)
    expect(out.spent).toBe(DRAFT)
    // The mesh was asked, for every channel of the brief, with the brief's body.
    expect(h.runTask).toHaveBeenCalledTimes(1)
    expect(h.runTask.mock.calls[0]![1]).toEqual({
      body: 'a plain first draft',
      channels: ['instagram', 'linkedin'],
    })
    // One row per channel, never one body across both.
    expect(h.store.writeVariants).toHaveBeenCalledWith(WS, POST, [
      { channel: 'instagram', body: 'for instagram' },
      { channel: 'linkedin', body: 'for linkedin' },
    ])
    // Inside the hold: the model call and the variant write both happened
    // before the wrapper returned, so a throw at either releases the charge.
    const chargeCall = h.withCredits.mock.invocationCallOrder[0]!
    expect(h.runTask.mock.invocationCallOrder[0]!).toBeGreaterThan(chargeCall)
    expect(h.store.writeVariants.mock.invocationCallOrder[0]!).toBeGreaterThan(chargeCall)
    expect(h.store.addSpend).toHaveBeenCalledWith('cycle-1', WS, DRAFT)
  })

  it('charges nothing and marks the brief failed when the model call fails', async () => {
    h.runTask.mockResolvedValue({ ok: false, error: { code: 'PROVIDER_ERROR' } })

    const out = await runCreateStage('cycle-1')

    expect(out.ok).toBe(true)
    expect(out.created).toBe(0)
    expect(out.spent).toBe(0)
    expect(h.insert).not.toHaveBeenCalled()
    expect(h.store.writeVariants).not.toHaveBeenCalled()
    expect(h.store.linkBriefToPost).toHaveBeenCalledWith('b1', WS, null, 'failed')
    expect(h.store.addSpend).not.toHaveBeenCalled()
  })

  it('does not charge for variants when the model returned none', async () => {
    // `{"variants": []}` parses clean. Without `filterVariants` in front the
    // post would be inserted bodiless and the brief charged in full.
    h.runTask.mockResolvedValue({ ok: true, data: { variants: [] } })

    const out = await runCreateStage('cycle-1')

    expect(out.created).toBe(0)
    expect(out.spent).toBe(0)
    expect(h.insert).not.toHaveBeenCalled()
    expect(h.store.linkBriefToPost).toHaveBeenCalledWith('b1', WS, null, 'failed')
  })

  it('drops a variant on a channel nobody asked for rather than writing it', async () => {
    h.runTask.mockResolvedValue({
      ok: true,
      data: {
        variants: [
          { channel: 'instagram', body: 'for instagram' },
          { channel: 'x', body: 'nobody asked' },
        ],
      },
    })

    await runCreateStage('cycle-1')

    expect(h.store.writeVariants).toHaveBeenCalledWith(WS, POST, [
      { channel: 'instagram', body: 'for instagram' },
    ])
  })

  // ── WHAT EACH RUNG WRITES ─────────────────────────────────────────────────
  it('writes nothing, asks nothing and charges nothing at L0', async () => {
    DIAL = [
      { channel: 'instagram', level: 0 },
      { channel: 'linkedin', level: 0 },
    ]

    const out = await runCreateStage('cycle-1')

    expect(out.skipped).toBe(1)
    expect(out.created).toBe(0)
    expect(h.withCredits).not.toHaveBeenCalled()
    expect(h.runTask).not.toHaveBeenCalled()
    expect(h.store.linkBriefToPost).toHaveBeenCalledWith('b1', WS, null, 'suggested')
  })

  it('leaves an L1 draft in the Planner with no schedule', async () => {
    await runCreateStage('cycle-1')

    const row = h.insert.mock.calls[0]![0]
    expect(row.status).toBe('draft')
    expect(row.scheduled_at).toBeNull()
    expect(row.origin).toBe('plan_week')
    expect(h.store.linkBriefToPost).toHaveBeenCalledWith('b1', WS, POST, 'drafted')
  })

  it('at L2 writes a post a PERSON must approve: on the queue, approvable, outside the sweep', async () => {
    DIAL = [
      { channel: 'instagram', level: 2 },
      { channel: 'linkedin', level: 2 },
    ]

    await runCreateStage('cycle-1')

    const row = h.insert.mock.calls[0]![0]
    // The claim sold: "publishes each post once you approve it". Asserted
    // against the real lists, so a status that quietly re-enters the sweep's
    // gate turns this red rather than passing on a string.
    expect(DISPATCHABLE_STATUSES as readonly string[]).not.toContain(row.status)
    expect(APPROVABLE_FROM as readonly string[]).toContain(row.status)
    // The slot rides along, so the approval schedules it rather than asking.
    expect(row.scheduled_at).toBe(SLOT)
    expect(h.store.linkBriefToPost).toHaveBeenCalledWith('b1', WS, POST, 'awaiting_approval')
  })

  it('at L3 writes a plain draft with no time on it, so only the autopilot dispatcher can schedule it', async () => {
    // MEASURED 2026-09-02: `governingLevel` seeded at 2, so a dial at 3 took
    // the L2 branch and the ordinary sweep would have sent the post at the
    // slot with no cancel window.
    DIAL = [
      { channel: 'instagram', level: 3 },
      { channel: 'linkedin', level: 3 },
    ]

    await runCreateStage('cycle-1')

    const row = h.insert.mock.calls[0]![0]
    expect(row.status).toBe('draft')
    expect(row.scheduled_at).toBeNull()
    expect(DISPATCHABLE_STATUSES as readonly string[]).not.toContain(row.status)
  })

  // ── ENTERING TWICE ────────────────────────────────────────────────────────
  it('skips a brief that already carries a post, charging and writing nothing for it', async () => {
    // Two tabs at the halt screen both reach this function; `withCredits`
    // replays the DEBIT without charging but still runs the wrapped function,
    // so the read is the idempotency boundary and not the ledger.
    h.store.readBriefs.mockResolvedValue([
      brief('b1', { post_id: '33333333-3333-4333-8333-333333333333', stage_outcome: 'drafted' }),
      brief('b2'),
    ])

    const out = await runCreateStage('cycle-1')

    expect(out.created).toBe(1)
    expect(h.withCredits).toHaveBeenCalledTimes(1)
    expect(h.insert).toHaveBeenCalledTimes(1)
    expect(h.store.linkBriefToPost).not.toHaveBeenCalledWith(
      'b1',
      WS,
      expect.anything(),
      expect.anything(),
    )
    expect(h.store.linkBriefToPost).toHaveBeenCalledWith('b2', WS, POST, 'drafted')
  })

  it('running the whole stage twice writes exactly one post per brief', async () => {
    // The store answers the second pass with what the first pass wrote.
    h.store.readBriefs
      .mockResolvedValueOnce([brief('b1'), brief('b2')])
      .mockResolvedValueOnce([
        brief('b1', { post_id: POST, stage_outcome: 'drafted' }),
        brief('b2', { post_id: POST, stage_outcome: 'drafted' }),
      ])

    const first = await runCreateStage('cycle-1')
    const second = await runCreateStage('cycle-1')

    expect(first.created).toBe(2)
    expect(second.created).toBe(0)
    expect(h.insert).toHaveBeenCalledTimes(2)
  })

  it('does not report a week the kill switch stopped mid-run, and keeps what was written', async () => {
    h.store.finishCycle.mockResolvedValue(false)

    const out = await runCreateStage('cycle-1')

    expect(out.ok).toBe(true)
    expect(out.cancelledMidRun).toBe(true)
    expect(out.created).toBe(1)
  })
})

describe('runCreateStage — credits run out mid-stage', () => {
  it('HALTS instead of reporting the week: leaves the cycle in creating, never advances to staging', async () => {
    h.store.readBriefs.mockResolvedValue([brief('b1'), brief('b2')])
    // First brief succeeds, second is refused for want of credits.
    let call = 0
    h.withCredits.mockImplementation(async (_opts, fn) => {
      call += 1
      if (call === 1) {
        return { ok: true, data: await fn({ actionType: 'post_variants', creditsCharged: DRAFT }) }
      }
      return { ok: false, error: { code: 'CREDIT_INSUFFICIENT' } }
    })

    const out = await runCreateStage('cycle-1')

    expect(out.ok).toBe(false)
    expect(out.insufficient).toBe(true)
    expect(out.created).toBe(1)
    // The week is NOT reported as done — the cycle stays in `creating`.
    expect(h.store.setCycleStatus).not.toHaveBeenCalledWith('cycle-1', WS, 'staging')
    expect(h.store.finishCycle).not.toHaveBeenCalled()
  })
})

describe('runCreateStage — the concurrency claim', () => {
  it('turns a second concurrent run away before it charges or inserts', async () => {
    h.store.claimCreateStage.mockResolvedValue(false)
    const out = await runCreateStage('cycle-1')
    expect(out.ok).toBe(true)
    expect(out.created).toBeUndefined()
    expect(h.withCredits).not.toHaveBeenCalled()
    expect(h.insert).not.toHaveBeenCalled()
  })
})
