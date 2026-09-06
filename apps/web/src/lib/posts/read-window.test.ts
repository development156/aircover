import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * THE CALENDAR MUST NOT DEPEND ON THE 100 MOST RECENTLY EDITED POSTS.
 *
 * `readPosts` is capped at `LIST_LIMIT` and ordered by `updated_at`, which is
 * the right shape for a list and the wrong one for a calendar: a post scheduled
 * for Thursday that has not been touched since a hundred other edits simply
 * fell off the week. Nothing on the screen said so. `readPostsInWindow` asks
 * the question a calendar actually has — everything with a time inside these
 * days — and `readUndatedCount` asks the one the off-grid note has.
 *
 * These pin the QUERY SHAPE (the columns filtered, the order, the cap) and the
 * three-way answer, against a recording client. Nothing here reaches Postgres.
 */

const state = vi.hoisted(() => ({
  workspace: 'ok' as 'ok' | 'none' | 'unreadable',
  calls: [] as { method: string; args: unknown[] }[],
  answer: { data: [] as unknown[], error: null as null | { code: string; message: string } },
  count: 0 as number | null,
}))

vi.mock('server-only', () => ({}))

vi.mock('@/lib/workspaces', () => ({
  activeWorkspaceRead: () =>
    Promise.resolve(
      state.workspace === 'ok'
        ? {
            status: 'ok',
            workspace: { id: '22222222-2222-4222-8222-222222222222', name: 'W', slug: 'w' },
          }
        : { status: state.workspace === 'none' ? 'none' : 'unreadable' },
    ),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from(table: string) {
      state.calls.push({ method: 'from', args: [table] })
      const builder: Record<string, unknown> = {}
      for (const key of ['select', 'order', 'eq', 'in', 'gte', 'lt', 'lte', 'is', 'not']) {
        builder[key] = (...args: unknown[]) => {
          state.calls.push({ method: key, args })
          return builder
        }
      }
      builder.limit = (...args: unknown[]) => {
        state.calls.push({ method: 'limit', args })
        return Promise.resolve(state.answer)
      }
      // A `head: true` count resolves without `.limit`.
      builder.then = (resolve: (v: unknown) => unknown) =>
        resolve({ data: null, error: state.answer.error, count: state.count })
      return builder
    },
  }),
}))

const { readPostsInWindow, readUndatedCount, WINDOW_LIMIT } = await import('@/lib/posts/read')

const ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  workspace_id: '22222222-2222-4222-8222-222222222222',
  title: 'Old but scheduled',
  body: null,
  status: 'scheduled',
  channels: ['x'],
  scheduled_at: '2026-09-10T09:00:00.000Z',
  origin: 'manual',
  created_by: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

const FROM = '2026-09-06T00:00:00.000Z'
const TO = '2026-09-15T00:00:00.000Z'

beforeEach(() => {
  state.workspace = 'ok'
  state.calls = []
  state.answer = { data: [ROW], error: null }
  state.count = 0
})

describe('readPostsInWindow', () => {
  test('filters on scheduled_at inside [from, to), ordered by time, capped at a sane thousand', async () => {
    const read = await readPostsInWindow(FROM, TO)

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.posts.map((p) => p.id)).toEqual([ROW.id])

    const by = (method: string) => state.calls.filter((c) => c.method === method).map((c) => c.args)
    expect(by('from')).toEqual([['posts']])
    expect(by('eq')).toEqual([['workspace_id', '22222222-2222-4222-8222-222222222222']])
    expect(by('gte')).toEqual([['scheduled_at', FROM]])
    expect(by('lt')).toEqual([['scheduled_at', TO]])
    expect(by('order')).toEqual([['scheduled_at', { ascending: true }]])
    // NOT `LIST_LIMIT`. A hundred is a page; a calendar window is the whole window.
    expect(WINDOW_LIMIT).toBe(1000)
    expect(by('limit')).toEqual([[WINDOW_LIMIT]])
  })

  test('refuses an unparseable bound rather than asking Postgres to guess', async () => {
    const read = await readPostsInWindow('not a date', TO)

    expect(read).toEqual({ status: 'unreadable' })
    expect(state.calls).toEqual([])
  })

  test('tells "no workspace" apart from "could not look" — same three answers as readPosts', async () => {
    state.workspace = 'none'
    await expect(readPostsInWindow(FROM, TO)).resolves.toEqual({ status: 'no-workspace' })
    expect(state.calls).toEqual([])

    state.workspace = 'unreadable'
    await expect(readPostsInWindow(FROM, TO)).resolves.toEqual({ status: 'unreadable' })
    expect(state.calls).toEqual([])
  })

  test('a query error is unreadable, never an empty week', async () => {
    state.answer = { data: [], error: { code: '57014', message: 'timeout' } }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(readPostsInWindow(FROM, TO)).resolves.toEqual({ status: 'unreadable' })

    spy.mockRestore()
  })

  test('drops a row the contract cannot parse instead of failing the whole window', async () => {
    state.answer = { data: [ROW, { id: 'bad', status: 'nope' }], error: null }

    const read = await readPostsInWindow(FROM, TO)

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.posts).toHaveLength(1)
  })
})

describe('readUndatedCount', () => {
  test('counts posts with no scheduled_at in the active workspace, without fetching rows', async () => {
    state.count = 7

    await expect(readUndatedCount()).resolves.toBe(7)

    const select = state.calls.find((c) => c.method === 'select')
    expect(select?.args[1]).toMatchObject({ count: 'exact', head: true })
    expect(state.calls.filter((c) => c.method === 'is').map((c) => c.args)).toEqual([
      ['scheduled_at', null],
    ])
    expect(state.calls.filter((c) => c.method === 'eq').map((c) => c.args)).toEqual([
      ['workspace_id', '22222222-2222-4222-8222-222222222222'],
    ])
  })

  test('null when there is no answer — a zero would claim every post has a date', async () => {
    state.workspace = 'none'
    await expect(readUndatedCount()).resolves.toBeNull()

    state.workspace = 'ok'
    state.count = null
    await expect(readUndatedCount()).resolves.toBeNull()

    state.answer = { data: [], error: { code: '57014', message: 'timeout' } }
    state.count = 3
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(readUndatedCount()).resolves.toBeNull()
    spy.mockRestore()
  })
})
