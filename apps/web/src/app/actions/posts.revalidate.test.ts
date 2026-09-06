import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * `createPost` and `savePost` must revalidate /home.
 *
 * MEASURED 2026-09-06 on the wt-core preview: a post's title was changed, the
 * browser went Back to /home, and the dashboard rendered the OLD title in both
 * the queue card and the week strip — the router cache served the previous
 * render. `approvals.ts` revalidates /home after a decision; the composer's two
 * writes did not, so a draft written and then returned from could be missing
 * from the greeting's count and the week's calendar until a full reload.
 */

const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  revalidated: [] as string[],
}))

vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => {
    state.revalidated.push(path)
  },
}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => Promise.resolve({ userId: 'user_abc' }),
}))

vi.mock('@/lib/workspaces', () => ({
  workspaceForWrite: async () => ({
    ok: true,
    workspace: { id: '22222222-2222-4222-8222-222222222222', name: 'W', slug: 'w', timezone: null },
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: () => ({
      insert: () => ({
        select: () => ({ single: () => Promise.resolve({ data: state.row, error: null }) }),
      }),
      update: () => ({
        eq: () => ({
          select: () => ({ maybeSingle: () => Promise.resolve({ data: state.row, error: null }) }),
        }),
      }),
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: { status: 'draft' }, error: null }),
        }),
      }),
    }),
  }),
}))

const { createPost, savePost } = await import('./posts')

const ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  workspace_id: '22222222-2222-4222-8222-222222222222',
  title: 'Tuesday roast',
  body: '',
  status: 'draft',
  channels: [],
  scheduled_at: null,
  origin: 'manual',
  created_by: 'user_abc',
  created_at: '2026-09-06T05:00:00.000Z',
  updated_at: '2026-09-06T05:00:00.000Z',
}

beforeEach(() => {
  state.row = ROW
  state.revalidated = []
})

describe('the composer keeps /home current', () => {
  test('creating a post revalidates the dashboard', async () => {
    const result = await createPost('Tuesday roast')
    expect(result.ok).toBe(true)
    expect(state.revalidated).toContain('/home')
  })

  test('saving a post revalidates the dashboard', async () => {
    const result = await savePost(ROW.id, { title: 'Tuesday roast, again' })
    expect(result.ok).toBe(true)
    expect(state.revalidated).toContain('/home')
  })
})
