import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * WHAT A WRITE PATH REFUSES WITH.
 *
 * Run 23 audited the write actions and marked them CORRECT, on the grounds that
 * a mutation refuses on both arms so collapsing them costs it nothing. That is
 * true of the DECISION and false of the SENTENCE: all twenty-three refused with
 * "Create a workspace first.", and on the unreadable arm that is a remedy the
 * customer cannot carry out. They have a workspace; a second one would not help.
 *
 * Every claim in this file is about the words, not the write. Nothing may be
 * written on either arm and nothing is.
 */

const state = vi.hoisted(() => ({ rows: [] as unknown, error: null as unknown, threw: false }))

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => {
    if (state.threw) throw new Error('env missing')
    return {
      from: () => ({
        select: () => ({ order: () => Promise.resolve({ data: state.rows, error: state.error }) }),
      }),
    }
  },
}))

const { workspaceForWrite, WRITE_NO_WORKSPACE, WRITE_WORKSPACE_UNREADABLE } =
  await import('@/lib/workspaces')

beforeEach(() => {
  state.rows = []
  state.error = null
  state.threw = false
})

describe('workspaceForWrite', () => {
  test('hands back the workspace when there is one', async () => {
    state.rows = [{ id: 'ws_1', name: 'Corner Bakery', slug: 'corner-bakery' }]

    // `toMatchObject`, not `toEqual`. The claim is WHICH workspace comes back,
    // not how many columns a `Workspace` carries: the row grew `timezone` and
    // `createdBy` when the shell learned to prefer the workspace you created,
    // and an exact-shape assertion here would fail every such widening while
    // saying nothing about the behaviour it is named for.
    await expect(workspaceForWrite()).resolves.toMatchObject({
      ok: true,
      workspace: { id: 'ws_1', name: 'Corner Bakery', slug: 'corner-bakery' },
    })
  })

  test('refuses with the real remedy when the account has none', async () => {
    state.rows = []

    await expect(workspaceForWrite()).resolves.toEqual({
      ok: false,
      message: WRITE_NO_WORKSPACE,
    })
  })

  test('never says "create a workspace" when the read failed', async () => {
    state.error = { code: '08006', message: 'connection refused' }

    const refusal = await workspaceForWrite()

    expect(refusal.ok).toBe(false)
    // THE CLAIM. This is what every write action said to a customer who already
    // had a workspace, whenever a query hiccuped.
    if (refusal.ok) throw new Error('expected a refusal')
    expect(refusal.message).not.toMatch(/create a workspace/i)
    expect(refusal.message).toBe(WRITE_WORKSPACE_UNREADABLE)
  })

  test('a throw is unreadable too, not an empty account', async () => {
    state.threw = true

    const refusal = await workspaceForWrite()

    if (refusal.ok) throw new Error('expected a refusal')
    expect(refusal.message).toBe(WRITE_WORKSPACE_UNREADABLE)
  })

  test('the two refusals are not the same refusal', async () => {
    state.rows = []
    const none = await workspaceForWrite()
    state.error = { code: '08006', message: 'connection refused' }
    const unreadable = await workspaceForWrite()

    if (none.ok || unreadable.ok) throw new Error('expected two refusals')
    expect(none.message).not.toBe(unreadable.message)
  })
})
