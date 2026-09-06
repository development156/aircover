import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * COMMENTS ON A POST — add, remove your own, list.
 *
 * The table's own rules (members read; insert with `author` = own subject;
 * delete own only, by setting `deleted_at`) are enforced by RLS. These tests
 * pin the application half: the author is the SESSION's subject and never an
 * argument, the body is bounded before a round trip, a removal that matched no
 * row is a refusal rather than a success, and nothing is ever hard-deleted.
 */

const WS_ID = '22222222-2222-4222-8222-222222222222'
const POST = '11111111-1111-4111-8111-111111111111'
const COMMENT = '55555555-5555-4555-8555-555555555555'

interface Call {
  table: string
  op: string
  payload?: unknown
  filters: Array<[string, string, unknown]>
}

const state = vi.hoisted(() => ({
  userId: 'user_abc' as string | null,
  data: null as unknown,
  error: null as { code?: string; message: string } | null,
  calls: [] as Call[],
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ auth: () => Promise.resolve({ userId: state.userId }) }))
vi.mock('@/lib/workspaces', () => ({
  workspaceForWrite: () => Promise.resolve({ ok: true, workspace: { id: WS_ID } }),
}))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))

/** A recording query builder: every method chains, and awaiting it resolves the state. */
function builder(table: string) {
  const call: Call = { table, op: 'select', filters: [] }
  state.calls.push(call)
  const chain: Record<string, unknown> = {}
  const self = () => chain
  for (const op of ['insert', 'update', 'delete']) {
    chain[op] = (payload: unknown) => {
      call.op = op
      call.payload = payload
      return chain
    }
  }
  for (const f of ['eq', 'is', 'in']) {
    chain[f] = (column: string, value: unknown) => {
      call.filters.push([f, column, value])
      return chain
    }
  }
  chain.select = self
  chain.order = self
  chain.limit = self
  chain.single = self
  chain.maybeSingle = self
  chain.then = (resolve: (v: unknown) => void) =>
    resolve({ data: state.error ? null : state.data, error: state.error })
  return chain
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({ from: (table: string) => builder(table) }),
}))

const { addComment, removeComment, listComments } = await import('./post-comments')

const ROW = {
  id: COMMENT,
  workspace_id: WS_ID,
  post_id: POST,
  author: 'user_abc',
  body: 'Looks good.',
  created_at: '2026-09-06T10:00:00.000Z',
  deleted_at: null,
}

beforeEach(() => {
  state.userId = 'user_abc'
  state.data = null
  state.error = null
  state.calls = []
})

describe('addComment', () => {
  test('inserts with the session subject as author and returns the row', async () => {
    state.data = ROW
    const result = await addComment(POST, '  Looks good.  ')
    expect(result).toEqual({ ok: true, comment: { ...ROW, workspace_id: undefined } })
    const call = state.calls[0]
    expect(call?.table).toBe('post_comments')
    expect(call?.op).toBe('insert')
    expect(call?.payload).toEqual({
      workspace_id: WS_ID,
      post_id: POST,
      author: 'user_abc',
      body: 'Looks good.',
    })
  })

  test('an empty body is refused before any round trip', async () => {
    await expect(addComment(POST, '   ')).resolves.toEqual({
      ok: false,
      message: 'Write the comment first.',
    })
    expect(state.calls).toEqual([])
  })

  test('a body over 2000 characters is refused and the limit is named', async () => {
    const result = await addComment(POST, 'x'.repeat(2001))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('2000')
    expect(state.calls).toEqual([])
  })

  test('signed out is refused before any round trip', async () => {
    state.userId = null
    await expect(addComment(POST, 'Hi')).resolves.toEqual({
      ok: false,
      message: 'Sign in again to comment.',
    })
    expect(state.calls).toEqual([])
  })

  test('a refused insert is a sentence, not the database message', async () => {
    state.error = { code: '42501', message: 'new row violates row-level security policy' }
    const result = await addComment(POST, 'Hi')
    expect(result).toEqual({ ok: false, message: 'Sahoda could not add the comment. Try again.' })
  })
})

describe('removeComment', () => {
  test('sets deleted_at on the caller’s own row, never a hard delete', async () => {
    state.data = { id: COMMENT }
    await expect(removeComment(COMMENT)).resolves.toEqual({ ok: true })
    const call = state.calls[0]
    expect(call?.op).toBe('update')
    expect(call?.payload).toMatchObject({ deleted_at: expect.any(String) })
    expect(call?.filters).toEqual(
      expect.arrayContaining([
        ['eq', 'id', COMMENT],
        ['eq', 'author', 'user_abc'],
        ['is', 'deleted_at', null],
      ]),
    )
    expect(state.calls.some((c) => c.op === 'delete')).toBe(false)
  })

  test('no row matched is a refusal about ownership, not a success', async () => {
    state.data = null
    await expect(removeComment(COMMENT)).resolves.toEqual({
      ok: false,
      message: 'Only the person who wrote a comment can remove it.',
    })
  })
})

describe('listComments', () => {
  test('reads the post’s comments oldest first and keeps deleted rows', async () => {
    state.data = [ROW, { ...ROW, id: 'c2', deleted_at: '2026-09-06T11:00:00.000Z' }]
    const result = await listComments(POST)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.comments.map((c) => c.id)).toEqual([COMMENT, 'c2'])
      expect(result.comments[1]?.deleted_at).toBe('2026-09-06T11:00:00.000Z')
    }
    expect(state.calls[0]?.filters).toEqual(
      expect.arrayContaining([
        ['eq', 'post_id', POST],
        ['eq', 'workspace_id', WS_ID],
      ]),
    )
  })

  test('a failed read says so rather than returning an empty list', async () => {
    state.error = { code: 'XX000', message: 'boom' }
    await expect(listComments(POST)).resolves.toEqual({
      ok: false,
      message: 'Sahoda could not read the comments just now.',
    })
  })
})
