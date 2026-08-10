import { beforeEach, describe, expect, test, vi } from 'vitest'
import { NOT_RESCHEDULABLE_STATUSES } from '@sahoda/shared'

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
      // The status read `savePost` makes before it will move a schedule.
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({ data: state.row ? { status: state.row.status } : null, error: null }),
        }),
      }),
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

/**
 * A date field that silently does nothing is a fake success.
 *
 * `savePost` accepts `scheduled_at` and writes it with a bare UPDATE. `posts.status` is
 * excluded on purpose — that guard is right and stays — but the consequence was that a
 * date could be written onto a TERMINAL post: the row got the new time, the action
 * returned ok, the editor showed it saved, and `isDispatchable` still refused the post
 * forever because the status never left `expired`.
 *
 * Observed 2026-08-10: posts 2a080a2a and 2c279329 carried a fresh `scheduled_at` while
 * still `expired`, and the empty cron baseline was the only symptom.
 *
 * The statuses come from `NOT_RESCHEDULABLE_STATUSES` rather than being typed out here.
 * Listing them again would have made this the FOURTH copy of a rule that already had
 * three — and a test carrying its own copy is the worst of them, because it would keep
 * passing against the list it agrees with while the product used a different one.
 * `packages/db/tests/schedule_guard_parity.test.ts` holds the two SQL guards to the
 * same constant.
 */
describe('savePost refuses to move a schedule it cannot honour', () => {
  test.each(NOT_RESCHEDULABLE_STATUSES)(
    'refuses a scheduled_at change on a %s post, and says why',
    async (status) => {
      state.row = storedRow({ status })

      const result = await savePost(POST_ID, { scheduled_at: '2026-09-01T10:00:00.000Z' })

      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('expected a refusal')
      expect(result.message).toMatch(/published or closed/i)
      // The refusal has to reach the DATABASE too — a message alone, with the row
      // still written, is the same fake success wearing different words.
      expect(state.updates).toEqual([])
    },
  )

  test('still allows other edits on a terminal post', async () => {
    // Fixing a typo on an expired post is legitimate. Only the SCHEDULE is refused,
    // because only the schedule makes a promise the dispatcher cannot keep.
    state.row = storedRow({ status: 'expired' })

    const result = await savePost(POST_ID, { title: 'Corrected title' })

    expect(result.ok).toBe(true)
    expect(state.updates).toEqual([{ title: 'Corrected title' }])
  })

  test('still allows a schedule change on a live post', async () => {
    state.row = storedRow({ status: 'draft' })

    const result = await savePost(POST_ID, { scheduled_at: '2026-09-01T10:00:00.000Z' })

    expect(result.ok).toBe(true)
    expect(state.updates).toEqual([{ scheduled_at: '2026-09-01T10:00:00.000Z' }])
  })
})
