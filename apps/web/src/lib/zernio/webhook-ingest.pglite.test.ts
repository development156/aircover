import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createHmac } from 'node:crypto'

import { bootFullSchema } from '@sahoda/db/testing'

/**
 * THE ZERNIO WEBHOOK RECEIVER, EXECUTED AGAINST A REAL POSTGRES.
 *
 * ── WHY THIS IS NOT A UNIT TEST WITH A MOCK STORE ────────────────────────────
 * Every property worth proving here is a property of the DATABASE:
 *
 *   · a redelivery writes nothing — enforced by a unique index, which a mock
 *     cannot refuse;
 *   · a stored event cannot be edited — enforced by a trigger;
 *   · a message may only claim to have reached a platform when it names one —
 *     enforced by a CHECK.
 *
 * A mocked store would agree with whatever the code did and prove none of them.
 * So this boots a real Postgres in process from the real migration files and drives
 * the real SQL.
 *
 * ── WHAT IS DELIBERATELY NOT MOCKED ──────────────────────────────────────────
 * The signature. Each delivery below is signed with `createHmac` exactly as Zernio
 * documents, so "the same event delivered twice" means BYTE-IDENTICAL BODY AND
 * BYTE-IDENTICAL SIGNATURE — a real replay, not a second call with the same object.
 */

const SECRET = 'whsec_pglite_fixture'
const WS_A = '11111111-1111-4111-8111-111111111111'
const WS_B = '22222222-2222-4222-8222-222222222222'

/** A delivery, as it would arrive: raw bytes plus the header Zernio computes. */
function delivery(payload: unknown): { rawBody: string; signature: string } {
  const rawBody = JSON.stringify(payload)
  return { rawBody, signature: createHmac('sha256', SECRET).update(rawBody, 'utf8').digest('hex') }
}

describe('zernio webhook ingest (real Postgres, in-process)', () => {
  let db: PGlite
  let ingest: (d: { rawBody: string; signature: string }) => Promise<Record<string, unknown>>

  beforeAll(async () => {
    db = await bootFullSchema()

    // The modules are imported through the same public entry points the route uses.
    const { verifyZernioWebhook } = await import('@sahoda/publishing')
    const { ingestZernioWebhook } = await import('./webhook-ingest')

    // The receiver's whole pipeline: verify → transaction → ingest → commit.
    // Written here rather than imported so the TEST controls the transaction and can
    // inspect what a rollback left behind.
    ingest = async (d) => {
      const verified = verifyZernioWebhook({
        headers: new Headers({ 'x-zernio-signature': d.signature }),
        rawBody: d.rawBody,
        secret: SECRET,
      })
      if (!verified.ok) return { status: 'unverified', reason: verified.reason }

      await db.exec('begin')
      try {
        const out = await ingestZernioWebhook(
          { query: (sql, params) => db.query(sql, params as unknown[]) },
          verified.body,
        )
        await db.exec('commit')
        return out as unknown as Record<string, unknown>
      } catch (e) {
        await db.exec('rollback')
        throw e
      }
    }
  }, 120_000)

  beforeEach(async () => {
    // `truncate`, not `delete`: the events table carries an append-only guard that
    // refuses DELETE outright, and that guard is one of the things this file
    // asserts. Truncate is a different statement the row-level trigger never sees,
    // so the cleanup cannot quietly depend on the rule being absent.
    await db.exec(
      `truncate zernio_webhook_events, inbox_messages, inbox_threads,
                post_variants, posts, connections, workspaces cascade`,
    )
    await db.query(
      `insert into workspaces (id, name, slug, created_by) values
        ($1, 'A', 'a', 'user_a'), ($2, 'B', 'b', 'user_b')`,
      [WS_A, WS_B],
    )
    await db.query(
      `insert into connections (workspace_id, platform, external_account, status) values
        ($1, 'instagram', '{"id":"acc_a","profileId":"prof_a"}'::jsonb, 'active'),
        ($2, 'instagram', '{"id":"acc_b","profileId":"prof_b"}'::jsonb, 'active')`,
      [WS_A, WS_B],
    )
  })

  const count = async (table: string): Promise<number> =>
    (await db.query<{ n: number }>(`select count(*)::int as n from ${table}`)).rows[0]!.n

  const MESSAGE = {
    id: 'evt_msg_1',
    event: 'message.received',
    timestamp: '2026-08-21T10:00:00.000Z',
    account: { accountId: 'acc_a', profileId: 'prof_a', platform: 'instagram' },
    message: {
      id: 'm1',
      platformMessageId: 'ig_msg_1',
      conversationId: 'conv_1',
      platform: 'instagram',
      direction: 'incoming',
      text: 'Do you deliver to Andheri?',
      sentAt: '2026-08-21T09:59:30.000Z',
      sender: { id: 's1', name: 'Priya', username: 'priya_k' },
    },
    conversation: { id: 'conv_1', platformConversationId: 'ig_conv_1', participantName: 'Priya' },
  }

  // ── (d) IDEMPOTENCY, PROVEN BY REAL REPLAY ────────────────────────────────

  describe('idempotency', () => {
    it('stores one event, one thread and one message on first delivery', async () => {
      const out = await ingest(delivery(MESSAGE))
      expect(out.status).toBe('stored')
      expect(out.routing).toBe('routed')
      expect(out.workspaceId).toBe(WS_A)
      expect(out.projection).toEqual({ kind: 'projected', surface: 'inbox', rows: 1 })

      expect(await count('zernio_webhook_events')).toBe(1)
      expect(await count('inbox_threads')).toBe(1)
      expect(await count('inbox_messages')).toBe(1)
    })

    it('THE REPLAY: the same bytes and the same signature, twice, change nothing', async () => {
      // ONE delivery object, sent twice. Same body, same HMAC, same everything —
      // which is precisely what a Zernio retry after a lost acknowledgement is.
      const d = delivery(MESSAGE)

      const first = await ingest(d)
      expect(first.status).toBe('stored')

      // The FULL state, before. Every column that a careless "upsert" would move.
      const before = await db.query<Record<string, unknown>>(
        `select
           (select count(*)::int from zernio_webhook_events) as events,
           (select count(*)::int from inbox_threads)         as threads,
           (select count(*)::int from inbox_messages)        as messages,
           (select max(updated_at) from inbox_threads)       as thread_updated,
           (select max(created_at) from inbox_messages)      as message_created,
           (select max(received_at) from zernio_webhook_events) as received`,
      )

      const second = await ingest(d)

      // The receiver must SAY it was a duplicate, not silently re-do the work.
      expect(second).toEqual({ status: 'duplicate', eventId: 'evt_msg_1' })

      const after = await db.query<Record<string, unknown>>(
        `select
           (select count(*)::int from zernio_webhook_events) as events,
           (select count(*)::int from inbox_threads)         as threads,
           (select count(*)::int from inbox_messages)        as messages,
           (select max(updated_at) from inbox_threads)       as thread_updated,
           (select max(created_at) from inbox_messages)      as message_created,
           (select max(received_at) from zernio_webhook_events) as received`,
      )

      // NOT just the counts. `updated_at` is the column an upsert-shaped receiver
      // would move while every count stayed right, and a test that checked only
      // counts would call that idempotent when it is not.
      expect(after.rows[0]).toEqual(before.rows[0])
    })

    it('is the SHORT-CIRCUIT, not a clever upsert — the thread trigger proves it', async () => {
      // WHY THIS TEST EXISTS. The first version of `upsertThread` carried an
      // `updated_at = case when (…) is distinct from (…) then now() else … end`
      // whose comment claimed it was what made a replay a no-op. Mutating that whole
      // expression to a bare `now()` changed NO test result — because
      // `inbox_foundations.sql:161` puts a BEFORE UPDATE trigger on the table and
      // `app.set_updated_at` assigns `now()` unconditionally, overwriting whatever
      // the statement wrote.
      //
      // So the expression was decoration. This test pins the mechanism that is
      // actually load-bearing, from both sides.
      const d = delivery(MESSAGE)
      await ingest(d)

      // SIDE ONE: the trigger really does move updated_at on ANY update, so a
      // "harmless" re-upsert would NOT be harmless.
      const t0 = (
        await db.query<{ u: string }>(`select updated_at::text as u from inbox_threads`)
      ).rows[0]!.u
      await db.query(`update inbox_threads set body = body`)
      const t1 = (
        await db.query<{ u: string }>(`select updated_at::text as u from inbox_threads`)
      ).rows[0]!.u
      expect(t1).not.toBe(t0)

      // SIDE TWO: a replay never reaches the upsert at all, so the trigger never
      // fires. THAT is the guarantee — one mechanism, in the ingest, not two.
      await ingest(d)
      const t2 = (
        await db.query<{ u: string }>(`select updated_at::text as u from inbox_threads`)
      ).rows[0]!.u
      expect(t2).toBe(t1)
    })

    it('a THIRD delivery still changes nothing', async () => {
      const d = delivery(MESSAGE)
      await ingest(d)
      await ingest(d)
      expect(await ingest(d)).toEqual({ status: 'duplicate', eventId: 'evt_msg_1' })
      expect(await count('zernio_webhook_events')).toBe(1)
      expect(await count('inbox_messages')).toBe(1)
    })

    it('a DIFFERENT event id on the same conversation adds a message, not a thread', async () => {
      // The other half of idempotency: dedupe must not be so eager it swallows real
      // news. Two messages in one conversation are two rows on one thread.
      await ingest(delivery(MESSAGE))
      await ingest(
        delivery({
          ...MESSAGE,
          id: 'evt_msg_2',
          message: { ...MESSAGE.message, id: 'm2', platformMessageId: 'ig_msg_2', text: 'Hello?' },
        }),
      )
      expect(await count('zernio_webhook_events')).toBe(2)
      expect(await count('inbox_threads')).toBe(1)
      expect(await count('inbox_messages')).toBe(2)
    })
  })

  // ── THE APPEND-ONLY GUARANTEE ─────────────────────────────────────────────

  describe('the event log is append-only', () => {
    it('refuses an UPDATE to a stored event', async () => {
      await ingest(delivery(MESSAGE))
      await expect(
        db.query(`update zernio_webhook_events set event = 'tampered'`),
      ).rejects.toThrow()
    })

    it('refuses a DELETE of a stored event', async () => {
      await ingest(delivery(MESSAGE))
      await expect(db.query(`delete from zernio_webhook_events`)).rejects.toThrow()
    })

    it('still removes events when the workspace itself is deleted', async () => {
      // The guard must not strand rows. `app.block_mutations` lets a delete through
      // at trigger depth > 1, which is how the cascade reaches these.
      await ingest(delivery(MESSAGE))
      await db.query(`delete from workspaces where id = $1`, [WS_A])
      expect(await count('zernio_webhook_events')).toBe(0)
    })
  })

  // ── ROUTING, INCLUDING THE CASES THAT MUST NOT BE GUESSED ─────────────────

  describe('routing', () => {
    it('files an event under the workspace that owns the account', async () => {
      await ingest(delivery({ ...MESSAGE, account: { accountId: 'acc_b' } }))
      const r = await db.query<{ workspace_id: string; routing: string }>(
        `select workspace_id::text as workspace_id, routing from zernio_webhook_events`,
      )
      expect(r.rows[0]).toEqual({ workspace_id: WS_B, routing: 'routed' })
    })

    it('accepts webhook.test and records that it cannot be attributed', async () => {
      // It carries neither an accountId nor a profileId. Refusing it would break the
      // one tool that verifies the endpoint — and would be retried seven times.
      const out = await ingest(
        delivery({ id: 'evt_test', event: 'webhook.test', timestamp: '2026-08-21T10:00:00Z' }),
      )
      expect(out.status).toBe('stored')
      expect(out.routing).toBe('no_account_id')
      expect(out.workspaceId).toBeNull()
      expect(out.projection).toEqual({ kind: 'not_routed', routing: 'no_account_id' })
      expect(await count('zernio_webhook_events')).toBe(1)
    })

    it('accepts an event for an account nobody has connected, and says so', async () => {
      const out = await ingest(delivery({ ...MESSAGE, account: { accountId: 'acc_ghost' } }))
      expect(out.status).toBe('stored')
      expect(out.routing).toBe('unknown_account')
      expect(out.workspaceId).toBeNull()
    })

    it('REFUSES to pick a workspace when two own the accounts on one event', async () => {
      const out = await ingest(
        delivery({
          id: 'evt_multi',
          event: 'post.published',
          post: {
            id: 'zp1',
            platforms: [
              { platform: 'instagram', status: 'published', accountId: 'acc_a' },
              { platform: 'instagram', status: 'published', accountId: 'acc_b' },
            ],
          },
        }),
      )
      expect(out.routing).toBe('ambiguous')
      expect(out.workspaceId).toBeNull()
      // Stored anyway — the event is real and losing it would be worse.
      expect(await count('zernio_webhook_events')).toBe(1)
      // And filed nowhere. THIS is the assertion that matters: a router that picked
      // platforms[0] would have written a row into workspace A's inbox.
      expect(await count('inbox_threads')).toBe(0)
    })

    it('an unattributed row is invisible to every member, by RLS', async () => {
      await ingest(
        delivery({ id: 'evt_test', event: 'webhook.test', timestamp: '2026-08-21T10:00:00Z' }),
      )
      await db.exec('begin')
      await db.exec(`set local role authenticated`)
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: 'user_a' }),
      ])
      const seen = await db.query<{ n: number }>(
        `select count(*)::int as n from zernio_webhook_events`,
      )
      await db.exec('rollback')
      // NULL is not `in (…)`, so it matches no policy. Operator data, not customer
      // data — and unreadable through the data API by anyone.
      expect(seen.rows[0]!.n).toBe(0)
    })
  })

  // ── HONESTY: THINGS STORED BUT DELIBERATELY NOT FILED ─────────────────────

  describe('what it refuses to invent', () => {
    it('stores a Reddit comment and does NOT put it in a channel', async () => {
      // Zernio sends comments for seven platforms; this product models four. Filing
      // a Reddit comment under the nearest channel would put it in the Instagram tab.
      const out = await ingest(
        delivery({
          id: 'evt_reddit',
          event: 'comment.received',
          account: { accountId: 'acc_a' },
          comment: { id: 'c1', platformPostId: 'p1', platform: 'reddit', text: 'hi' },
        }),
      )
      expect(out.status).toBe('stored')
      expect(out.projection).toEqual({ kind: 'channel_not_representable', platform: 'reddit' })
      expect(await count('inbox_threads')).toBe(0)
    })

    it('stores an event type nothing reads, without calling it an error', async () => {
      const out = await ingest(
        delivery({
          id: 'evt_wa',
          event: 'whatsapp.number.suspended',
          account: { accountId: 'acc_a' },
        }),
      )
      expect(out.status).toBe('stored')
      expect(out.projection).toEqual({ kind: 'no_subscriber' })
    })

    it('stores an event type that did not exist when this code was written', async () => {
      // The reason there is no CHECK on `event` and no enum in the parser.
      const out = await ingest(
        delivery({ id: 'evt_new', event: 'something.zernio.ships.in.2027', account: { accountId: 'acc_a' } }),
      )
      expect(out.status).toBe('stored')
    })

    it('does not clamp an out-of-range review rating into a star nobody gave', async () => {
      await db.query(
        `insert into connections (workspace_id, platform, external_account, status)
         values ($1, 'gbp', '{"id":"acc_gbp","profileId":"prof_a"}'::jsonb, 'active')`,
        [WS_A],
      )
      await ingest(
        delivery({
          id: 'evt_rev',
          event: 'review.new',
          account: { accountId: 'acc_gbp' },
          review: { id: 'rev1', platform: 'googlebusiness', rating: 0, text: 'bad', createdAt: '2026-08-21T09:00:00Z' },
        }),
      )
      const r = await db.query<{ rating: number | null }>(`select rating from inbox_threads`)
      expect(r.rows[0]!.rating).toBeNull()
    })
  })

  // ── THE UNVERIFIED PATH NEVER REACHES THE DATABASE ────────────────────────

  it('a forged signature writes NOTHING — not even the event row', async () => {
    const d = delivery(MESSAGE)
    const out = await ingest({ rawBody: d.rawBody, signature: 'f'.repeat(64) })
    expect(out).toEqual({ status: 'unverified', reason: 'bad_signature' })
    // The assertion that matters. A receiver that stored first and verified second
    // would pass on the status code alone and fail here.
    expect(await count('zernio_webhook_events')).toBe(0)
    expect(await count('inbox_threads')).toBe(0)
    expect(await count('inbox_messages')).toBe(0)
  })
})
