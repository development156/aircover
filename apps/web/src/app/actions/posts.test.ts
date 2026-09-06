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
    error: null as { code?: string; message?: string } | null,
  },
  /** What `post_media … where asset_id is null` answers with. */
  media: {
    data: [] as { storage_path: string }[] | null,
    error: null as { code: string } | null,
  },
  removed: [] as string[][],
  removeError: null as { message: string } | null,
  removeThrows: false,
  calls: { select: [] as string[], mediaFilters: [] as [string, string, unknown][] },
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => Promise.resolve({ userId: 'user_abc' }),
}))

vi.mock('@/lib/workspaces', () => ({
  getActiveWorkspace: () => Promise.resolve({ id: '22222222-2222-4222-8222-222222222222' }),
  // Derived from the SAME value the two-way mock returns, so every assertion in
  // this file still means what it meant. `workspaceForWrite` carries the REFUSAL
  // SENTENCE as well as the workspace — the split run 24 made, because "Create a
  // workspace first." was being said to people who had one.
  workspaceForWrite: async () => {
    const w = await Promise.resolve({ id: '22222222-2222-4222-8222-222222222222' })
    return w ? { ok: true, workspace: w } : { ok: false, message: 'Create a workspace first.' }
  },
}))

/**
 * Table-aware, because `deletePost` now touches two tables and the bucket: it
 * reads the direct-upload paths off `post_media` BEFORE the delete cascades
 * them away, deletes the post, then removes those objects.
 */
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    storage: {
      from: () => ({
        remove: (paths: string[]) => {
          if (state.removeThrows) throw new Error('storage down')
          state.removed.push(paths)
          return Promise.resolve({ error: state.removeError })
        },
      }),
    },
    from: (table: string) => {
      if (table === 'post_media') {
        const chain: Record<string, unknown> = {
          then: undefined,
        }
        const filter = (op: string) => (column: string, value: unknown) => {
          state.calls.mediaFilters.push([op, column, value])
          return chain
        }
        chain.eq = filter('eq')
        chain.is = filter('is')
        // Awaitable at the end of any chain length.
        chain.then = (resolve: (v: unknown) => void) => resolve(state.media)
        return { select: () => chain }
      }
      return {
        delete: () => ({
          eq: () => ({
            select: (columns: string) => {
              state.calls.select.push(columns)
              return { maybeSingle: () => Promise.resolve(state.result) }
            },
          }),
        }),
      }
    },
  }),
}))

const { deletePost } = await import('./posts')

const NO_ACCESS = "You don't have access to this post."

const { reportServerError } = await import('@/lib/observability/report')

beforeEach(() => {
  state.result = { data: null, error: null }
  state.media = { data: [], error: null }
  state.removed = []
  state.removeError = null
  state.removeThrows = false
  state.calls.select = []
  state.calls.mediaFilters = []
  vi.mocked(reportServerError).mockClear()
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
      message: 'That post no longer exists. Reload to see the current list.',
    })
  })

  // ── DB-19: the objects a cascade cannot reach ─────────────────────────────

  test('removes the direct uploads’ objects after the row delete succeeds', async () => {
    state.result = { data: { id: 'post_1' }, error: null }
    state.media.data = [{ storage_path: 'ws/post_1/a.png' }, { storage_path: 'ws/post_1/b.jpg' }]

    await expect(deletePost('post_1')).resolves.toEqual({ ok: true })

    expect(state.removed).toEqual([['ws/post_1/a.png', 'ws/post_1/b.jpg']])
  })

  test('asks only for this post’s DIRECT uploads — a library file is not this post’s to delete', async () => {
    state.result = { data: { id: 'post_1' }, error: null }

    await deletePost('post_1')

    expect(state.calls.mediaFilters).toEqual([
      ['eq', 'post_id', 'post_1'],
      ['is', 'asset_id', null],
    ])
  })

  test('removes nothing when the delete matched no rows', async () => {
    state.result = { data: null, error: null }
    state.media.data = [{ storage_path: 'ws/post_1/a.png' }]

    await deletePost('post_1')

    // The row is still there (someone else's, or already gone): its bytes are not ours to touch.
    expect(state.removed).toEqual([])
  })

  test('a failed object removal is reported, and the delete still succeeds', async () => {
    state.result = { data: { id: 'post_1' }, error: null }
    state.media.data = [{ storage_path: 'ws/post_1/a.png' }]
    state.removeError = { message: 'bucket unavailable' }

    await expect(deletePost('post_1')).resolves.toEqual({ ok: true })

    expect(reportServerError).toHaveBeenCalledTimes(1)
  })

  test('a THROWING object removal is reported, and the delete still succeeds', async () => {
    state.result = { data: { id: 'post_1' }, error: null }
    state.media.data = [{ storage_path: 'ws/post_1/a.png' }]
    state.removeThrows = true

    await expect(deletePost('post_1')).resolves.toEqual({ ok: true })

    expect(reportServerError).toHaveBeenCalledTimes(1)
  })

  test('an unreadable media list does not stop the delete', async () => {
    // The orphan sweep is the backstop for bytes this read could not name.
    state.result = { data: { id: 'post_1' }, error: null }
    state.media = { data: null, error: { code: '42501' } }

    await expect(deletePost('post_1')).resolves.toEqual({ ok: true })
    expect(state.removed).toEqual([])
  })

  test('a post that went out stays on record, and the sentence offers the remedy that works', async () => {
    // The database trigger refuses to delete a published/partial/publishing post
    // (POST_HAS_PUBLISH_EVIDENCE). A P0001 raise carries no useful code, so the
    // token is matched in the message and never echoed.
    state.result = {
      data: null,
      error: { code: 'P0001', message: 'POST_HAS_PUBLISH_EVIDENCE: post has publish evidence' },
    }

    await expect(deletePost('post_1')).resolves.toEqual({
      ok: false,
      message: 'This post went out, so it stays on record. You can hide it from Posts instead.',
    })
    expect(state.removed).toEqual([])
  })
})
