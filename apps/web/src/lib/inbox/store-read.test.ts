import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * READING A STORED THREAD BY OUR OWN ROW ID.
 *
 * ── WHY THIS ID IS SAFE TO ACCEPT AND THE ACCOUNT ID IS NOT ──────────────────
 * A live thread is `(accountId, conversationId)` because Zernio resolves a
 * conversation only within an account, and its profile filter defaults to every
 * profile on the API key: half a key reads another tenant. A stored thread is a row
 * in THIS database, so the id is a query FILTER against this workspace's own rows
 * and a foreign one simply matches nothing.
 *
 * "Matches nothing" is the property this file proves, because it is what the route's
 * 404 rests on. A `maybeSingle()` that forgot the `workspace_id` filter would pass
 * every other test in the codebase and hand one tenant another's conversation.
 */

interface Row {
  id: string
  workspace_id: string
  channel: string
  platform_thread_id: string
  author_name: string | null
  author_handle: string | null
  body: string | null
  posted_at: string | null
  status: string
  kind: string
}

const state = vi.hoisted(() => ({
  workspace: 'ws-1' as string | null,
  threads: [] as Record<string, unknown>[],
  messages: [] as Record<string, unknown>[],
  /** Every filter the query applied, so the scope can be asserted rather than assumed. */
  filters: [] as string[],
}))

vi.mock('server-only', () => ({}))
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  // `cache()` memoises per REQUEST, and there is no request here — the real one
  // would hold the first test's workspace for every later test.
  return { ...actual, cache: <T>(fn: T) => fn }
})
vi.mock('@/lib/workspaces', () => ({
  activeWorkspaceRead: () =>
    Promise.resolve(
      state.workspace === null
        ? { status: 'none' }
        : { status: 'ok', workspace: { id: state.workspace, name: 'W', slug: 'w' } },
    ),
}))

/** A table that actually applies `eq` and `in`, because the point is the filter. */
function table(rows: Record<string, unknown>[]) {
  let working = rows
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (col: string, value: unknown) => {
      state.filters.push(`eq:${col}=${String(value)}`)
      working = working.filter((r) => r[col] === value)
      return chain
    },
    in: (col: string, values: unknown[]) => {
      state.filters.push(`in:${col}`)
      working = working.filter((r) => values.includes(r[col]))
      return chain
    },
    order: () => chain,
    limit: () => Promise.resolve({ data: working, error: null }),
    maybeSingle: () => Promise.resolve({ data: working[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown) => resolve({ data: working, error: null }),
  }
  return chain
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: (name: string) => {
      state.filters.push(`from:${name}`)
      if (name === 'inbox_threads') return table(state.threads)
      if (name === 'inbox_messages') return table(state.messages)
      return table([])
    },
  }),
}))

const { readStoredThreadById, threadsNeedingReply } = await import('./store-read')

const THREAD_ID = 'a1b2c3d4-0000-4000-8000-000000000001'
const OTHER_ID = 'a1b2c3d4-0000-4000-8000-0000000000ff'

const thread = (over: Partial<Row> = {}): Record<string, unknown> => ({
  id: THREAD_ID,
  workspace_id: 'ws-1',
  channel: 'instagram',
  platform_thread_id: 'ig_conv_1',
  author_name: 'Priya',
  author_handle: '@priya',
  body: 'Do you deliver to Andheri?',
  posted_at: '2026-09-01T09:00:00.000Z',
  status: 'open',
  kind: 'dm',
  ...over,
})

beforeEach(() => {
  state.workspace = 'ws-1'
  state.threads = []
  state.messages = []
  state.filters = []
})

describe('readStoredThreadById', () => {
  it('returns the thread and its messages for a row in this workspace', async () => {
    state.threads = [thread()]
    state.messages = [
      {
        id: 'm1',
        workspace_id: 'ws-1',
        thread_id: THREAD_ID,
        direction: 'inbound',
        body: 'Do you deliver to Andheri?',
        platform_message_id: 'mid_1',
        sent_at: '2026-09-01T09:00:00.000Z',
        created_at: '2026-09-01T09:00:01.000Z',
        attachments: [],
      },
    ]
    const detail = await readStoredThreadById(THREAD_ID)
    expect(detail?.thread.platformThreadId).toBe('ig_conv_1')
    // Zernio's spelling, so the thread has one message vocabulary.
    expect(detail?.messages[0]).toMatchObject({ platform: 'instagram', direction: 'inbound' })
    // The platform's own stamp wins over the moment we filed it.
    expect(detail?.messages[0]!.createdAt).toBe('2026-09-01T09:00:00.000Z')
  })

  it('returns null for a thread belonging to another workspace', async () => {
    // THE 404 THE ROUTE RESTS ON. The row exists; it is not ours.
    state.threads = [thread({ workspace_id: 'ws-2' })]
    expect(await readStoredThreadById(THREAD_ID)).toBeNull()
    expect(state.filters).toContain('eq:workspace_id=ws-1')
  })

  it('returns null for an id no row carries', async () => {
    state.threads = [thread()]
    expect(await readStoredThreadById(OTHER_ID)).toBeNull()
  })

  it('returns null for an id that is not a uuid, without asking Postgres', async () => {
    // `= uuid` on a non-uuid is a 22P02, which is noise rather than news.
    expect(await readStoredThreadById('../../etc/passwd')).toBeNull()
    expect(state.filters).toEqual([])
  })

  it('returns null when there is no active workspace', async () => {
    state.workspace = null
    state.threads = [thread()]
    expect(await readStoredThreadById(THREAD_ID)).toBeNull()
  })

  it('keeps only attachment entries a renderer can actually use', async () => {
    state.threads = [thread()]
    state.messages = [
      {
        id: 'm1',
        workspace_id: 'ws-1',
        thread_id: THREAD_ID,
        direction: 'inbound',
        body: '',
        platform_message_id: 'mid_1',
        sent_at: '2026-09-01T09:00:00.000Z',
        created_at: '2026-09-01T09:00:00.000Z',
        attachments: [
          { type: 'image', url: 'https://cdn.example/a.jpg', name: 'a.jpg' },
          { type: 'image' },
          'not an object',
        ],
      },
    ]
    const detail = await readStoredThreadById(THREAD_ID)
    expect(detail?.messages[0]!.attachments).toEqual([
      { type: 'image', url: 'https://cdn.example/a.jpg', name: 'a.jpg' },
    ])
  })
})

describe('threadsNeedingReply', () => {
  const message = (over: Record<string, unknown>) => ({
    workspace_id: 'ws-1',
    thread_id: THREAD_ID,
    direction: 'inbound',
    created_at: '2026-09-01T09:00:00.000Z',
    ...over,
  })

  it('flags a thread whose NEWEST message is inbound', async () => {
    // Rows arrive newest-first, so the first one seen for a thread decides it.
    state.messages = [
      message({ direction: 'inbound', created_at: '2026-09-02T00:00:00.000Z' }),
      message({ direction: 'outbound', created_at: '2026-09-01T00:00:00.000Z' }),
    ]
    expect([...(await threadsNeedingReply([THREAD_ID]))]).toEqual([THREAD_ID])
  })

  it('does not flag a thread we already answered', async () => {
    // The defect this guards: deciding from an older row would light up every
    // conversation the shop has ever replied to.
    state.messages = [
      message({ direction: 'outbound', created_at: '2026-09-02T00:00:00.000Z' }),
      message({ direction: 'inbound', created_at: '2026-09-01T00:00:00.000Z' }),
    ]
    expect([...(await threadsNeedingReply([THREAD_ID]))]).toEqual([])
  })

  it('asks nothing when there are no threads to ask about', async () => {
    expect([...(await threadsNeedingReply([]))]).toEqual([])
    expect(state.filters).toEqual([])
  })
})
