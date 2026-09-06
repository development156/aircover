import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * THE READS BEHIND THE QUEUE'S CONTEXT AND THE POST PAGE'S HISTORY.
 *
 * Each read degrades to `null`, never to an empty map: "no history" and "the
 * history could not be read" are different sentences on the screen, and a
 * failed read rendered as an empty list is the shape that makes a false claim
 * look designed. Every read is scoped to the active workspace on top of RLS.
 */

const WS_ID = '22222222-2222-4222-8222-222222222222'
const P1 = '11111111-1111-4111-8111-111111111111'
const P2 = '33333333-3333-4333-8333-333333333333'

interface Call {
  table: string
  filters: Array<[string, string, unknown]>
  order?: unknown
}

const state = vi.hoisted(() => ({
  userId: 'user_abc' as string | null,
  workspace: { status: 'ok', workspace: { id: '22222222-2222-4222-8222-222222222222' } } as unknown,
  role: 'approver' as string | null,
  data: [] as unknown,
  error: null as { message: string } | null,
  calls: [] as Call[],
  media: new Map<string, unknown[]>() as Map<string, unknown[]> | null,
}))

vi.mock('@clerk/nextjs/server', () => ({ auth: () => Promise.resolve({ userId: state.userId }) }))
vi.mock('@/lib/workspaces', () => ({
  activeWorkspaceRead: () => Promise.resolve(state.workspace),
}))
vi.mock('@/lib/workspace-role', () => ({
  getWorkspaceRole: () => Promise.resolve(state.role),
}))
vi.mock('@/lib/posts/read', () => ({
  listPostMedia: () => Promise.resolve(state.media),
}))
vi.mock('@/lib/posts/media-url', () => ({
  signMediaPreviews: (rows: Array<{ id: string }>) =>
    Promise.resolve(rows.map((row) => ({ id: row.id, url: `signed:${row.id}` }))),
}))

function builder(table: string) {
  const call: Call = { table, filters: [] }
  state.calls.push(call)
  const chain: Record<string, unknown> = {}
  for (const f of ['eq', 'in', 'is']) {
    chain[f] = (column: string, value: unknown) => {
      call.filters.push([f, column, value])
      return chain
    }
  }
  chain.select = () => chain
  chain.order = (column: string, opts: unknown) => {
    call.order = [column, opts]
    return chain
  }
  chain.limit = () => chain
  chain.then = (resolve: (v: unknown) => void) =>
    resolve({ data: state.error ? null : state.data, error: state.error })
  return chain
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({ from: (table: string) => builder(table) }),
}))

const { readApprovals, readComments, readReviewer, readQueueThumbnails, readVariantBodies } =
  await import('./history')

beforeEach(() => {
  state.userId = 'user_abc'
  state.workspace = { status: 'ok', workspace: { id: WS_ID } }
  state.role = 'approver'
  state.data = []
  state.error = null
  state.calls = []
  state.media = new Map()
})

describe('readApprovals', () => {
  test('groups the rows by post, newest first, scoped to the workspace', async () => {
    state.data = [
      {
        id: 'a1',
        post_id: P1,
        actor: 'u',
        decision: 'submitted',
        reason: null,
        created_at: '2026-09-01T00:00:00Z',
      },
      {
        id: 'a2',
        post_id: P1,
        actor: 'u',
        decision: 'returned',
        reason: 'Add a photo',
        created_at: '2026-09-02T00:00:00Z',
      },
      {
        id: 'a3',
        post_id: P2,
        actor: 'v',
        decision: 'approved',
        reason: null,
        created_at: '2026-09-03T00:00:00Z',
      },
      { id: 'junk', post_id: P2, actor: 'v', decision: 'deleted', reason: null, created_at: 'x' },
    ]
    const groups = await readApprovals([P1, P2])
    expect(groups?.get(P1)?.map((r) => r.id)).toEqual(['a2', 'a1'])
    expect(groups?.get(P2)?.map((r) => r.id)).toEqual(['a3'])
    expect(state.calls[0]?.table).toBe('post_approvals')
    expect(state.calls[0]?.filters).toEqual(
      expect.arrayContaining([
        ['eq', 'workspace_id', WS_ID],
        ['in', 'post_id', [P1, P2]],
      ]),
    )
  })

  test('no ids is an empty map with no round trip', async () => {
    const groups = await readApprovals([])
    expect(groups?.size).toBe(0)
    expect(state.calls).toEqual([])
  })

  test('a failed read is null, not an empty map', async () => {
    state.error = { message: 'boom' }
    expect(await readApprovals([P1])).toBeNull()
  })

  test('no workspace is null', async () => {
    state.workspace = { status: 'none' }
    expect(await readApprovals([P1])).toBeNull()
    expect(state.calls).toEqual([])
  })
})

describe('readComments', () => {
  test('oldest first per post, and a per-post cap keeps the LAST ones', async () => {
    state.data = [
      {
        id: 'c1',
        post_id: P1,
        author: 'u',
        body: 'one',
        created_at: '2026-09-01T00:00:00Z',
        deleted_at: null,
      },
      {
        id: 'c2',
        post_id: P1,
        author: 'u',
        body: 'two',
        created_at: '2026-09-02T00:00:00Z',
        deleted_at: null,
      },
      {
        id: 'c3',
        post_id: P1,
        author: 'u',
        body: 'three',
        created_at: '2026-09-03T00:00:00Z',
        deleted_at: null,
      },
      {
        id: 'c4',
        post_id: P1,
        author: 'u',
        body: 'four',
        created_at: '2026-09-04T00:00:00Z',
        deleted_at: null,
      },
    ]
    const all = await readComments([P1])
    expect(all?.get(P1)?.map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c4'])
    const last3 = await readComments([P1], 3)
    expect(last3?.get(P1)?.map((c) => c.id)).toEqual(['c2', 'c3', 'c4'])
  })

  test('a failed read is null', async () => {
    state.error = { message: 'boom' }
    expect(await readComments([P1])).toBeNull()
  })
})

describe('readReviewer', () => {
  test('the caller and their role in the active workspace', async () => {
    await expect(readReviewer()).resolves.toEqual({ userId: 'user_abc', role: 'approver' })
  })

  test('no workspace means no role, and the user is still named', async () => {
    state.workspace = { status: 'none' }
    await expect(readReviewer()).resolves.toEqual({ userId: 'user_abc', role: null })
  })

  test('signed out is null on both', async () => {
    state.userId = null
    await expect(readReviewer()).resolves.toEqual({ userId: null, role: null })
  })
})

describe('readQueueThumbnails', () => {
  test('signs the FIRST media row per post and maps it by post id', async () => {
    state.media = new Map([
      [
        P1,
        [
          { id: 'm1', storage_path: 'w/p1/a.jpg' },
          { id: 'm2', storage_path: 'w/p1/b.jpg' },
        ],
      ],
    ])
    const thumbs = await readQueueThumbnails([P1, P2])
    expect(thumbs?.get(P1)).toBe('signed:m1')
    expect(thumbs?.has(P2)).toBe(false)
  })

  test('an unreadable media list is null', async () => {
    state.media = null
    expect(await readQueueThumbnails([P1])).toBeNull()
  })
})

describe('readVariantBodies', () => {
  test('one list per post, in channel order as stored', async () => {
    state.data = [
      { post_id: P1, channel: 'x', body: 'short' },
      { post_id: P1, channel: 'linkedin', body: 'long' },
    ]
    const bodies = await readVariantBodies([P1])
    expect(bodies?.get(P1)).toEqual([
      { channel: 'x', body: 'short' },
      { channel: 'linkedin', body: 'long' },
    ])
    expect(state.calls[0]?.table).toBe('post_variants')
  })

  test('a failed read is null', async () => {
    state.error = { message: 'boom' }
    expect(await readVariantBodies([P1])).toBeNull()
  })
})
