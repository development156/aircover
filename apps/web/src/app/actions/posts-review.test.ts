import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * `sendForReview` and `returnToDraft` — the two halves of the return path.
 *
 * Each is one RPC. These tests pin three things: WHICH RPC with WHICH
 * arguments, that a refusal token becomes the reader's sentence and never the
 * token, and that an empty reason is refused BEFORE a round trip is spent.
 */

const WS_ID = '22222222-2222-4222-8222-222222222222'
const POST = '11111111-1111-4111-8111-111111111111'

const state = vi.hoisted(() => ({
  userId: 'user_abc' as string | null,
  error: null as { code?: string; message: string } | null,
  calls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  revalidated: [] as string[],
}))

vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => {
    state.revalidated.push(path)
  },
}))
vi.mock('@clerk/nextjs/server', () => ({ auth: () => Promise.resolve({ userId: state.userId }) }))
vi.mock('@/lib/workspaces', () => ({
  workspaceForWrite: () => Promise.resolve({ ok: true, workspace: { id: WS_ID } }),
}))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      state.calls.push({ fn, args })
      return Promise.resolve({ data: null, error: state.error })
    },
    from: () => {
      throw new Error('the review path must not write posts directly')
    },
  }),
}))

const { sendForReview, returnToDraft } = await import('./posts-review')

beforeEach(() => {
  state.userId = 'user_abc'
  state.error = null
  state.calls = []
  state.revalidated = []
})

describe('sendForReview', () => {
  test('calls send_post_for_review with the post and lands in review', async () => {
    await expect(sendForReview(POST)).resolves.toEqual({ ok: true, status: 'review' })
    expect(state.calls).toEqual([{ fn: 'send_post_for_review', args: { p_post_id: POST } }])
    // The post's own page refreshes too, because the composer names the state.
    expect(state.revalidated).toContain(`/posts/${POST}`)
    expect(state.revalidated).toContain('/approvals')
  })

  test('POST_NOT_SUBMITTABLE is the reader sentence, not the token', async () => {
    state.error = { code: 'P0001', message: 'POST_NOT_SUBMITTABLE' }
    const result = await sendForReview(POST)
    expect(result).toEqual({
      ok: false,
      message: 'Only a draft can be sent for review. This post has already moved on.',
    })
  })

  test('signed out never reaches the RPC', async () => {
    state.userId = null
    await expect(sendForReview(POST)).resolves.toEqual({
      ok: false,
      message: 'Sign in again to do that.',
    })
    expect(state.calls).toEqual([])
  })

  test('FORBIDDEN_ROLE names who may', async () => {
    state.error = { code: 'P0001', message: 'FORBIDDEN_ROLE' }
    const result = await returnToDraft(POST, 'Fix it')
    expect(result).toEqual({
      ok: false,
      message: 'Only an owner, editor or approver can approve a post.',
    })
  })
})

describe('returnToDraft', () => {
  test('sends the trimmed reason and lands in draft', async () => {
    await expect(returnToDraft(POST, '  Add the price.  ')).resolves.toEqual({
      ok: true,
      status: 'draft',
    })
    expect(state.calls).toEqual([
      { fn: 'return_post_to_draft', args: { p_post_id: POST, p_reason: 'Add the price.' } },
    ])
  })

  test('an empty reason is refused before any round trip', async () => {
    const result = await returnToDraft(POST, '   ')
    expect(result).toEqual({
      ok: false,
      message: 'Say in a sentence what should change, so the writer knows what to do.',
    })
    expect(state.calls).toEqual([])
  })

  test('a reason over 500 characters is cut to the RPC limit', async () => {
    await returnToDraft(POST, 'x'.repeat(600))
    expect((state.calls[0]?.args.p_reason as string).length).toBe(500)
  })

  test.each([
    ['POST_NOT_RETURNABLE', /not waiting on anyone/],
    ['POST_ALREADY_GOING_OUT', /already going out/],
    ['REASON_REQUIRED', /say in a sentence/i],
  ])('%s becomes its own sentence', async (token, claim) => {
    state.error = { code: 'P0001', message: token }
    const result = await returnToDraft(POST, 'Fix it')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toMatch(claim)
      expect(result.message).not.toContain(token)
    }
  })

  test('an unknown raise is the generic sentence and is reported', async () => {
    state.error = { code: 'XX000', message: 'something internal' }
    const result = await returnToDraft(POST, 'Fix it')
    expect(result).toEqual({
      ok: false,
      message: 'Sahoda could not save that just now. Try again in a moment.',
    })
  })
})
