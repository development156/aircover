import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A REPLY THE PLATFORM ACCEPTED IS A MESSAGE, AND IT BELONGS IN THE STORE.
 *
 * ── THE DEFECT ───────────────────────────────────────────────────────────────
 * `actions/inbox-send.ts` recorded nothing locally, for three reasons that had all
 * expired: the channel CHECK had been widened, the direct connection the webhook
 * receiver uses was available to this path too, and the tables it said nothing read
 * are now the list's primary source. The visible consequence: a shop owner replied
 * from /inbox, the reply left, and the screen they sent it from did not show it —
 * until a webhook happened to bring the same message back.
 *
 * ── WHAT THIS FILE PINS ──────────────────────────────────────────────────────
 * The REAL `upsertThread` and `insertMessage` run here against a fake `Queryable`,
 * so the SQL and its parameters are the ones production sends. The properties that
 * matter are which direction is written, that the platform's receipt id is what
 * makes the row a record, and that the thread is touched so a list ordered by time
 * puts it where the reader expects.
 */

const state = vi.hoisted(() => ({
  workspace: 'ws-1' as string | null,
  connection: { platform: 'instagram' } as Record<string, unknown> | null,
  hasDatabase: true,
  /** Every statement the transaction issued, with its parameters. */
  queries: [] as { sql: string; params: unknown[] }[],
  /** Rows the message insert returns. Empty = the unique index refused a duplicate. */
  insertRows: [{ id: 'msg-1' }] as { id: string }[],
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/workspaces', () => ({
  activeWorkspaceRead: () =>
    Promise.resolve(
      state.workspace === null
        ? { status: 'none' }
        : { status: 'ok', workspace: { id: state.workspace, name: 'W', slug: 'w' } },
    ),
}))
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: () => Promise.resolve({ data: state.connection, error: null }),
    }
    return { from: () => chain }
  },
}))
vi.mock('@/lib/zernio/pool', () => ({
  directTransaction: () =>
    state.hasDatabase
      ? async <T>(run: (db: unknown) => Promise<T>) =>
          run({
            query: (sql: string, params: unknown[] = []) => {
              state.queries.push({ sql, params })
              return Promise.resolve({
                rows: sql.includes('inbox_threads') ? [{ id: 'thread-1' }] : state.insertRows,
              })
            },
          })
      : null,
}))

const { recordSentReply } = await import('./record-sent')

const SENT_AT = '2026-09-06T10:00:00.000Z'

const reply = {
  accountId: '6a75caf7d0fe733d1afcc1f4',
  kind: 'dm' as const,
  platformThreadId: 'ig_conv_1',
  body: 'We open at nine on Sunday.',
  platformMessageId: 'mid_out_1',
  sentAt: SENT_AT,
  authorUserId: 'user_clerk_1',
}

const statement = (needle: string) => state.queries.find((q) => q.sql.includes(needle))

beforeEach(() => {
  state.workspace = 'ws-1'
  state.connection = { platform: 'instagram' }
  state.hasDatabase = true
  state.queries = []
  state.insertRows = [{ id: 'msg-1' }]
})

describe('a confirmed reply lands in the store', () => {
  it('writes an OUTBOUND message carrying the platform receipt and the author', async () => {
    expect(await recordSentReply(reply)).toBe('recorded')

    const insert = statement('insert into inbox_messages')
    expect(insert).toBeDefined()
    // direction, body, receipt id, sent_at, author — in the order the statement binds.
    expect(insert!.params).toEqual([
      'ws-1',
      'thread-1',
      'outbound',
      'We open at nine on Sunday.',
      'mid_out_1',
      SENT_AT,
      'user_clerk_1',
      '[]',
    ])
  })

  it('touches the thread with the reply and its time, so a list ordered by time moves it', async () => {
    await recordSentReply(reply)
    const upsert = statement('insert into inbox_threads')
    expect(upsert!.params).toEqual([
      'ws-1',
      'instagram',
      'dm',
      'ig_conv_1',
      // The customer's name and handle stay whatever the platform told us:
      // `coalesce(excluded, existing)` keeps them, and writing our own over
      // theirs would relabel the row.
      null,
      null,
      null,
      'We open at nine on Sunday.',
      null,
      SENT_AT,
    ])
  })

  it('reports a receipt a webhook already filed as such, never as a failure', async () => {
    // The partial unique index refuses the second write. We win the race either way.
    state.insertRows = []
    expect(await recordSentReply(reply)).toBe('already_recorded')
  })

  it('files a comment reply under the POST, as the webhook projector does', async () => {
    await recordSentReply({ ...reply, kind: 'comment', platformThreadId: 'post_9' })
    const upsert = statement('insert into inbox_threads')
    expect(upsert!.params[2]).toBe('comment')
    expect(upsert!.params[3]).toBe('post_9')
  })
})

describe('what it refuses to write', () => {
  it('writes nothing when the account names no channel this database can hold', async () => {
    // A row filed under a guessed channel would sit in another channel's tab forever.
    state.connection = { platform: 'whatsapp' }
    expect(await recordSentReply(reply)).toBe('not_recorded')
    expect(state.queries).toEqual([])
  })

  it('writes nothing when the account is not this workspace’s', async () => {
    state.connection = null
    expect(await recordSentReply(reply)).toBe('not_recorded')
    expect(state.queries).toEqual([])
  })

  it('writes nothing, and does not throw, when there is no direct database', async () => {
    // The reply has already gone out. A store write that cannot happen must not
    // turn a delivered message into an error the customer would answer by sending
    // it twice.
    state.hasDatabase = false
    expect(await recordSentReply(reply)).toBe('not_recorded')
  })

  it('writes nothing when no workspace is active', async () => {
    state.workspace = null
    expect(await recordSentReply(reply)).toBe('not_recorded')
    expect(state.queries).toEqual([])
  })
})
