import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * `deletePost` only. These tests exist because a PostgREST delete that matches
 * ZERO rows returns no error — so the action reported a successful deletion for
 * a post that was still on screen (already deleted in another tab, or filtered
 * out by RLS after a membership change).
 */

const state = vi.hoisted(() => ({
  result: {
    data: null as { id: string } | null,
    error: null as { code: string } | null,
  },
  calls: { select: [] as string[] },
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => Promise.resolve({ userId: 'user_abc' }),
}))

vi.mock('@/lib/workspaces', () => ({
  getActiveWorkspace: () => Promise.resolve({ id: '22222222-2222-4222-8222-222222222222' }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: () => ({
      delete: () => ({
        eq: () => ({
          select: (columns: string) => {
            state.calls.select.push(columns)
            return { maybeSingle: () => Promise.resolve(state.result) }
          },
        }),
      }),
    }),
  }),
}))

const { deletePost } = await import('./posts')

const NO_ACCESS = "You don't have access to this post."

beforeEach(() => {
  state.result = { data: null, error: null }
  state.calls.select = []
})

describe('deletePost', () => {
  test('reports success when a row actually came back', async () => {
    state.result = { data: { id: 'post_1' }, error: null }

    await expect(deletePost('post_1')).resolves.toEqual({ ok: true })
  })

  test('asks for the deleted row rather than firing and forgetting', async () => {
    state.result = { data: { id: 'post_1' }, error: null }

    await deletePost('post_1')

    expect(state.calls.select).toEqual(['id'])
  })

  test('fails when the delete matched no rows', async () => {
    state.result = { data: null, error: null }

    await expect(deletePost('post_1')).resolves.toEqual({ ok: false, message: NO_ACCESS })
  })

  test('reads identically to an RLS refusal, so it is not an existence oracle', async () => {
    state.result = { data: null, error: null }
    const missing = await deletePost('post_1')

    state.result = { data: null, error: { code: '42501' } }
    const refused = await deletePost('post_1')

    expect(missing).toEqual(refused)
  })

  test('maps a driver error through the shared copy', async () => {
    state.result = { data: null, error: { code: '23503' } }

    await expect(deletePost('post_1')).resolves.toEqual({
      ok: false,
      message: 'That post no longer exists — reload to see the current list.',
    })
  })
})
