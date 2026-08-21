import { describe, expect, it } from 'vitest'

import { decideRouting, parseZernioWebhook } from './webhook-payload'
import type { VerifiedZernioBody } from './webhook-signature'

/**
 * Payload shapes are taken from the OpenAPI document's `webhooks:` object and its
 * `WebhookPayload*` schemas (3.1.0, info.version 1.0.4, read 2026-08-21). Each
 * fixture names the schema it stands for so a future reader can re-check it against
 * the source rather than against this file.
 */
const verified = (o: unknown) => JSON.stringify(o) as VerifiedZernioBody

describe('parseZernioWebhook', () => {
  it('reads the envelope every payload schema shares', () => {
    const r = parseZernioWebhook(
      verified({ id: 'evt_1', event: 'post.published', timestamp: '2026-08-21T10:30:00.000Z' }),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.parsed.eventId).toBe('evt_1')
    expect(r.parsed.event).toBe('post.published')
    expect(r.parsed.eventAt).toBe('2026-08-21T10:30:00.000Z')
  })

  it('accepts an event type it has never heard of', () => {
    // Zernio adds events; the document already grew from 375 endpoints to 399
    // between two readings. An allow-list would dead-letter the first new event.
    const r = parseZernioWebhook(
      verified({ id: 'evt_x', event: 'something.invented.tomorrow', timestamp: 't' }),
    )
    expect(r.ok).toBe(true)
  })

  it('accepts an event id that is not a UUID', () => {
    // The OpenAPI document types `id` as a plain string; the prose guide calls it a
    // UUID. A uuid() parse here would reject a real delivery to enforce a claim only
    // one of the two sources makes.
    const r = parseZernioWebhook(verified({ id: '66b1f2c3d4e5f60718293a4b', event: 'e' }))
    expect(r.ok).toBe(true)
  })

  it('keeps the payload whole and unedited', () => {
    // What is not lifted into a column must still reach the database, because the
    // store is what makes a missed projection recoverable later.
    const body = { id: 'e', event: 'comment.received', comment: { text: 'hi', nested: { a: 1 } } }
    const r = parseZernioWebhook(verified(body))
    expect(r.ok && r.parsed.payload).toEqual(body)
  })

  it.each([
    ['not JSON at all', 'not json{', 'not_json'],
    ['a JSON array', '[]', 'not_an_object'],
    ['a bare JSON string', '"hello"', 'not_an_object'],
    ['JSON null', 'null', 'not_an_object'],
    ['an object with no id', '{"event":"post.published"}', 'bad_envelope'],
    ['an object with no event', '{"id":"e"}', 'bad_envelope'],
    ['an empty id', '{"id":"","event":"e"}', 'bad_envelope'],
  ])('refuses %s', (_label, raw, reason) => {
    expect(parseZernioWebhook(raw as VerifiedZernioBody)).toEqual({ ok: false, reason })
  })
})

describe('account id collection — the routing key', () => {
  it('reads .account.accountId, the path 25 of 26 schemas use', () => {
    // WebhookPayloadMessage
    const r = parseZernioWebhook(
      verified({
        id: 'e',
        event: 'message.received',
        account: { accountId: 'acc_1', profileId: 'prof_1', platform: 'instagram' },
      }),
    )
    expect(r.ok && r.parsed.accountIds).toEqual(['acc_1'])
  })

  it('walks post.platforms[] rather than reading platforms[0]', () => {
    // WebhookPayloadPost. Its own field description says "A post can span multiple
    // accounts", and this codebase has shipped three defects from reading a list as
    // a scalar. Indexing [0] would lose acc_b and acc_c.
    const r = parseZernioWebhook(
      verified({
        id: 'e',
        event: 'post.published',
        post: {
          id: 'p1',
          platforms: [
            { platform: 'instagram', status: 'published', accountId: 'acc_a' },
            { platform: 'linkedin', status: 'published', accountId: 'acc_b' },
            { platform: 'x', status: 'failed', accountId: 'acc_c' },
          ],
        },
      }),
    )
    expect(r.ok && r.parsed.accountIds).toEqual(['acc_a', 'acc_b', 'acc_c'])
  })

  it('deduplicates once, at the boundary', () => {
    const r = parseZernioWebhook(
      verified({
        id: 'e',
        event: 'post.published',
        account: { accountId: 'acc_a' },
        post: {
          platforms: [
            { accountId: 'acc_a', platform: 'instagram', status: 'published' },
            { accountId: 'acc_a', platform: 'instagram', status: 'published' },
          ],
        },
      }),
    )
    expect(r.ok && r.parsed.accountIds).toEqual(['acc_a'])
  })

  it('finds NO account id on webhook.test, which carries none by construction', () => {
    // WebhookPayloadTest is the only schema of the 26 with neither an accountId nor
    // a profileId. It must still be accepted — it is the delivery Zernio sends to
    // prove the endpoint works.
    const r = parseZernioWebhook(verified({ id: 'e', event: 'webhook.test', timestamp: 't' }))
    expect(r.ok && r.parsed.accountIds).toEqual([])
  })

  it('IGNORES profileId entirely, even when the payload has one', () => {
    // Doc 13 §11 Q6 asked whether events carry the profile id for workspace routing.
    // They do on 18 of 26 schemas and NOT on comment, review, post, post.platform,
    // external post or lead — every surface this lane exists to fix. Routing that
    // preferred profileId would silently drop exactly those. The parser does not
    // read the field at all, and this test is what keeps that true.
    const r = parseZernioWebhook(
      verified({ id: 'e', event: 'message.received', account: { profileId: 'prof_only' } }),
    )
    expect(r.ok && r.parsed.accountIds).toEqual([])
  })

  it('tolerates a platforms entry that is not an object', () => {
    const r = parseZernioWebhook(
      verified({ id: 'e', event: 'post.published', post: { platforms: [null, 'x', { accountId: 'acc_a' }] } }),
    )
    expect(r.ok && r.parsed.accountIds).toEqual(['acc_a'])
  })
})

describe('decideRouting', () => {
  it('routes when one workspace owns every matched account', () => {
    expect(
      decideRouting({ accountIds: ['a'], owners: [{ accountId: 'a', workspaceId: 'ws1' }] }),
    ).toEqual({ routing: 'routed', workspaceId: 'ws1' })
  })

  it('routes a multi-account post whose accounts share one workspace', () => {
    expect(
      decideRouting({
        accountIds: ['a', 'b'],
        owners: [
          { accountId: 'a', workspaceId: 'ws1' },
          { accountId: 'b', workspaceId: 'ws1' },
        ],
      }),
    ).toEqual({ routing: 'routed', workspaceId: 'ws1' })
  })

  it('routes when only SOME ids matched — an unmatched sibling is not a second tenant', () => {
    expect(
      decideRouting({ accountIds: ['a', 'b'], owners: [{ accountId: 'a', workspaceId: 'ws1' }] }),
    ).toEqual({ routing: 'routed', workspaceId: 'ws1' })
  })

  it('says no_account_id rather than guessing, when there is nothing to route on', () => {
    expect(decideRouting({ accountIds: [], owners: [] })).toEqual({
      routing: 'no_account_id',
      workspaceId: null,
    })
  })

  it('says unknown_account when the id matches no connection', () => {
    expect(decideRouting({ accountIds: ['ghost'], owners: [] })).toEqual({
      routing: 'unknown_account',
      workspaceId: null,
    })
  })

  it('REFUSES to pick a workspace when two own the accounts on one event', () => {
    // The damaging case, and the one a `platforms[0]` reader would get silently
    // wrong: a shared team API key. Filing one customer's event under another's
    // name is worse than filing it nowhere, so this returns null and records why.
    expect(
      decideRouting({
        accountIds: ['a', 'b'],
        owners: [
          { accountId: 'a', workspaceId: 'ws1' },
          { accountId: 'b', workspaceId: 'ws2' },
        ],
      }),
    ).toEqual({ routing: 'ambiguous', workspaceId: null })
  })

  it('distinguishes all four outcomes — none collapses into another', () => {
    // The standing rule these four exist to serve: not connected, could not read,
    // not configured, and nothing yet are different facts. A router that returned
    // null with no reason would make every one of them look like the same failure.
    const outcomes = [
      decideRouting({ accountIds: [], owners: [] }).routing,
      decideRouting({ accountIds: ['x'], owners: [] }).routing,
      decideRouting({ accountIds: ['a'], owners: [{ accountId: 'a', workspaceId: 'w' }] }).routing,
      decideRouting({
        accountIds: ['a', 'b'],
        owners: [
          { accountId: 'a', workspaceId: 'w1' },
          { accountId: 'b', workspaceId: 'w2' },
        ],
      }).routing,
    ]
    expect(new Set(outcomes).size).toBe(4)
  })
})
