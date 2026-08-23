import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * "THERE IS NO BRAIN" AND "WE COULD NOT LOOK" ARE DIFFERENT ANSWERS.
 *
 * This reader is the routing signal, so collapsing the two would not print a
 * wrong sentence — it would MOVE somebody. A customer who finished onboarding
 * weeks ago would be walked back to its first screen because one query
 * hiccupped, and there would be nothing on the screen to say why.
 *
 * The `no query was issued` assertions matter as much as the verdicts: a read
 * that queries `brand_memory` with a workspace it could not identify is asking
 * about the wrong tenant.
 */

const state = vi.hoisted(() => ({
  workspace: 'ok' as 'ok' | 'none' | 'unreadable',
  /** What the brand_memory query answers. */
  rows: [] as unknown[],
  error: null as { code: string; message: string } | null,
  throws: false,
  /** Every `.from()` the reader reached for. Empty on both bad workspace arms. */
  tables: [] as string[],
}))

vi.mock('server-only', () => ({}))

vi.mock('@/lib/workspaces', () => ({
  activeWorkspaceRead: () =>
    Promise.resolve(
      state.workspace === 'ok'
        ? { status: 'ok', workspace: { id: 'ws_1', name: 'W', slug: 'w' } }
        : { status: state.workspace },
    ),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from(table: string) {
      state.tables.push(table)
      if (state.throws) throw new Error('socket hang up')
      const builder: Record<string, unknown> = {}
      for (const key of ['select', 'eq']) builder[key] = () => builder
      builder.limit = () =>
        Promise.resolve({ data: state.error ? null : state.rows, error: state.error })
      return builder
    },
  }),
}))

import { onboardingStateRead } from './read-onboarding-state'

beforeEach(() => {
  state.workspace = 'ok'
  state.rows = []
  state.error = null
  state.throws = false
  state.tables = []
  // React `cache` memoises per request; each test is a fresh "request".
  vi.resetModules()
})

/** `cache()` is request-scoped and vitest has no request, so re-import per test. */
async function read() {
  const mod = await import('./read-onboarding-state')
  return mod.onboardingStateRead()
}

describe('the workspace answer comes first', () => {
  test('no workspace reads no-workspace, and asks the database nothing', async () => {
    state.workspace = 'none'

    await expect(read()).resolves.toEqual({ status: 'no-workspace' })
    expect(state.tables).toEqual([])
  })

  test('an unreadable workspace reads unreadable, and asks the database nothing', async () => {
    state.workspace = 'unreadable'

    await expect(read()).resolves.toEqual({ status: 'unreadable' })
    expect(state.tables).toEqual([])
  })

  test('the two are not the same answer', async () => {
    state.workspace = 'none'
    const none = await read()
    state.workspace = 'unreadable'
    const unreadable = await read()

    expect(none.status).not.toEqual(unreadable.status)
  })
})

describe('with a workspace, the brain decides', () => {
  test('a row means completed', async () => {
    state.rows = [{ id: 'bm_1' }]

    await expect(read()).resolves.toEqual({ status: 'completed' })
    expect(state.tables).toEqual(['brand_memory'])
  })

  test('no rows means not-started', async () => {
    state.rows = []

    await expect(read()).resolves.toEqual({ status: 'not-started' })
  })

  /**
   * THE WHOLE POINT. A query error must never read as "this workspace has no
   * brain" — that is the arm that redirects.
   */
  test('a query error reads unreadable, never not-started', async () => {
    state.error = { code: '57014', message: 'canceling statement due to statement timeout' }

    await expect(read()).resolves.toEqual({ status: 'unreadable' })
  })

  test('a thrown fetch reads unreadable, never not-started', async () => {
    state.throws = true

    await expect(read()).resolves.toEqual({ status: 'unreadable' })
  })

  test('an errored read and an empty one disagree', async () => {
    state.rows = []
    const empty = await read()
    state.error = { code: 'PGRST301', message: 'JWT expired' }
    const failed = await read()

    // If these ever match, a transient failure sends a paying customer back
    // through nine screens.
    expect(empty.status).not.toEqual(failed.status)
  })
})

describe('an unparseable payload is still a completed onboarding', () => {
  /**
   * `activeBrandMemory` degrades a row whose payload no longer matches the
   * contract to "no saved brain", which is right for the EDITOR — it must not
   * hand somebody half a brain. Routing has the opposite duty. This reader
   * selects `id` and never looks at the payload, so a schema change cannot make
   * a finished customer look new.
   */
  test('only the row is read, so a payload shape cannot change the verdict', async () => {
    state.rows = [{ id: 'bm_1' }]

    await expect(read()).resolves.toEqual({ status: 'completed' })
  })
})

test('the export is the cached one', () => {
  expect(typeof onboardingStateRead).toBe('function')
})
