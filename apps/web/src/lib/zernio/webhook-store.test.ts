import { describe, expect, it, vi } from 'vitest'
import { ChannelSchema } from '@sahoda/shared'

/**
 * THE PLATFORM → CHANNEL MAP IS THE SHARED VOCABULARY, NOT A COPY OF IT.
 *
 * `CHANNEL` was a six-key literal typed `'x' | 'gbp' | 'linkedin' | 'instagram'`.
 * When `facebook` and `telegram` joined `ChannelSchema` on 2026-08-26 (and
 * `inbox_threads.channel` was widened to admit them in the same migration) the
 * literal kept typechecking, so every Facebook DM and comment the receiver
 * stored came back `channel_not_representable` and never reached the inbox.
 *
 * The projections are driven here with a recording `Queryable`: the property
 * under test is WHICH channel the thread upsert is handed, and that is a value
 * in the SQL parameters, not a database property. The database half (the CHECK
 * admitting the value) is proven by `webhook-ingest.pglite.test.ts`.
 */

vi.mock('server-only', () => ({}))

const { CHANNEL } = await import('./webhook-store')
const { projectComment, projectMessage } = await import('./webhook-project-inbox')

const WS = '11111111-1111-4111-8111-111111111111'

/** Records every statement and answers each with one id row. */
function recorder() {
  const calls: Array<{ sql: string; params: unknown[] }> = []
  return {
    calls,
    db: {
      query: async <R>(sql: string, params?: unknown[]) => {
        calls.push({ sql, params: params ?? [] })
        return { rows: [{ id: `row_${calls.length}` } as unknown as R] }
      },
    },
  }
}

const threadUpsert = (calls: Array<{ sql: string; params: unknown[] }>) =>
  calls.find((c) => /insert into inbox_threads/i.test(c.sql))

describe('CHANNEL covers the shared channel vocabulary', () => {
  it('maps every channel ChannelSchema admits to itself', () => {
    for (const channel of ChannelSchema.options) {
      expect(CHANNEL[channel], `CHANNEL[${channel}]`).toBe(channel)
    }
  })

  it("keeps Zernio's two alternate spellings", () => {
    expect(CHANNEL.twitter).toBe('x')
    expect(CHANNEL.googlebusiness).toBe('gbp')
  })

  it('still has NO entry for a platform this product does not model', () => {
    // Not a fallback: a Reddit comment must stay unfiled rather than land in a tab.
    expect(CHANNEL.reddit).toBeUndefined()
    expect(CHANNEL.whatsapp).toBeUndefined()
    expect(CHANNEL.sms).toBeUndefined()
  })
})

describe('a Facebook event is filed, not merely stored', () => {
  it('files a Facebook DM under the facebook channel', async () => {
    const { db, calls } = recorder()
    const out = await projectMessage(db, {
      workspaceId: WS,
      payload: {
        message: {
          id: 'm1',
          platformMessageId: 'fb_msg_1',
          platform: 'facebook',
          direction: 'incoming',
          text: 'Are you open on Sunday?',
          sentAt: '2026-09-01T09:00:00.000Z',
        },
        conversation: { id: 'conv_1', platformConversationId: 'fb_conv_1' },
      },
    })
    expect(out).toEqual({ kind: 'projected', surface: 'inbox', rows: 1 })
    const upsert = threadUpsert(calls)
    expect(upsert, 'no thread upsert was issued').toBeDefined()
    // `$2` is the channel column in `upsertThread`'s statement.
    expect(upsert!.params[1]).toBe('facebook')
    expect(upsert!.params[2]).toBe('dm')
  })

  it('stores what came attached, in order, as Zernio sent it', async () => {
    const { db, calls } = recorder()
    const attachments = [
      { type: 'image', url: 'https://scontent.cdninstagram.com/a.jpg', payload: { w: 1 } },
      { type: 'video', url: 'https://scontent.cdninstagram.com/b.mp4' },
    ]
    await projectMessage(db, {
      workspaceId: WS,
      payload: {
        message: {
          id: 'm3',
          platformMessageId: 'ig_msg_3',
          platform: 'instagram',
          direction: 'incoming',
          text: null,
          attachments,
        },
        conversation: { id: 'conv_3' },
      },
    })
    const insert = calls.find((c) => /insert into inbox_messages/.test(c.sql))
    expect(insert).toBeDefined()
    // Positional: the renderer resolves an attachment by its index, so the order
    // is part of the record. The body is the empty string, not "null".
    expect(insert!.params[3]).toBe('')
    expect(JSON.parse(insert!.params[7] as string)).toEqual(attachments)
  })

  it('files a Telegram DM under the telegram channel', async () => {
    const { db, calls } = recorder()
    const out = await projectMessage(db, {
      workspaceId: WS,
      payload: {
        message: { id: 'm2', platform: 'telegram', direction: 'incoming', text: 'Hi' },
        conversation: { id: 'conv_2' },
      },
    })
    expect(out).toMatchObject({ kind: 'projected' })
    expect(threadUpsert(calls)!.params[1]).toBe('telegram')
  })

  it('files a Facebook comment under the facebook channel', async () => {
    const { db, calls } = recorder()
    const out = await projectComment(db, {
      workspaceId: WS,
      payload: {
        comment: { id: 'c1', platformPostId: 'fb_post_1', platform: 'facebook', text: 'Love it' },
      },
    })
    expect(out).toEqual({ kind: 'projected', surface: 'inbox', rows: 1 })
    expect(threadUpsert(calls)!.params[1]).toBe('facebook')
    expect(threadUpsert(calls)!.params[2]).toBe('comment')
  })

  it('still refuses to invent a channel for a Reddit comment', async () => {
    const { db, calls } = recorder()
    const out = await projectComment(db, {
      workspaceId: WS,
      payload: { comment: { id: 'c2', platformPostId: 'p1', platform: 'reddit', text: 'hi' } },
    })
    expect(out).toEqual({ kind: 'channel_not_representable', platform: 'reddit' })
    expect(calls).toHaveLength(0)
  })
})
