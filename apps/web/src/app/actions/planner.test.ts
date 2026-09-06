import { revalidatePath } from 'next/cache'
import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * `approvePost` is the ONE sanctioned approve in apps/web, and it now goes
 * through the `approve_posts` RPC. These tests pin the properties that keep it
 * from becoming a fabricated-state hole:
 *  - the transition allowlist lives IN THE DATABASE, so this file never issues
 *    a direct `posts` update (the lifecycle trigger would refuse it anyway);
 *  - an RPC that returns zero rows is a refusal, not a success;
 *  - the status reported back is the one the row CAME BACK WITH, so a dated
 *    post that the RPC booked reads `scheduled` and not the `approved` the
 *    caller might have assumed.
 */

const WS_ID = '22222222-2222-4222-8222-222222222222'
const POST_ID = '11111111-1111-4111-8111-111111111111'

const APPROVED_ROW = {
  id: POST_ID,
  workspace_id: WS_ID,
  title: 'T',
  body: null,
  status: 'approved',
  channels: ['x'],
  scheduled_at: null,
  origin: 'plan_week',
  created_by: 'user_abc',
  created_at: '2026-07-20T00:00:00.000Z',
  updated_at: '2026-07-20T01:00:00.000Z',
}

const SCHEDULED_ROW = {
  ...APPROVED_ROW,
  status: 'scheduled',
  scheduled_at: '2026-07-25T18:00:00.000Z',
}

const state = vi.hoisted(() => ({
  userId: 'user_abc' as string | null,
  /**
   * The caller's role. `owner` by default so every pre-existing test in this file
   * still exercises what it was written to exercise — the gate is new, and a test
   * about the RPC should not start failing for a reason it never named.
   */
  role: 'owner' as 'owner' | 'editor' | 'approver' | 'viewer' | null,
  rows: [] as Array<Record<string, unknown>>,
  error: null as { code?: string; message: string } | null,
  calls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => Promise.resolve({ userId: state.userId }),
}))

vi.mock('@/lib/workspaces', () => ({
  getActiveWorkspace: () => Promise.resolve({ id: WS_ID }),
  // Derived from the SAME value the two-way mock returns, so every assertion in
  // this file still means what it meant. `workspaceForWrite` carries the REFUSAL
  // SENTENCE as well as the workspace — the split run 24 made, because "Create a
  // workspace first." was being said to people who had one.
  workspaceForWrite: async () => {
    const w = await Promise.resolve({ id: WS_ID })
    return w ? { ok: true, workspace: w } : { ok: false, message: 'Create a workspace first.' }
  },
}))

vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))

/**
 * Only the READ is mocked. `canApproveAsRole` and both refusal sentences come from
 * the real module, so these tests assert the sentence a customer actually gets — a
 * mocked predicate would let the allowlist rot and still pass.
 */
vi.mock('@/lib/workspace-role', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/workspace-role')>()),
  getWorkspaceRole: () => Promise.resolve(state.role),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      state.calls.push({ fn, args })
      return Promise.resolve({ data: state.error ? null : state.rows, error: state.error })
    },
    from: () => {
      throw new Error('approvePost must not write posts directly; the trigger refuses it')
    },
  }),
}))

const { approvePost } = await import('./planner')

beforeEach(() => {
  state.userId = 'user_abc'
  state.role = 'owner'
  state.rows = []
  state.error = null
  state.calls = []
})

/**
 * WHO MAY APPROVE, WHICH NOTHING CHECKED.
 *
 * Measured 2026-09-03: this action read no role, and the database did not close it
 * — `posts` carries `app.apply_tenant_policies`, which grants full CRUD to every
 * member regardless of role. So a VIEWER, the role that exists to read, could put a
 * post into the state publishing sends from. The workspace even has an `approver`
 * role, which meant nothing.
 *
 * The RPC now checks the role itself. The app-side read stays as defence in depth,
 * and each test asserts `state.calls` is empty, not merely that the result was a
 * refusal: a gate placed after the call would return the right sentence and still
 * have moved the row, and only the call assertion can tell those apart.
 */
describe('approvePost · who may approve', () => {
  test('refuses a viewer, names the roles that may, and never calls the RPC', async () => {
    state.role = 'viewer'
    state.rows = [{ ...APPROVED_ROW }]

    const result = await approvePost(POST_ID)

    expect(result).toEqual({
      ok: false,
      message: 'Only an owner, editor or approver can approve a post.',
    })
    expect(state.calls).toEqual([])
  })

  test('an unestablished role is a DIFFERENT sentence, and also calls nothing', async () => {
    // "We could not confirm your role" and "you may not" are different claims: one
    // says try again, the other says ask for access. `getWorkspaceRole` returns null
    // on any doubt, so this is the path a transient read failure takes.
    state.role = null
    state.rows = [{ ...APPROVED_ROW }]

    const result = await approvePost(POST_ID)

    expect(result).toEqual({
      ok: false,
      message:
        'Sahoda could not confirm your role in this workspace, so nothing was approved. Try again in a moment.',
    })
    expect(state.calls).toEqual([])
  })

  test.each(['owner', 'editor', 'approver'] as const)('lets a %s through', async (role) => {
    state.role = role
    state.rows = [{ ...APPROVED_ROW }]

    const result = await approvePost(POST_ID)

    expect(result).toEqual({ ok: true, status: 'approved' })
    expect(state.calls).toEqual([{ fn: 'approve_posts', args: { p_post_ids: [POST_ID] } }])
  })

  test('FORBIDDEN_ROLE raised by the RPC is the same role sentence, not a generic failure', async () => {
    // The app-side read said owner; the database disagreed. The database wins,
    // and the sentence must still name who may, because "try again" cannot fix
    // a role.
    state.error = { code: 'P0001', message: 'FORBIDDEN_ROLE' }

    await expect(approvePost(POST_ID)).resolves.toEqual({
      ok: false,
      message: 'Only an owner, editor or approver can approve a post.',
    })
  })
})

describe('approvePost', () => {
  test('approves and reports the new status when a row actually came back', async () => {
    state.rows = [{ ...APPROVED_ROW }]

    await expect(approvePost(POST_ID)).resolves.toEqual({ ok: true, status: 'approved' })
  })

  test('a dated post comes back scheduled, and that is the status reported', async () => {
    // The RPC books a post that already carries a time. Reporting `approved`
    // here would make the toast under-claim what just happened.
    state.rows = [{ ...SCHEDULED_ROW }]

    await expect(approvePost(POST_ID)).resolves.toEqual({ ok: true, status: 'scheduled' })
  })

  test('refreshes every surface that shows the post: the planner, Posts, Approvals and Home', async () => {
    // Approving from the planner left /approvals and /home holding the old
    // count until a reload. `approvePosts` in approvals.ts refreshed all four;
    // this one refreshed two.
    state.rows = [{ ...APPROVED_ROW }]

    await approvePost(POST_ID)

    for (const path of ['/planner', '/posts', '/approvals', '/home']) {
      expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith(path)
    }
  })

  test('sends exactly this one id to approve_posts and nothing else', async () => {
    state.rows = [{ ...APPROVED_ROW }]

    await approvePost(POST_ID)

    expect(state.calls).toEqual([{ fn: 'approve_posts', args: { p_post_ids: [POST_ID] } }])
  })

  test('zero returned rows is a refusal, not a success', async () => {
    state.rows = []

    const result = await approvePost(POST_ID)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/approve/i)
  })

  test('NOT_SIGNED_IN from the RPC is the signed-out sentence', async () => {
    state.error = { code: 'P0001', message: 'NOT_SIGNED_IN' }

    await expect(approvePost(POST_ID)).resolves.toEqual({
      ok: false,
      message: 'Sign in to approve this post.',
    })
  })

  test('any other database error is the generic refusal', async () => {
    state.error = { code: '42501', message: 'permission denied' }

    await expect(approvePost(POST_ID)).resolves.toEqual({
      ok: false,
      message: 'Could not approve this post. Try again.',
    })
  })

  test('signed out cannot approve', async () => {
    state.userId = null

    const result = await approvePost(POST_ID)

    expect(result.ok).toBe(false)
    expect(state.calls).toEqual([])
  })
})
