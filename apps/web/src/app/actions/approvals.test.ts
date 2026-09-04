import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * `approvePosts` — the BULK status write, which had no test file at all.
 *
 * It moves up to `MAX_BULK` posts into `approved` on one click, and until
 * 2026-09-03 it read no role. `posts` carries `app.apply_tenant_policies`, which
 * grants full CRUD to every member whatever their role, so RLS did not close it
 * either: a VIEWER could approve, in bulk, and the workspace's own `approver`
 * role meant nothing.
 *
 * Every refusal test asserts that the update was NEVER ISSUED, not merely that
 * the result was a refusal. A gate placed after the statement returns the same
 * sentence and still writes every row; only the patch assertion separates them.
 */

const WS_ID = '22222222-2222-4222-8222-222222222222'
const POST_A = '11111111-1111-4111-8111-111111111111'
const POST_B = '33333333-3333-4333-8333-333333333333'

const state = vi.hoisted(() => ({
  userId: 'user_abc' as string | null,
  role: 'owner' as 'owner' | 'editor' | 'approver' | 'viewer' | null,
  rows: [] as Array<{ id: string }>,
  error: null as { code: string } | null,
  calls: { patch: null as Record<string, unknown> | null },
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => Promise.resolve({ userId: state.userId }),
}))

vi.mock('@/lib/workspaces', () => ({
  workspaceForWrite: () => Promise.resolve({ ok: true, workspace: { id: WS_ID } }),
}))

vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))

/**
 * Only the READ is mocked. The allowlist and both sentences come from the real
 * module, so these tests pin the sentence a customer actually receives.
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
          in: () => chain,
          eq: () => chain,
          select: () => Promise.resolve({ data: state.rows, error: state.error }),
        }
        return chain
      },
    }),
  }),
}))

const { approvePosts } = await import('./approvals')

beforeEach(() => {
  state.userId = 'user_abc'
  state.role = 'owner'
  state.rows = []
  state.error = null
  state.calls = { patch: null }
})

describe('approvePosts · who may approve', () => {
  test('refuses a viewer, names the roles that may, and never issues the update', async () => {
    state.role = 'viewer'
    state.rows = [{ id: POST_A }, { id: POST_B }]

    const result = await approvePosts([POST_A, POST_B])

    expect(result).toEqual({
      ok: false,
      message: 'Only an owner, editor or approver can approve a post.',
    })
    expect(state.calls.patch).toBeNull()
  })

  test('an unestablished role is a DIFFERENT sentence, and also writes nothing', async () => {
    state.role = null
    state.rows = [{ id: POST_A }]

    const result = await approvePosts([POST_A])

    expect(result).toEqual({
      ok: false,
      message:
        'Sahoda could not confirm your role in this workspace, so nothing was approved. Try again in a moment.',
    })
    expect(state.calls.patch).toBeNull()
  })

  test.each(['owner', 'editor', 'approver'] as const)('lets a %s through', async (role) => {
    state.role = role
    state.rows = [{ id: POST_A }, { id: POST_B }]

    const result = await approvePosts([POST_A, POST_B])

    expect(result).toEqual({ ok: true, approved: 2, moved: 0, failed: 0 })
    expect(state.calls.patch).toEqual({ status: 'approved' })
  })

  test('an empty selection returns before the role is ever read', async () => {
    // The early return for zero ids sits ABOVE the gate, deliberately: refusing an
    // empty click with "you may not approve" would be a refusal about permission
    // when the true answer is that nothing was selected.
    state.role = 'viewer'

    const result = await approvePosts([])

    expect(result).toEqual({ ok: true, approved: 0, moved: 0, failed: 0 })
    expect(state.calls.patch).toBeNull()
  })
})
