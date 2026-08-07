import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * `savePost`'s accepted patch only.
 *
 * The shared `PostUpdateSchema` also admits `status`, so passing it straight
 * through let a hand-rolled call to this action set `status: 'published'` — the
 * exact fabricated success state `simulatePublish` refuses to write, reachable
 * by going around the editor. Publishing is apps/jobs' to record.
 */

const WORKSPACE = '22222222-2222-4222-8222-222222222222'
const POST_ID = '11111111-1111-4111-8111-111111111111'

const state = vi.hoisted(() => ({
  /** Patches that actually reached the database. */
  updates: [] as Record<string, unknown>[],
  row: null as Record<string, unknown> | null,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => Promise.resolve({ userId: 'user_abc' }),
}))

vi.mock('@/lib/workspaces', () => ({
  getActiveWorkspace: () => Promise.resolve({ id: WORKSPACE }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        state.updates.push(patch)
        return {
          eq: () => ({
            select: () => ({
              maybeSingle: () => Promise.resolve({ data: state.row, error: null }),
            }),
          }),
        }
      },
    }),
  }),
}))

const { savePost } = await import('./posts')

function storedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: POST_ID,
    workspace_id: WORKSPACE,
    title: 'Morning chai',
    body: 'Fresh chai.',
    status: 'draft',
    channels: ['x'],
    scheduled_at: null,
    origin: 'manual',
    created_by: 'user_abc',
    created_at: '2026-07-19T00:00:00.000Z',
    updated_at: '2026-07-19T00:00:01.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  state.updates = []
  state.row = storedRow()
})

describe('savePost accepted patch', () => {
  test('saves the fields the editor actually sends', async () => {
    const result = await savePost(POST_ID, {
      title: 'Morning chai',
      body: 'Fresh chai.',
      channels: ['x'],
      scheduled_at: null,
    })

    expect(result.ok).toBe(true)
    expect(state.updates).toHaveLength(1)
  })

  test('refuses a patch carrying status, rather than silently dropping it', async () => {
    const result = await savePost(POST_ID, { body: 'Fresh chai.', status: 'published' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/not valid/i)
  })

  test('never lets status reach the database', async () => {
    // The load-bearing assertion: a rejected patch must not be a partial write.
    await savePost(POST_ID, { body: 'Fresh chai.', status: 'published' })

    expect(state.updates).toEqual([])
  })

  test('rejects a status-only patch too', async () => {
    await savePost(POST_ID, { status: 'published' })

    expect(state.updates).toEqual([])
  })

  test('rejects unknown keys instead of writing them', async () => {
    const result = await savePost(POST_ID, { body: 'Fresh chai.', workspace_id: 'other-ws' })

    expect(result.ok).toBe(false)
    expect(state.updates).toEqual([])
  })

  test('returns the server updated_at so the editor can spot divergence', async () => {
    state.row = storedRow({ updated_at: '2026-07-19T09:00:00.000Z' })

    const result = await savePost(POST_ID, { body: 'Fresh chai.' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.updatedAt).toBe('2026-07-19T09:00:00.000Z')
  })
})
