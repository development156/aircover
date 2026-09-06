import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * `approvePosts` — the BULK approve, now one `approve_posts` RPC.
 *
 * Until 2026-09-03 it read no role. `posts` carries `app.apply_tenant_policies`,
 * which grants full CRUD to every member whatever their role, so RLS did not
 * close it either: a VIEWER could approve, in bulk, and the workspace's own
 * `approver` role meant nothing. The RPC now checks the role in the database;
 * the app-side read stays as defence in depth and these tests keep it honest.
 *
 * Every refusal test asserts that the RPC was NEVER CALLED, not merely that the
 * result was a refusal. A gate placed after the call returns the same sentence
 * and still moves every row; only the call assertion separates them.
 *
 * The counts are read off the RETURNED ROWS. `approved` and `scheduled` are
 * counted from each row's status, `moved` is requested minus returned. A test
 * that only checked `ok` would let "Approved 5" print over four.
 */

const WS_ID = '22222222-2222-4222-8222-222222222222'
const POST_A = '11111111-1111-4111-8111-111111111111'
const POST_B = '33333333-3333-4333-8333-333333333333'
const POST_C = '44444444-4444-4444-8444-444444444444'

const state = vi.hoisted(() => ({
  userId: 'user_abc' as string | null,
  role: 'owner' as 'owner' | 'editor' | 'approver' | 'viewer' | null,
  rows: [] as Array<{ id: string; status: string }>,
  error: null as { code?: string; message: string } | null,
  calls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
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
    rpc: (fn: string, args: Record<string, unknown>) => {
      state.calls.push({ fn, args })
      return Promise.resolve({ data: state.error ? null : state.rows, error: state.error })
    },
    from: () => {
      throw new Error('approvePosts must not write posts directly; the trigger refuses it')
    },
  }),
}))

const { approvePosts } = await import('./approvals')

beforeEach(() => {
  state.userId = 'user_abc'
  state.role = 'owner'
  state.rows = []
  state.error = null
  state.calls = []
})

describe('approvePosts · who may approve', () => {
  test('refuses a viewer, names the roles that may, and never calls the RPC', async () => {
    state.role = 'viewer'
    state.rows = [
      { id: POST_A, status: 'approved' },
      { id: POST_B, status: 'approved' },
    ]

    const result = await approvePosts([POST_A, POST_B])

    expect(result).toEqual({
      ok: false,
      message: 'Only an owner, editor or approver can approve a post.',
    })
    expect(state.calls).toEqual([])
  })

  test('an unestablished role is a DIFFERENT sentence, and also calls nothing', async () => {
    state.role = null
    state.rows = [{ id: POST_A, status: 'approved' }]

    const result = await approvePosts([POST_A])

    expect(result).toEqual({
      ok: false,
      message:
        'Sahoda could not confirm your role in this workspace, so nothing was approved. Try again in a moment.',
    })
    expect(state.calls).toEqual([])
  })

  test.each(['owner', 'editor', 'approver'] as const)('lets a %s through', async (role) => {
    state.role = role
    state.rows = [
      { id: POST_A, status: 'approved' },
      { id: POST_B, status: 'approved' },
    ]

    const result = await approvePosts([POST_A, POST_B])

    expect(result).toEqual({ ok: true, approved: 2, scheduled: 0, moved: 0, failed: 0 })
    expect(state.calls).toEqual([{ fn: 'approve_posts', args: { p_post_ids: [POST_A, POST_B] } }])
  })

  test('an empty selection returns before the role is ever read', async () => {
    // The early return for zero ids sits ABOVE the gate, deliberately: refusing an
    // empty click with "you may not approve" would be a refusal about permission
    // when the true answer is that nothing was selected.
    state.role = 'viewer'

    const result = await approvePosts([])

    expect(result).toEqual({ ok: true, approved: 0, scheduled: 0, moved: 0, failed: 0 })
    expect(state.calls).toEqual([])
  })

  test('FORBIDDEN_ROLE raised by the RPC is the same role sentence, not a generic failure', async () => {
    // The app-side read said owner; the database disagreed (a role changed
    // between the two reads). The database wins and the sentence must still
    // name who may, because "try again" cannot fix a role.
    state.error = { code: 'P0001', message: 'FORBIDDEN_ROLE' }

    const result = await approvePosts([POST_A])

    expect(result).toEqual({
      ok: false,
      message: 'Only an owner, editor or approver can approve a post.',
    })
  })
})

describe('approvePosts · the three counts come from the returned rows', () => {
  test('every row back as approved: approved N, nothing scheduled, nothing moved', async () => {
    state.rows = [
      { id: POST_A, status: 'approved' },
      { id: POST_B, status: 'approved' },
      { id: POST_C, status: 'approved' },
    ]

    await expect(approvePosts([POST_A, POST_B, POST_C])).resolves.toEqual({
      ok: true,
      approved: 3,
      scheduled: 0,
      moved: 0,
      failed: 0,
    })
  })

  test('a dated post comes back scheduled and is counted as such, not as approved', async () => {
    state.rows = [
      { id: POST_A, status: 'scheduled' },
      { id: POST_B, status: 'approved' },
      { id: POST_C, status: 'scheduled' },
    ]

    await expect(approvePosts([POST_A, POST_B, POST_C])).resolves.toEqual({
      ok: true,
      approved: 1,
      scheduled: 2,
      moved: 0,
      failed: 0,
    })
  })

  test('a selected id the RPC did not return is "moved", never "failed"', async () => {
    // Zero or fewer rows is not an error from the RPC. The missing one was not
    // approvable when the statement ran; the screen was stale.
    state.rows = [{ id: POST_A, status: 'approved' }]

    await expect(approvePosts([POST_A, POST_B, POST_C])).resolves.toEqual({
      ok: true,
      approved: 1,
      scheduled: 0,
      moved: 2,
      failed: 0,
    })
  })

  test('the same id twice is sent once, so it cannot count as a phantom "moved"', async () => {
    state.rows = [{ id: POST_A, status: 'approved' }]

    const result = await approvePosts([POST_A, POST_A])

    expect(state.calls[0]?.args).toEqual({ p_post_ids: [POST_A] })
    expect(result).toEqual({ ok: true, approved: 1, scheduled: 0, moved: 0, failed: 0 })
  })

  test('any other raise reports every selected row as unsaved', async () => {
    state.error = { code: 'P0001', message: 'POSTS_SPAN_WORKSPACES' }

    await expect(approvePosts([POST_A, POST_B])).resolves.toEqual({
      ok: true,
      approved: 0,
      scheduled: 0,
      moved: 0,
      failed: 2,
    })
  })

  test('NOT_SIGNED_IN from the RPC is the signed-out sentence', async () => {
    state.error = { code: 'P0001', message: 'NOT_SIGNED_IN' }

    await expect(approvePosts([POST_A])).resolves.toEqual({
      ok: false,
      message: 'Sign in to approve these posts.',
    })
  })
})
