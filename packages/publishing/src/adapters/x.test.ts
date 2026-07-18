import { describe, it, expect } from 'vitest'
import { AdapterError, type PublishRequest } from '@sahoda/shared'
import { createXAdapter } from './x'
import { fixtureTransport, type Transport, type TransportRequest } from '../transport'
import success from '../../fixtures/x/create-tweet.success.json'
import unauthorized from '../../fixtures/x/create-tweet.unauthorized.json'
import forbidden from '../../fixtures/x/create-tweet.forbidden.json'
import rateLimited from '../../fixtures/x/create-tweet.rate-limited.json'
import serverError from '../../fixtures/x/create-tweet.server-error.json'
import badId from '../../fixtures/x/create-tweet.bad-id.json'
import timeout from '../../fixtures/x/create-tweet.timeout.json'

const FIXED_NOW = new Date('2026-07-19T00:00:00.000Z')

function xRequest(overrides: Partial<PublishRequest> = {}): PublishRequest {
  return {
    workspaceId: 'ws-1',
    postId: 'post-1',
    variantId: 'var-1',
    content: { channel: 'x', text: 'Fresh chai just dropped.' },
    media: [],
    auth: { connectionId: 'conn-1', accessToken: 'secret-token', externalAccountId: '99' },
    ...overrides,
  }
}

/** Wrap a fixture transport but record the last outbound request for assertions. */
function capturing(recorded: unknown): {
  transport: Transport
  last: () => TransportRequest | undefined
} {
  const inner = fixtureTransport(recorded as never)
  let last: TransportRequest | undefined
  const transport: Transport = async (req) => {
    last = req
    return inner(req)
  }
  return { transport, last: () => last }
}

describe('X adapter — publish against recorded fixtures', () => {
  it('advertises the x channel', () => {
    expect(createXAdapter({ transport: fixtureTransport(success as never) }).channel).toBe('x')
  })

  it('posts the tweet and returns a LIVE result with a real permalink', async () => {
    const adapter = createXAdapter({
      transport: fixtureTransport(success as never),
      now: () => FIXED_NOW,
    })

    const result = await adapter.publish(xRequest())

    expect(result.mode).toBe('live')
    expect(result.platformPostId).toBe('1780000000000000001')
    expect(result.permalink).toBe('https://x.com/i/web/status/1780000000000000001')
    expect(result.publishedAt).toBe('2026-07-19T00:00:00.000Z')
  })

  it('sends text + bearer auth to POST /2/tweets', async () => {
    const { transport, last } = capturing(success)
    const adapter = createXAdapter({ transport })

    await adapter.publish(xRequest({ content: { channel: 'x', text: 'hello ☕' } }))

    const req = last()
    expect(req?.method).toBe('POST')
    expect(req?.url).toContain('/2/tweets')
    expect(req?.headers?.['Authorization']).toBe('Bearer secret-token')
    expect(JSON.parse(req?.body ?? '{}').text).toBe('hello ☕')
  })

  it('attaches pre-uploaded media_ids only when present', async () => {
    const withMedia = capturing(success)
    await createXAdapter({ transport: withMedia.transport }).publish(
      xRequest({ content: { channel: 'x', text: 't', mediaIds: ['m1', 'm2'] } }),
    )
    expect(JSON.parse(withMedia.last()?.body ?? '{}').media).toEqual({ media_ids: ['m1', 'm2'] })

    const noMedia = capturing(success)
    await createXAdapter({ transport: noMedia.transport }).publish(xRequest())
    expect(JSON.parse(noMedia.last()?.body ?? '{}').media).toBeUndefined()
  })

  it('never leaks the access token into the outbound body', async () => {
    const { transport, last } = capturing(success)
    await createXAdapter({ transport }).publish(xRequest())
    expect(last()?.body ?? '').not.toContain('secret-token')
  })

  it('classifies 401 as a PERMANENT AdapterError (revoked token → reconnect CTA)', async () => {
    const adapter = createXAdapter({ transport: fixtureTransport(unauthorized as never) })
    await expect(adapter.publish(xRequest())).rejects.toMatchObject({
      name: 'AdapterError',
      classification: 'permanent',
      channel: 'x',
    })
  })

  it('classifies 403 policy rejection as PERMANENT', async () => {
    const adapter = createXAdapter({ transport: fixtureTransport(forbidden as never) })
    await expect(adapter.publish(xRequest())).rejects.toMatchObject({ classification: 'permanent' })
  })

  it('classifies 429 as TRANSIENT (rate limited → job retries)', async () => {
    const adapter = createXAdapter({ transport: fixtureTransport(rateLimited as never) })
    await expect(adapter.publish(xRequest())).rejects.toMatchObject({ classification: 'transient' })
  })

  it('classifies 5xx as TRANSIENT', async () => {
    const adapter = createXAdapter({ transport: fixtureTransport(serverError as never) })
    await expect(adapter.publish(xRequest())).rejects.toMatchObject({ classification: 'transient' })
  })

  it('classifies 408 Request Timeout as TRANSIENT (not a token problem → retry, no reconnect CTA)', async () => {
    const adapter = createXAdapter({ transport: fixtureTransport(timeout as never) })
    await expect(adapter.publish(xRequest())).rejects.toMatchObject({ classification: 'transient' })
  })

  it('rejects a non-numeric tweet id as BAD_RESPONSE (never build an unsafe permalink)', async () => {
    const adapter = createXAdapter({ transport: fixtureTransport(badId as never) })
    await expect(adapter.publish(xRequest())).rejects.toMatchObject({
      name: 'AdapterError',
      code: 'BAD_RESPONSE',
      classification: 'permanent',
    })
  })

  it('does not leak the access token even when the transport error message contains it', async () => {
    const transport: Transport = async () => {
      // A misbehaving transport that embeds the outbound Authorization header in its message.
      throw new Error('POST /2/tweets failed — Authorization: Bearer secret-token')
    }
    const adapter = createXAdapter({ transport })

    try {
      await adapter.publish(xRequest())
      throw new Error('expected publish to throw')
    } catch (err) {
      const serialized = JSON.stringify(
        err instanceof AdapterError ? { message: err.message, raw: err.raw } : String(err),
      )
      expect(serialized).not.toContain('secret-token')
    }
  })

  it('classifies a network throw as TRANSIENT', async () => {
    const transport: Transport = async () => {
      throw new Error('ECONNRESET')
    }
    const adapter = createXAdapter({ transport })
    await expect(adapter.publish(xRequest())).rejects.toMatchObject({ classification: 'transient' })
  })

  it('rejects mis-routed content (channel !== x) as PERMANENT, without calling the network', async () => {
    let called = false
    const transport: Transport = async (req) => {
      called = true
      return fixtureTransport(success as never)(req)
    }
    const adapter = createXAdapter({ transport })

    await expect(
      adapter.publish(xRequest({ content: { channel: 'gbp', summary: 'wrong' } })),
    ).rejects.toBeInstanceOf(AdapterError)
    expect(called).toBe(false)
  })

  it('never surfaces the access token in a thrown error', async () => {
    const adapter = createXAdapter({ transport: fixtureTransport(unauthorized as never) })
    try {
      await adapter.publish(xRequest())
      throw new Error('expected publish to throw')
    } catch (err) {
      expect(
        JSON.stringify(err instanceof AdapterError ? { m: err.message, r: err.raw } : err),
      ).not.toContain('secret-token')
    }
  })
})
