import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * ONE NULL, TWO MEANINGS — the class, pinned at every reader that carried it.
 *
 * The defect this file exists to prevent has now shipped four times in this
 * codebase, each time telling a user something had broken when nothing had:
 *
 *   run 9   /analytics       "couldn't read" with no account connected
 *   run 9   /home Instagram  the same, in a second component
 *   run 22  /connections     "couldn't check your connections" with no workspace
 *   run 23  the topbar       "Create workspace" over a workspace that exists
 *
 * Every one had the same root: a read returns one empty value for BOTH "this
 * broke" and "there is nothing here", and the UI branches on that single value.
 * The remedy it then offers — reload, try again, create one — cannot work,
 * because the thing it proposes to fix is not what happened.
 *
 * Each test below drives the SAME reader with the two workspace answers that
 * used to be indistinguishable, and asserts they come back distinguishable. The
 * `no query was issued` assertions matter as much as the verdicts: a reader that
 * queries with a workspace it could not identify is asking about the wrong
 * tenant, or about nothing at all.
 */

const state = vi.hoisted(() => ({
  /** 'ok' | 'none' | 'unreadable' — what the workspace read answered. */
  workspace: 'ok' as 'ok' | 'none' | 'unreadable',
  /** Every `.from()` a reader reached for. Must stay empty on both bad paths. */
  tables: [] as string[],
}))

vi.mock('server-only', () => ({}))

vi.mock('@/lib/workspaces', () => ({
  activeWorkspaceRead: () =>
    Promise.resolve(
      state.workspace === 'ok'
        ? { status: 'ok', workspace: { id: 'ws_1', name: 'W', slug: 'w' } }
        : { status: state.workspace === 'none' ? 'none' : 'unreadable' },
    ),
  getActiveWorkspace: () =>
    Promise.resolve(state.workspace === 'ok' ? { id: 'ws_1', name: 'W', slug: 'w' } : null),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from(table: string) {
      state.tables.push(table)
      const builder: Record<string, unknown> = {}
      for (const key of ['select', 'order', 'eq', 'not', 'in', 'gte', 'lte']) {
        builder[key] = () => builder
      }
      builder.limit = () => Promise.resolve({ data: [], error: null })
      builder.maybeSingle = () => Promise.resolve({ data: null, error: null })
      builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null })
      return builder
    },
  }),
}))

import { readConnections, readConnectedChannels } from '@/lib/connections/read'
import { readLoop } from '@/lib/loop/read'
import { readPosts } from '@/lib/posts/read'
import { readRecentSites } from '@/lib/sites/read'

beforeEach(() => {
  state.workspace = 'ok'
  state.tables = []
})

describe.each([
  ['readPosts', () => readPosts()],
  ['readConnections', () => readConnections()],
  ['readConnectedChannels', () => readConnectedChannels()],
  ['readRecentSites', () => readRecentSites()],
  // Added run 27. /loop and /report resolved their workspace with
  // `getActiveWorkspace()` — the LOSSY view, whose own doc comment says a
  // rendered sentence must not use it — and both printed "Finish setting up
  // your workspace" on the arm where the read had FAILED. `readLoop` replaces
  // it, and the query-error arm these four cannot express is pinned separately
  // in `lib/loop/read.test.ts`.
  ['readLoop', () => readLoop()],
])('%s tells "you have none" apart from "we could not look"', (_name, read) => {
  test('an account with no workspace reads no-workspace', async () => {
    state.workspace = 'none'

    await expect(read()).resolves.toMatchObject({ status: 'no-workspace' })
    // Nothing to ask, and nothing was asked.
    expect(state.tables).toEqual([])
  })

  test('a workspace read that failed reads unreadable, never no-workspace', async () => {
    state.workspace = 'unreadable'

    // THE WHOLE CLAIM. `no-workspace` here would put "Create a workspace" in
    // front of a founder who has one, and `ok: []` would report an empty
    // account — two different false statements from the same missing branch.
    await expect(read()).resolves.toMatchObject({ status: 'unreadable' })
    expect(state.tables).toEqual([])
  })

  test('the two answers are not the same answer', async () => {
    // Belt and braces: the pair above could both pass against a reader that
    // returned a constant if someone later "simplified" the union.
    state.workspace = 'none'
    const none = await read()
    state.workspace = 'unreadable'
    const unreadable = await read()

    expect(none.status).not.toEqual(unreadable.status)
  })
})
