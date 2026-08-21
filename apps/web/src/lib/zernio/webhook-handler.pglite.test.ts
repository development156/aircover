import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createHmac } from 'node:crypto'

import { bootFullSchema } from '@sahoda/db/testing'

import { createZernioWebhookHandler } from './webhook-handler'

/**
 * THE RECEIVER, DRIVEN BY REAL `Request`s, AGAINST A REAL POSTGRES.
 *
 * Every status code the handler can answer is asserted here, because a wrong one is
 * not cosmetic: Zernio retries a non-2xx seven times over ~51 hours and then
 * dead-letters the event. A 4xx on a fault of OURS loses the event AND tells the
 * operator the caller was at fault.
 *
 * Two things every rejection test asserts beyond the status: that NO ROW WAS
 * WRITTEN, and that the body does not leak which half of the check failed.
 */

const SECRET = 'whsec_route_fixture'
const WS = '11111111-1111-4111-8111-111111111111'

const sign = (body: string, secret = SECRET) =>
  createHmac('sha256', secret).update(body, 'utf8').digest('hex')

const post = (body: string, headers: Record<string, string> = {}) =>
  new Request('https://sahoda.test/api/webhooks/zernio', { method: 'POST', body, headers })

const EVENT = {
  id: 'evt_route_1',
  event: 'message.received',
  timestamp: '2026-08-21T10:00:00.000Z',
  account: { accountId: 'acc_a', platform: 'instagram' },
  message: {
    id: 'm1',
    platformMessageId: 'ig_1',
    conversationId: 'c1',
    platform: 'instagram',
    direction: 'incoming',
    text: 'hello',
    sentAt: '2026-08-21T09:59:00.000Z',
  },
  conversation: { id: 'c1', platformConversationId: 'ig_c1', participantName: 'Priya' },
}

describe('POST /api/webhooks/zernio', () => {
  let db: PGlite
  let handle: (r: Request) => Promise<Response>
  /** Set true to make every transaction throw, simulating an unreachable database. */
  let dbDown = false

  beforeAll(async () => {
    db = await bootFullSchema()
    handle = createZernioWebhookHandler({
      secret: SECRET,
      withTransaction: async (fn) => {
        if (dbDown) throw new Error('connect ECONNREFUSED')
        await db.exec('begin')
        try {
          const r = await fn({ query: (sql, params) => db.query(sql, params as unknown[]) })
          await db.exec('commit')
          return r
        } catch (e) {
          await db.exec('rollback')
          throw e
        }
      },
    })
  }, 120_000)

  beforeEach(async () => {
    dbDown = false
    await db.exec(
      `truncate zernio_webhook_events, inbox_messages, inbox_threads, connections, workspaces cascade`,
    )
    await db.query(`insert into workspaces (id, name, slug, created_by) values ($1,'A','a','u')`, [
      WS,
    ])
    await db.query(
      `insert into connections (workspace_id, platform, external_account, status)
       values ($1, 'instagram', '{"id":"acc_a"}'::jsonb, 'active')`,
      [WS],
    )
  })

  const events = async (): Promise<number> =>
    (await db.query<{ n: number }>(`select count(*)::int as n from zernio_webhook_events`)).rows[0]!
      .n

  // ── THE HAPPY PATH ────────────────────────────────────────────────────────

  it('200 and stores a correctly signed delivery', async () => {
    const body = JSON.stringify(EVENT)
    const res = await handle(post(body, { 'x-zernio-signature': sign(body) }))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      status: 'stored',
      routing: 'routed',
    })
    expect(await events()).toBe(1)
  })

  it('200 on a byte-identical redelivery, and writes nothing the second time', async () => {
    const body = JSON.stringify(EVENT)
    const headers = { 'x-zernio-signature': sign(body) }
    expect((await handle(post(body, headers))).status).toBe(200)

    const second = await handle(post(body, headers))
    // 200, NOT 409. A 409 would make Zernio retry a delivery that already succeeded.
    expect(second.status).toBe(200)
    await expect(second.json()).resolves.toMatchObject({ ok: true, status: 'duplicate' })
    expect(await events()).toBe(1)
  })

  // ── REJECTIONS ────────────────────────────────────────────────────────────

  it('401 and writes NOTHING when the signature is forged', async () => {
    const body = JSON.stringify(EVENT)
    const res = await handle(post(body, { 'x-zernio-signature': 'f'.repeat(64) }))
    expect(res.status).toBe(401)
    // The assertion that matters: a receiver that stored first and verified second
    // would pass on the status alone.
    expect(await events()).toBe(0)
  })

  it('401 when the signature header is ABSENT — never a skip', async () => {
    // Zernio omits the header entirely when a subscription has no secret. That is a
    // fact about the subscription, not permission to trust an anonymous POST to a
    // public URL.
    const res = await handle(post(JSON.stringify(EVENT)))
    expect(res.status).toBe(401)
    expect(await events()).toBe(0)
  })

  it('401 when the body was altered after signing', async () => {
    const body = JSON.stringify(EVENT)
    const signature = sign(body)
    const tampered = body.replace('"text":"hello"', '"text":"pwned"')
    expect(tampered).not.toBe(body)
    const res = await handle(post(tampered, { 'x-zernio-signature': signature }))
    expect(res.status).toBe(401)
    expect(await events()).toBe(0)
  })

  it('does not tell the caller WHICH half of the check failed', async () => {
    // "no_signature" versus "bad_signature" tells a prober which half they got
    // right. Both answer the same fixed envelope.
    const body = JSON.stringify(EVENT)
    const missing = await (await handle(post(body))).json()
    const wrong = await (await handle(post(body, { 'x-zernio-signature': 'a'.repeat(64) }))).json()
    expect(missing).toEqual(wrong)
    expect(JSON.stringify(missing)).not.toMatch(/signature|hmac|secret/i)
  })

  it('400 when a VERIFIED delivery is unparseable', async () => {
    // Genuinely from Zernio and still malformed: a contract break. No retry can fix
    // it, so burning seven attempts is worse than dead-lettering it now.
    const body = 'not json at all'
    const res = await handle(post(body, { 'x-zernio-signature': sign(body) }))
    expect(res.status).toBe(400)
    expect(await events()).toBe(0)
  })

  it('413 on an oversized body, decided from content-length before reading it', async () => {
    const res = await handle(
      post('{}', { 'x-zernio-signature': 'x', 'content-length': String(2 * 1_048_576) }),
    )
    expect(res.status).toBe(413)
  })

  // ── THE CODES THAT MUST NOT BE 4xx ────────────────────────────────────────

  it('503, NOT 401, when no secret is configured', async () => {
    // A deployment mistake must never read as an attack in the logs — the mistake is
    // the one that silently loses real events.
    const unconfigured = createZernioWebhookHandler({
      secret: '',
      withTransaction: async () => {
        throw new Error('must not be reached')
      },
    })
    const res = await unconfigured(post('{}'))
    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'not_configured' })
  })

  it('503, NOT 500 and NOT 4xx, when the database is unreachable', async () => {
    // Ours, transient, and retrying is exactly right. A 4xx would blame Zernio; a
    // 500 reads as a code defect to every operator scanning logs.
    dbDown = true
    const body = JSON.stringify(EVENT)
    const res = await handle(post(body, { 'x-zernio-signature': sign(body) }))
    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'unavailable' })
  })

  it('200 on webhook.test, which can never be attributed to a workspace', async () => {
    const body = JSON.stringify({ id: 'evt_t', event: 'webhook.test', timestamp: 't' })
    const res = await handle(post(body, { 'x-zernio-signature': sign(body) }))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ routing: 'no_account_id' })
    expect(await events()).toBe(1)
  })

  it('200 on an event type nothing subscribes to', async () => {
    // A 4xx here would dead-letter every event Zernio adds after this deploy.
    const body = JSON.stringify({
      id: 'evt_u',
      event: 'whatsapp.number.released',
      account: { accountId: 'acc_a' },
    })
    const res = await handle(post(body, { 'x-zernio-signature': sign(body) }))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ projection: 'no_subscriber' })
  })

  it('200 on an account nobody has connected — retrying for 51 hours would be a lie', async () => {
    const body = JSON.stringify({ ...EVENT, id: 'evt_g', account: { accountId: 'ghost' } })
    const res = await handle(post(body, { 'x-zernio-signature': sign(body) }))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ routing: 'unknown_account' })
    // Stored with its reason, and findable through the partial index on
    // `routing <> 'routed'`. Not silently dropped.
    expect(await events()).toBe(1)
  })

  it('every response forbids caching', async () => {
    const body = JSON.stringify(EVENT)
    for (const res of [
      await handle(post(body, { 'x-zernio-signature': sign(body) })),
      await handle(post(body)),
    ]) {
      expect(res.headers.get('cache-control')).toBe('no-store')
    }
  })
})
