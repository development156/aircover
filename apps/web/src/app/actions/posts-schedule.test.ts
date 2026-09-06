import { revalidatePath } from 'next/cache'
import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * `schedulePost` and what it refuses.
 *
 * MEASURED 2026-09-06 on the preview: an empty "Untitled post" with no channels
 * and no body was scheduled from the composer, and the planner row then read
 * "Scheduled" with "Goes out on its own at this time." Nothing can go out with
 * zero channels: the dispatcher has nothing to send to. The RPC checks the role
 * and the publish state, not the channel list, so this action has to.
 */

const WS_ID = '22222222-2222-4222-8222-222222222222'
const POST_ID = '11111111-1111-4111-8111-111111111111'
const WHEN = '2026-09-10T09:00:00.000Z'

const state = vi.hoisted(() => ({
  post: null as { id: string; channels: string[] } | null,
  rpcCalls: [] as { fn: string; args: Record<string, unknown> }[],
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ auth: () => Promise.resolve({ userId: 'user_abc' }) }))
vi.mock('@/lib/workspaces', () => ({
  workspaceForWrite: () => Promise.resolve({ ok: true, workspace: { id: WS_ID } }),
}))
vi.mock('@/lib/posts/read', () => ({ getPost: () => Promise.resolve(state.post) }))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args })
      return Promise.resolve({ data: { scheduled_at: WHEN }, error: null })
    },
  }),
}))

const { schedulePost, cancelSchedule } = await import('./posts-schedule')

beforeEach(() => {
  vi.clearAllMocks()
  state.post = { id: POST_ID, channels: ['x'] }
  state.rpcCalls = []
})

describe('schedulePost needs a channel', () => {
  test('a post with no channels is refused, and the RPC is never called', async () => {
    state.post = { id: POST_ID, channels: [] }

    const result = await schedulePost(POST_ID, WHEN, false)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/at least one channel/i)
    expect(state.rpcCalls).toEqual([])
  })

  test('a post with a channel is released (the control)', async () => {
    const result = await schedulePost(POST_ID, WHEN, false)

    expect(result).toEqual({ ok: true, scheduledAt: WHEN })
    expect(state.rpcCalls.map((call) => call.fn)).toEqual(['release_post_for_publish'])
  })
})

describe('the surfaces a schedule change refreshes', () => {
  test('scheduling refreshes Approvals and Home, not only Posts and the planner', async () => {
    await schedulePost(POST_ID, WHEN, false)

    for (const path of ['/posts', '/planner', '/approvals', '/home', `/posts/${POST_ID}`]) {
      expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith(path)
    }
  })

  test('cancelling does the same', async () => {
    await cancelSchedule(POST_ID)

    for (const path of ['/posts', '/planner', '/approvals', '/home', `/posts/${POST_ID}`]) {
      expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith(path)
    }
  })
})
