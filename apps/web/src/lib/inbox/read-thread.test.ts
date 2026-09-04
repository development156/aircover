import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * OPENING A CONVERSATION THE DATABASE ALREADY HOLDS.
 *
 * ── THE DEFECT ───────────────────────────────────────────────────────────────
 * The webhook receiver files DMs into `inbox_threads` AND `inbox_messages`, and
 * the LIST was migrated to read the store. The THREAD was not: `readThread`
 * resolved messages exclusively through Zernio, so opening a stored conversation
 * went back to the network for data this database already held.
 *
 * On the day Zernio is unwell — the case the store was built for, and the case
 * the list's own tests exercise — the list rendered its rows from the store and
 * every one of them led to a thread showing zero messages under "Sahoda could
 * not reach your connected accounts". A list that offers rows whose destination
 * cannot show them is the "never offer a remedy that cannot work" rule failing
 * at the link rather than at a button.
 *
 * ── WHY THIS FILE EXISTS AT ALL ──────────────────────────────────────────────
 * `readThread` had NO test. Not a thin one: none. That is why a screen could be
 * migrated to the store on one side and not the other with nothing going red.
 */

const NOW = '2026-09-03T12:00:00.000Z'

const state = vi.hoisted(() => ({
  /** What Zernio's live read does: return a page, return nothing, or throw. */
  live: 'page' as 'page' | 'empty' | 'throw',
  /** What the store holds for this thread. */
  stored: [] as Record<string, unknown>[],
  /** How many times the store was asked. */
  storeCalls: 0,
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/workspaces', () => ({
  activeWorkspaceRead: () =>
    Promise.resolve({ status: 'ok', workspace: { id: 'ws-1', name: 'W', slug: 'w' } }),
}))
vi.mock('@/lib/inbox/store-read', () => ({
  readStoredThreadMessages: (id: string) => {
    state.storeCalls += 1
    return Promise.resolve(state.stored.map((row) => ({ ...row, conversationId: id })))
  },
  readStoredThreads: () => Promise.resolve({ rows: [], decision: { kind: 'rows' } }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ in: () => Promise.resolve({ data: [], error: null }) }),
          in: () => Promise.resolve({ data: [], error: null }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  }),
}))
/**
 * ── THE SEAM IS THE READER, NOT `scopedAccount` ──────────────────────────────
 * The first version of this file spied on the exported `scopedAccount`. It did
 * nothing: `readThread` calls the module-LOCAL binding, so the real one ran, got
 * `{}` for its reads, and every test in the file hit the catch arm. Six of seven
 * passed, all of them for the wrong reason, which is the exact shape of guard
 * this project refuses.
 *
 * Mocking the reader instead puts the fake where the network genuinely is, so
 * the live path and the fallback path are both really exercised.
 */
vi.mock('@/lib/zernio/server', () => ({
  zernioClientReads: () => ({
    listMessages: () => {
      if (state.live === 'throw') throw new Error('zernio unreachable')
      return Promise.resolve({
        messages:
          state.live === 'empty'
            ? []
            : [
                {
                  id: 'live-1',
                  conversationId: 'thread-1',
                  accountId: 'account-1',
                  platform: 'instagram',
                  message: 'from the network',
                  direction: 'incoming',
                  createdAt: '2026-09-03T11:00:00.000Z',
                },
              ],
        pagination: { nextCursor: 'cursor-1' },
      })
    },
  }),
}))
vi.mock('@/lib/zernio/scope', () => ({
  ScopeError: class extends Error {},
  accountByIdForWorkspace: (_ws: string, accountId: string) => Promise.resolve(accountId),
  profileForWorkspace: () => Promise.resolve('profile-1'),
}))

const read = await import('./read')

const storedMessage = (over: Record<string, unknown> = {}) => ({
  id: 'stored-1',
  accountId: '',
  platform: 'instagram',
  message: 'from the store',
  direction: 'inbound',
  createdAt: '2026-09-03T10:00:00.000Z',
  ...over,
})

beforeEach(() => {
  state.live = 'page'
  state.stored = []
  state.storeCalls = 0
})

describe('readThread when Zernio cannot be reached', () => {
  /**
   * THE ONE THAT MATTERS. This is precisely the state the list renders from the
   * store, so every row it offered used to lead to an empty screen.
   */
  test('serves the conversation this database already holds', async () => {
    state.live = 'throw'
    state.stored = [storedMessage()]

    const view = await read.readThread('account-1', 'thread-1', NOW)

    expect(view?.messages).toHaveLength(1)
    expect(view?.messages[0]?.message).toBe('from the store')
  })

  test('and does not report the surface as a failure while showing messages', async () => {
    state.live = 'throw'
    state.stored = [storedMessage()]

    const view = await read.readThread('account-1', 'thread-1', NOW)

    // The live call DID fail. What must not happen is a decision that suppresses
    // the list above a thread that WAS read. `showList` is the field the screen
    // branches on, so it is the one that has to be right.
    expect(view?.decision.showList).toBe(true)
  })

  /**
   * The other half, and the one that keeps this honest: a genuine failure with
   * nothing stored must STILL say the read failed. A fallback that always
   * claimed success would replace one wrong screen with another.
   */
  test('a failure with nothing stored is still a failure', async () => {
    state.live = 'throw'
    state.stored = []

    const view = await read.readThread('account-1', 'thread-1', NOW)

    expect(view?.messages).toEqual([])
    // And it says so: nothing to show, because the read genuinely failed.
    expect(view?.decision.showList).toBe(false)
  })

  test('offers no pagination cursor for rows that did not come from a live page', async () => {
    state.live = 'throw'
    state.stored = [storedMessage()]

    const view = await read.readThread('account-1', 'thread-1', NOW)

    // Zernio's cursor pages a list these rows are not from.
    expect(view?.nextCursor).toBeNull()
  })
})

describe('readThread when the live read works', () => {
  test('the live page wins and the store is never asked', async () => {
    state.stored = [storedMessage()]

    const view = await read.readThread('account-1', 'thread-1', NOW)

    expect(view?.messages).toHaveLength(1)
    expect(view?.messages[0]?.message).toBe('from the network')
    expect(state.storeCalls).toBe(0)
    expect(view?.nextCursor).toBe('cursor-1')
  })

  /**
   * An empty live answer is the second door into the same defect: the account
   * answered, said nothing, and the conversation is sitting in our own table.
   */
  test('an empty live answer falls back rather than showing an empty thread', async () => {
    state.live = 'empty'
    state.stored = [storedMessage()]

    const view = await read.readThread('account-1', 'thread-1', NOW)

    expect(view?.messages).toHaveLength(1)
    expect(view?.nextCursor).toBeNull()
  })

  test('a thread that really is empty everywhere stays empty', async () => {
    state.live = 'empty'
    state.stored = []

    const view = await read.readThread('account-1', 'thread-1', NOW)

    expect(view?.messages).toEqual([])
  })
})
