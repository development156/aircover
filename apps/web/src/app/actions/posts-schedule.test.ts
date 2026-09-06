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
// A day ahead of the real clock: the action now checks the lead against
// `new Date()`, so a literal future date would start failing the day it passed.
const WHEN = new Date(Date.now() + 86_400_000).toISOString()

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

describe('schedulePost checks the lead on the server', () => {
  /**
   * The lead check lived in `ScheduleField` only — CLIENT-side, and the row's
   * own header admitted it: "Server-side lead validation is still a filed ask."
   * Anything that calls the action directly, or a stale tab, could book a time
   * already gone. The validator is the one in `lib/posts/schedule.ts`, so the
   * sentence is the same one the picker shows.
   */
  test('a time in the past is refused with the validator’s sentence, and the RPC is never called', async () => {
    const past = new Date(Date.now() - 60_000).toISOString()

    const result = await schedulePost(POST_ID, past, false)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/at least 5 minutes from now/i)
    expect(state.rpcCalls).toEqual([])
  })

  test('a time inside a picked channel’s lead is refused too', async () => {
    const soon = new Date(Date.now() + 2 * 60_000).toISOString()

    const result = await schedulePost(POST_ID, soon, true)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/at least 5 minutes from now/i)
    expect(state.rpcCalls).toEqual([])
  })

  test('a time past the lead is released (the control)', async () => {
    const clear = new Date(Date.now() + 10 * 60_000).toISOString()

    const result = await schedulePost(POST_ID, clear, false)

    expect(result.ok).toBe(true)
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
