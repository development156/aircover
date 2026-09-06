import { revalidatePath } from 'next/cache'
import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * `approvePost` is the ONE sanctioned status write in apps/web. These tests pin
 * the two properties that keep it from becoming a fabricated-state hole:
 *  - the transition allowlist rides IN THE SQL (`.in('status', …)`), so a race
 *    cannot approve a post that publishing already picked up;
 *  - a filter that matches zero rows is a refusal, not a success (the
 *    deletePost lesson — PostgREST returns no error for zero matches).
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

const state = vi.hoisted(() => ({
  userId: 'user_abc' as string | null,
  /**
   * The caller's role. `owner` by default so every pre-existing test in this file
   * still exercises what it was written to exercise — the gate is new, and a test
   * about the SQL allowlist should not start failing for a reason it never named.
   */
  role: 'owner' as 'owner' | 'editor' | 'approver' | 'viewer' | null,
  result: { data: null as Record<string, unknown> | null, error: null as { code: string } | null },
  calls: {
    patch: null as Record<string, unknown> | null,
    eq: [] as Array<[string, string]>,
    in: null as [string, readonly string[]] | null,
  },
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
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        state.calls.patch = patch
        const chain = {
          eq: (col: string, val: string) => {
            state.calls.eq.push([col, val])
            return chain
          },
          in: (col: string, vals: readonly string[]) => {
            state.calls.in = [col, vals]
            return chain
          },
          select: () => ({ maybeSingle: () => Promise.resolve(state.result) }),
        }
        return chain
      },
    }),
  }),
}))

const { approvePost } = await import('./planner')

beforeEach(() => {
  state.userId = 'user_abc'
  state.role = 'owner'
  state.result = { data: null, error: null }
  state.calls = { patch: null, eq: [], in: null }
})

/**
 * WHO MAY APPROVE, WHICH NOTHING CHECKED.
 *
 * Measured 2026-09-03: this action read no role, and the database does not close it
 * — `posts` carries `app.apply_tenant_policies`, which grants full CRUD to every
 * member regardless of role. So a VIEWER, the role that exists to read, could put a
 * post into the state publishing sends from. The workspace even has an `approver`
 * role, which meant nothing.
 *
 * Each test asserts `state.calls.patch` is null, not merely that the result was a
 * refusal. A gate placed after the update would return the right sentence and still
 * have written the row, and only the patch assertion can tell those apart.
 */
describe('approvePost · who may approve', () => {
  test('refuses a viewer, names the roles that may, and never issues the update', async () => {
    state.role = 'viewer'
    state.result = { data: { ...APPROVED_ROW }, error: null }

    const result = await approvePost(POST_ID)

    expect(result).toEqual({
      ok: false,
      message: 'Only an owner, editor or approver can approve a post.',
    })
    expect(state.calls.patch).toBeNull()
  })

  test('an unestablished role is a DIFFERENT sentence, and also writes nothing', async () => {
    // "We could not confirm your role" and "you may not" are different claims: one
    // says try again, the other says ask for access. `getWorkspaceRole` returns null
    // on any doubt, so this is the path a transient read failure takes.
    state.role = null
    state.result = { data: { ...APPROVED_ROW }, error: null }

    const result = await approvePost(POST_ID)

    expect(result).toEqual({
      ok: false,
      message:
        'Sahoda could not confirm your role in this workspace, so nothing was approved. Try again in a moment.',
    })
    expect(state.calls.patch).toBeNull()
  })

  test.each(['owner', 'editor', 'approver'] as const)('lets a %s through', async (role) => {
    state.role = role
    state.result = { data: { ...APPROVED_ROW }, error: null }

    const result = await approvePost(POST_ID)

    expect(result).toEqual({ ok: true, status: 'approved' })
    expect(state.calls.patch).toEqual({ status: 'approved' })
  })
})

describe('approvePost', () => {
  test('approves and reports the new status when a row actually came back', async () => {
    state.result = { data: { ...APPROVED_ROW }, error: null }

    await expect(approvePost(POST_ID)).resolves.toEqual({ ok: true, status: 'approved' })
  })

  test('refreshes every surface that shows the post: the planner, Posts, Approvals and Home', async () => {
    // Approving from the planner left /approvals and /home holding the old
    // count until a reload. `approvePosts` in approvals.ts refreshed all four;
    // this one refreshed two.
    state.result = { data: { ...APPROVED_ROW }, error: null }

    await approvePost(POST_ID)

    for (const path of ['/planner', '/posts', '/approvals', '/home']) {
      expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith(path)
    }
  })

  test('writes ONLY status, and carries the allowlist in the SQL filter', async () => {
    state.result = { data: { ...APPROVED_ROW }, error: null }

    await approvePost(POST_ID)

    expect(state.calls.patch).toEqual({ status: 'approved' })
    expect(state.calls.eq).toEqual(
      expect.arrayContaining([
        ['id', POST_ID],
        ['workspace_id', WS_ID],
      ]),
    )
    expect(state.calls.in).toEqual(['status', ['idea', 'draft', 'review']])
  })

  test('zero matched rows is a refusal, not a success', async () => {
    state.result = { data: null, error: null }

    const result = await approvePost(POST_ID)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/approve/i)
  })

  test('a database error is a refusal', async () => {
    state.result = { data: null, error: { code: '42501' } }

    await expect(approvePost(POST_ID)).resolves.toMatchObject({ ok: false })
  })

  test('signed out cannot approve', async () => {
    state.userId = null

    const result = await approvePost(POST_ID)

    expect(result.ok).toBe(false)
    expect(state.calls.patch).toBeNull()
  })
})
