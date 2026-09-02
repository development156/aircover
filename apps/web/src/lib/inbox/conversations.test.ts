import { beforeEach, describe, expect, it, vi } from 'vitest'

import { threadHref } from '@/components/inbox/thread-href'

/**
 * A STORED CONVERSATION MUST BE OPENABLE.
 *
 * Every stored row used to be mapped with `accountId: ''`, under a comment
 * saying the list does not read it. The list does: `ConversationRow` builds its
 * link with `threadHref({ accountId, conversationId })`, and an empty account
 * produces `/inbox/threads//<id>`, which no route matches. The first webhook
 * subscription would have put a 404 at the top of the inbox.
 *
 * `inbox_threads` carries no account column, so the id is resolved the way the
 * live read resolves a platform-shaped question (`accountForWorkspace`): through
 * this workspace's Zernio-backed connections, first connected wins. Where a
 * live row knows the same thread, its id is the fallback.
 */

const state = vi.hoisted(() => ({
  storedRows: [] as Array<Record<string, unknown>>,
  liveRows: [] as Array<Record<string, unknown>>,
  connections: [] as Array<{ platform: string; external_account: Record<string, unknown> }>,
  connectionsError: null as { message: string } | null,
  workspace: { status: 'ok', workspace: { id: 'ws-1', name: 'W', slug: 'w' } } as Record<
    string,
    unknown
  >,
  /** The filters the connections query applied, so the scope can be asserted. */
  filters: [] as string[],
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/inbox/read', () => ({
  countAccounts: () => Promise.resolve(1),
  readConversations: () =>
    Promise.resolve({ rows: state.liveRows, decision: { showList: true }, nextCursor: null }),
}))
vi.mock('@/lib/inbox/store-read', () => ({
  readStoredThreads: () =>
    Promise.resolve({
      rows: state.storedRows,
      decision: { state: 'has_rows', showList: true },
    }),
}))
vi.mock('@/lib/workspaces', () => ({
  activeWorkspaceRead: () => Promise.resolve(state.workspace),
}))
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: (table: string) => {
      state.filters.push(`from:${table}`)
      const chain = {
        select: () => chain,
        eq: (col: string, v: unknown) => {
          state.filters.push(`eq:${col}=${String(v)}`)
          return chain
        },
        not: (col: string, op: string, v: unknown) => {
          state.filters.push(`not:${col} ${op} ${String(v)}`)
          return chain
        },
        order: () => Promise.resolve({ data: state.connections, error: state.connectionsError }),
      }
      return chain
    },
  }),
}))

const { readConversationsList } = await import('./conversations')

const stored = (id: string, channel: string) => ({
  id: `row-${id}`,
  channel,
  platformThreadId: id,
  authorName: 'Priya',
  authorHandle: '@priya',
  preview: 'Do you deliver to Andheri?',
  postedAt: '2026-09-01T09:00:00.000Z',
  status: 'open',
  kind: 'dm',
})

const OPENABLE = /^\/inbox\/threads\/[^/]+\/[^/]+$/

beforeEach(() => {
  state.storedRows = []
  state.liveRows = []
  state.connections = []
  state.connectionsError = null
  state.workspace = { status: 'ok', workspace: { id: 'ws-1', name: 'W', slug: 'w' } }
  state.filters = []
})

describe('a stored conversation carries a real account id', () => {
  it("resolves the thread's account through the workspace's connection for that channel", async () => {
    state.storedRows = [stored('ig_conv_1', 'instagram')]
    state.connections = [
      {
        platform: 'instagram',
        external_account: { id: '6a75caf7d0fe733d1afcc1f4', profileId: 'p' },
      },
    ]
    const { rows } = await readConversationsList()
    expect(rows[0]!.accountId).toBe('6a75caf7d0fe733d1afcc1f4')
    const href = threadHref({ accountId: rows[0]!.accountId, conversationId: rows[0]!.id })
    expect(href).toMatch(OPENABLE)
    expect(href).toBe('/inbox/threads/6a75caf7d0fe733d1afcc1f4/ig_conv_1')
  })

  it("reads only THIS workspace's active, Zernio-backed connections", async () => {
    state.storedRows = [stored('c', 'instagram')]
    await readConversationsList()
    expect(state.filters).toContain('from:connections')
    expect(state.filters).toContain('eq:workspace_id=ws-1')
    expect(state.filters).toContain('eq:status=active')
    expect(state.filters).toContain('not:external_account->>profileId is null')
  })

  it('files a stored Facebook thread under its Facebook connection, as platform facebook', async () => {
    state.storedRows = [stored('fb_conv_1', 'facebook')]
    state.connections = [
      { platform: 'instagram', external_account: { id: 'ig-acc', profileId: 'p' } },
      { platform: 'facebook', external_account: { id: 'fb-acc', profileId: 'p' } },
    ]
    const { rows } = await readConversationsList()
    expect(rows[0]).toMatchObject({ platform: 'facebook', accountId: 'fb-acc' })
  })

  it('with two accounts on one platform, the first connected wins, as the live read decides it', async () => {
    state.storedRows = [stored('c', 'instagram')]
    state.connections = [
      { platform: 'instagram', external_account: { id: 'first-connected', profileId: 'p' } },
      { platform: 'instagram', external_account: { id: 'second-connected', profileId: 'p' } },
    ]
    const { rows } = await readConversationsList()
    expect(rows[0]!.accountId).toBe('first-connected')
  })

  it('falls back to the live copy of the same thread when the connection read fails', async () => {
    state.storedRows = [stored('shared', 'instagram')]
    state.liveRows = [{ id: 'shared', platform: 'instagram', accountId: 'acc-live' }]
    state.connectionsError = { message: 'permission denied' }
    const { rows } = await readConversationsList()
    // The store still wins the collision, and it keeps the one thing it lacked.
    expect(rows).toHaveLength(1)
    expect(rows[0]!.accountId).toBe('acc-live')
    expect(threadHref({ accountId: rows[0]!.accountId, conversationId: rows[0]!.id })).toMatch(
      OPENABLE,
    )
  })

  it('never invents an account: with no connection and no live copy the id is the empty string', async () => {
    state.storedRows = [stored('orphan', 'telegram')]
    const { rows } = await readConversationsList()
    // Obviously absent rather than plausibly wrong. A guessed id would open the
    // wrong account's thread; an empty one cannot open anything.
    expect(rows[0]!.accountId).toBe('')
  })
})
