import { describe, it, expect } from 'vitest'
import { AdapterError, type PublishRequest } from '@sahoda/shared'
import { createGbpAdapter } from './gbp'
import { fixtureTransport, type Transport, type TransportRequest } from '../transport'
import success from '../../fixtures/gbp/local-post.success.json'
import successNoSearchUrl from '../../fixtures/gbp/local-post.success-no-searchurl.json'
import unauthorized from '../../fixtures/gbp/local-post.unauthorized.json'
import forbidden from '../../fixtures/gbp/local-post.forbidden.json'
import rateLimited from '../../fixtures/gbp/local-post.rate-limited.json'
import serverError from '../../fixtures/gbp/local-post.server-error.json'
import badName from '../../fixtures/gbp/local-post.bad-name.json'

const bodyText = (b: string | Uint8Array | undefined): string => (typeof b === 'string' ? b : '')

const FIXED_NOW = new Date('2026-07-19T12:00:00.000Z')
const LOCATION = 'accounts/108283981976/locations/40123456789'

function gbpRequest(overrides: Partial<PublishRequest> = {}): PublishRequest {
  return {
    workspaceId: 'ws-1',
    postId: 'post-1',
    variantId: 'var-1',
    content: { channel: 'gbp', summary: 'Fresh chai just dropped at Chai & Chapters.', media: [] },
    media: [],
    auth: { connectionId: 'conn-1', accessToken: 'gbp-secret-token', externalAccountId: LOCATION },
    ...overrides,
  }
}

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

describe('GBP adapter — publish against recorded fixtures', () => {
  it('advertises the gbp channel', () => {
    expect(createGbpAdapter({ transport: fixtureTransport(success as never) }).channel).toBe('gbp')
  })

  it('creates a localPost and returns a LIVE result with the searchUrl permalink', async () => {
    const adapter = createGbpAdapter({
      transport: fixtureTransport(success as never),
      now: () => FIXED_NOW,
    })

    const result = await adapter.publish(gbpRequest())

    expect(result.mode).toBe('live')
    expect(result.platformPostId).toBe(`${LOCATION}/localPosts/98765`)
    expect(result.permalink).toBe('https://local.google.com/place?id=12345&use=posts&lpsid=98765')
    expect(result.publishedAt).toBe('2026-07-19T12:00:00.000Z')
  })

  it('POSTs the summary to the v4 localPosts endpoint with bearer auth', async () => {
    const { transport, last } = capturing(success)

    await createGbpAdapter({ transport }).publish(gbpRequest())

    const req = last()
    expect(req?.method).toBe('POST')
    expect(req?.url).toBe(`https://mybusiness.googleapis.com/v4/${LOCATION}/localPosts`)
    expect(req?.headers?.['Authorization']).toBe('Bearer gbp-secret-token')
    const body = JSON.parse(bodyText(req?.body) || '{}')
    expect(body.summary).toBe('Fresh chai just dropped at Chai & Chapters.')
    expect(body.topicType).toBe('STANDARD')
    expect(body.languageCode).toBe('en')
  })

  it('maps a CTA from the shared spec into callToAction', async () => {
    const { transport, last } = capturing(success)

    await createGbpAdapter({ transport }).publish(
      gbpRequest({
        content: {
          channel: 'gbp',
          media: [],
          summary: 'Order ahead for the weekend.',
          ctaType: 'ORDER',
          ctaUrl: 'https://chaichapters.example/order',
        },
      }),
    )

    expect(JSON.parse(bodyText(last()?.body) || '{}').callToAction).toEqual({
      actionType: 'ORDER',
      url: 'https://chaichapters.example/order',
    })
  })

  it('rejects a CTA type the shared CONSTRAINTS spec does not allow — no network call', async () => {
    let called = false
    const transport: Transport = async (req) => {
      called = true
      return fixtureTransport(success as never)(req)
    }

    await expect(
      createGbpAdapter({ transport }).publish(
        gbpRequest({
          content: {
            channel: 'gbp',
            media: [],
            summary: 's',
            ctaType: 'SMASH_THAT_BELL',
            ctaUrl: 'https://x.example',
          },
        }),
      ),
    ).rejects.toMatchObject({ classification: 'permanent', code: 'INVALID_CONTENT' })
    expect(called).toBe(false)
  })

  it('maps an offer into topicType OFFER with event title + terms', async () => {
    const { transport, last } = capturing(success)

    await createGbpAdapter({ transport }).publish(
      gbpRequest({
        content: {
          channel: 'gbp',
          media: [],
          summary: 'Monsoon offer!',
          offer: { title: '20% off all chai', terms: 'Till Sunday. In-store only.' },
        },
      }),
    )

    const body = JSON.parse(bodyText(last()?.body) || '{}')
    expect(body.topicType).toBe('OFFER')
    expect(body.event.title).toBe('20% off all chai')
    expect(body.offer.termsConditions).toBe('Till Sunday. In-store only.')
  })

  it('attaches media as a PHOTO sourceUrl via the injected resolver', async () => {
    const { transport, last } = capturing(success)
    const adapter = createGbpAdapter({
      transport,
      publicMediaUrl: (path) => `https://cdn.example/${path}`,
    })

    await adapter.publish(
      gbpRequest({ media: [{ storagePath: 'ws-1/img.jpg', mime: 'image/jpeg', bytes: 1000 }] }),
    )

    expect(JSON.parse(bodyText(last()?.body) || '{}').media).toEqual([
      { mediaFormat: 'PHOTO', sourceUrl: 'https://cdn.example/ws-1/img.jpg' },
    ])
  })

  it('rejects media honestly when no resolver is wired — never silently drops', async () => {
    let called = false
    const transport: Transport = async (req) => {
      called = true
      return fixtureTransport(success as never)(req)
    }

    await expect(
      createGbpAdapter({ transport }).publish(
        gbpRequest({ media: [{ storagePath: 'p.jpg', mime: 'image/jpeg', bytes: 1 }] }),
      ),
    ).rejects.toMatchObject({ classification: 'permanent', code: 'MEDIA_UNSUPPORTED' })
    expect(called).toBe(false)
  })

  it('rejects more media than the shared spec allows', async () => {
    const adapter = createGbpAdapter({
      transport: fixtureTransport(success as never),
      publicMediaUrl: (p) => `https://cdn.example/${p}`,
    })

    await expect(
      adapter.publish(
        gbpRequest({
          media: [
            { storagePath: 'a.jpg', mime: 'image/jpeg', bytes: 1 },
            { storagePath: 'b.jpg', mime: 'image/jpeg', bytes: 1 },
          ],
        }),
      ),
    ).rejects.toMatchObject({ classification: 'permanent', code: 'INVALID_CONTENT' })
  })

  it('rejects mis-routed content (channel !== gbp) without calling the network', async () => {
    let called = false
    const transport: Transport = async (req) => {
      called = true
      return fixtureTransport(success as never)(req)
    }

    await expect(
      createGbpAdapter({ transport }).publish(
        gbpRequest({ content: { channel: 'x', text: 'wrong', media: [] } }),
      ),
    ).rejects.toBeInstanceOf(AdapterError)
    expect(called).toBe(false)
  })

  it('rejects a malformed externalAccountId before it can reach a URL (injection guard)', async () => {
    let called = false
    const transport: Transport = async (req) => {
      called = true
      return fixtureTransport(success as never)(req)
    }

    await expect(
      createGbpAdapter({ transport }).publish(
        gbpRequest({
          auth: {
            connectionId: 'conn-1',
            accessToken: 't',
            externalAccountId: 'accounts/../../evil.example/steal',
          },
        }),
      ),
    ).rejects.toMatchObject({ classification: 'permanent', code: 'BAD_ACCOUNT' })
    expect(called).toBe(false)
  })

  it('classifies 401/403 as PERMANENT', async () => {
    for (const fixture of [unauthorized, forbidden]) {
      const adapter = createGbpAdapter({ transport: fixtureTransport(fixture as never) })
      await expect(adapter.publish(gbpRequest())).rejects.toMatchObject({
        classification: 'permanent',
        channel: 'gbp',
      })
    }
  })

  it('classifies 429/5xx as TRANSIENT', async () => {
    for (const fixture of [rateLimited, serverError]) {
      const adapter = createGbpAdapter({ transport: fixtureTransport(fixture as never) })
      await expect(adapter.publish(gbpRequest())).rejects.toMatchObject({
        classification: 'transient',
      })
    }
  })

  it('classifies a network throw as TRANSIENT and never leaks the token via raw', async () => {
    const transport: Transport = async () => {
      throw new Error('connect failed — Authorization: Bearer gbp-secret-token')
    }
    const adapter = createGbpAdapter({ transport })

    try {
      await adapter.publish(gbpRequest())
      throw new Error('expected publish to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(AdapterError)
      const e = err as AdapterError
      expect(e.classification).toBe('transient')
      expect(JSON.stringify({ m: e.message, r: e.raw })).not.toContain('gbp-secret-token')
    }
  })

  it('falls back to the merchant posts dashboard when searchUrl is missing', async () => {
    const adapter = createGbpAdapter({ transport: fixtureTransport(successNoSearchUrl as never) })

    const result = await adapter.publish(gbpRequest())

    expect(result.permalink).toBe('https://business.google.com/posts/l/40123456789')
    expect(result.platformPostId).toBe(`${LOCATION}/localPosts/98766`)
  })

  it('rejects a garbled localPost resource name as BAD_RESPONSE', async () => {
    const adapter = createGbpAdapter({ transport: fixtureTransport(badName as never) })

    await expect(adapter.publish(gbpRequest())).rejects.toMatchObject({
      code: 'BAD_RESPONSE',
      classification: 'permanent',
    })
  })
})
