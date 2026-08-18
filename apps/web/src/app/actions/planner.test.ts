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
  state.result = { data: null, error: null }
  state.calls = { patch: null, eq: [], in: null }
})

describe('approvePost', () => {
  test('approves and reports the new status when a row actually came back', async () => {
    state.result = { data: { ...APPROVED_ROW }, error: null }

    await expect(approvePost(POST_ID)).resolves.toEqual({ ok: true, status: 'approved' })
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
