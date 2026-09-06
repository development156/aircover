import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * THE DIAL'S PLAN GATE.
 *
 * MEASURED 2026-09-02: `setChannelAutonomy` parsed the level and upserted.
 * The only adjudicator was the database trigger (a reported supervised cycle,
 * four confirmed brain fields), which never reads the plan. `PLAN_CATALOG`
 * gives Free `loopLevel: 1`, Starter 2, Growth 3, and `checkEntitlement` has
 * had a `loopLevel` dimension with zero callers since it was written. A Free
 * workspace could arm Autopilot and was never asked to upgrade.
 *
 * Everything with I/O is mocked. What is left is ORDER and OUTCOME: is the
 * plan asked before the write, is the write skipped on a refusal, and does a
 * rung every plan grants skip the question entirely.
 */

const WS = '11111111-1111-4111-8111-111111111111'

type Verdict =
  | { ok: true; data: { planId: string; limits: unknown; limit: number | null; allowed: true } }
  | { ok: false; error: { code: string; message: string; details?: unknown } }

const h = vi.hoisted(() => ({
  check: vi.fn<(input: unknown) => Promise<unknown>>(),
  upsert: vi.fn(async () => ({ error: null })),
}))

const roleHolder = vi.hoisted(() => ({ role: 'owner' as string | null }))

vi.mock('server-only', () => ({}))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_a' }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))
vi.mock('@/lib/workspace-role', () => ({
  getWorkspaceRole: async () => roleHolder.role,
  canManageLoop: (r: string | null) => r !== null && ['owner', 'editor', 'approver'].includes(r),
  LOOP_ROLE_REFUSAL: 'Only an owner, editor or approver can change the Loop.',
  LOOP_ROLE_UNKNOWN:
    'Sahoda could not confirm your role in this workspace, so nothing changed. Try again in a moment.',
}))
vi.mock('@/lib/workspaces', () => ({
  workspaceForWrite: async () => ({
    ok: true,
    workspace: { id: '11111111-1111-4111-8111-111111111111' },
  }),
}))
vi.mock('@/lib/billing/entitlements', () => ({ getCheckEntitlement: () => h.check }))
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({ from: () => ({ upsert: h.upsert }) }),
}))

import { setChannelAutonomy } from './loop-dial'

const allowed = (planId: string, limit: number): Verdict => ({
  ok: true,
  data: { planId, limits: {}, limit, allowed: true },
})
const denied = (planId: string, limit: number, currentUsage: number): Verdict => ({
  ok: false,
  error: {
    code: 'ENTITLEMENT_ERROR',
    message: 'Your plan does not allow this',
    details: { dimension: 'loopLevel', limit, currentUsage, planId },
  },
})

beforeEach(() => {
  vi.clearAllMocks()
  h.upsert.mockResolvedValue({ error: null })
  roleHolder.role = 'owner'
})

describe('setChannelAutonomy and the plan', () => {
  it('REFUSES Autopilot on a plan that stops at Draft, with the plan sentence, and writes nothing', async () => {
    h.check.mockResolvedValue(denied('free', 1, 3))

    const out = await setChannelAutonomy('instagram', 3)

    expect(out.ok).toBe(false)
    expect(out.message).toBe('Autopilot is on Growth and above. Your Free plan goes up to Draft.')
    expect(h.check).toHaveBeenCalledWith({
      workspaceId: WS,
      dimension: 'loopLevel',
      currentUsage: 3,
    })
    expect(h.upsert).not.toHaveBeenCalled()
  })

  it('REFUSES Autopilot on Starter, naming Growth as the plan that reaches it', async () => {
    h.check.mockResolvedValue(denied('starter', 2, 3))

    const out = await setChannelAutonomy('instagram', 3)

    expect(out.ok).toBe(false)
    expect(out.message).toBe(
      'Autopilot is on Growth and above. Your Starter plan goes up to Approve to publish.',
    )
    expect(h.upsert).not.toHaveBeenCalled()
  })

  it('writes the dial when the plan reaches the rung', async () => {
    h.check.mockResolvedValue(allowed('growth', 3))

    const out = await setChannelAutonomy('instagram', 3)

    expect(out.ok).toBe(true)
    expect(h.upsert).toHaveBeenCalledTimes(1)
    // The gate ran BEFORE the write, never after it.
    expect(h.check.mock.invocationCallOrder[0]!).toBeLessThan(h.upsert.mock.invocationCallOrder[0]!)
  })

  it('never asks the plan about a rung every plan grants, so turning the dial down cannot be refused', async () => {
    // Free carries loopLevel 1. A plan read that failed must not stop a person
    // moving from Autopilot back to Draft or Suggest.
    h.check.mockRejectedValue(new Error('pool is dead'))

    expect((await setChannelAutonomy('instagram', 1)).ok).toBe(true)
    expect((await setChannelAutonomy('instagram', 0)).ok).toBe(true)
    expect(h.check).not.toHaveBeenCalled()
    expect(h.upsert).toHaveBeenCalledTimes(2)
  })

  it('fails CLOSED when the plan cannot be read, and says that rather than blaming the plan', async () => {
    h.check.mockResolvedValue({
      ok: false,
      error: { code: 'PROVIDER_ERROR', message: 'Could not check your plan entitlements' },
    })

    const out = await setChannelAutonomy('instagram', 3)

    expect(out.ok).toBe(false)
    expect(out.message).toBe('Sahoda could not check your plan. Try again in a moment.')
    expect(out.message).not.toMatch(/plan goes up to/)
    expect(h.upsert).not.toHaveBeenCalled()
  })

  it('still lets the database refuse a rung the workspace has not earned', async () => {
    // The plan allows it; the trigger does not. Both gates stand, in that order.
    h.check.mockResolvedValue(allowed('growth', 3))
    h.upsert.mockResolvedValue({
      error: { message: 'AUTOPILOT_NEEDS_SUPERVISED_CYCLE', details: '' },
    } as never)

    const out = await setChannelAutonomy('instagram', 3)

    expect(out.ok).toBe(false)
    expect(out.message).not.toMatch(/try again/i)
  })
})

describe('setChannelAutonomy and the viewer', () => {
  it('REFUSES a viewer and writes nothing — the role gate is before the upsert', async () => {
    roleHolder.role = 'viewer'
    const out = await setChannelAutonomy('instagram', 1)
    expect(out.ok).toBe(false)
    expect(out.message).toMatch(/owner, editor or approver/i)
    expect(h.upsert).not.toHaveBeenCalled()
  })

  it('REFUSES when the role cannot be established, with the try-again message', async () => {
    roleHolder.role = null
    const out = await setChannelAutonomy('instagram', 1)
    expect(out.ok).toBe(false)
    expect(out.message).toMatch(/could not confirm your role/i)
    expect(h.upsert).not.toHaveBeenCalled()
  })
})
