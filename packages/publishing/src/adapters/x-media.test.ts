import { describe, it, expect } from 'vitest'
import { AdapterError, type PublishRequest, type PublishRequestMedia } from '@sahoda/shared'
import { createXAdapter, type XAdapterDeps } from './x'
import { routedTransport, type Transport, type TransportRequest } from '../transport'
import tweetSuccess from '../../fixtures/x/create-tweet.success.json'
import uploadSuccess from '../../fixtures/x/media-upload.success.json'
import uploadError from '../../fixtures/x/media-upload.error.json'

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])

function media(storagePath: string): PublishRequestMedia {
  return { storagePath, mime: 'image/jpeg', bytes: JPEG_BYTES.length }
}

function xRequest(overrides: Partial<PublishRequest> = {}): PublishRequest {
  return {
    workspaceId: 'ws-1',
    postId: 'post-1',
    variantId: 'var-1',
    content: { channel: 'x', text: 'chai time ☕' },
    media: [],
    auth: { connectionId: 'conn-1', accessToken: 'secret-token', externalAccountId: '99' },
    ...overrides,
  }
}

/** Routes upload + tweet fixtures and records every outbound request. */
function harness(uploadFixture: unknown = uploadSuccess) {
  const requests: TransportRequest[] = []
  const inner = routedTransport([
    { match: { method: 'POST', urlIncludes: '/2/media/upload' }, response: uploadFixture as never },
    { match: { method: 'POST', urlIncludes: '/2/tweets' }, response: tweetSuccess as never },
  ])
  const transport: Transport = async (req) => {
    requests.push(req)
    return inner(req)
  }
  return { transport, requests }
}

function adapter(transport: Transport, extra: Partial<XAdapterDeps> = {}) {
  return createXAdapter({
    transport,
    readMedia: async () => JPEG_BYTES,
    ...extra,
  })
}

describe('X adapter — media upload sub-step', () => {
  it('uploads each attachment then references the returned media ids in the tweet', async () => {
    const { transport, requests } = harness()

    const result = await adapter(transport).publish(xRequest({ media: [media('ws-1/a.jpg')] }))

    expect(result.mode).toBe('live')
    const uploads = requests.filter((r) => r.url.includes('/2/media/upload'))
    expect(uploads).toHaveLength(1)
    const tweet = requests.find((r) => r.url.includes('/2/tweets'))
    expect(JSON.parse(typeof tweet?.body === 'string' ? tweet.body : '{}').media).toEqual({
      media_ids: ['1710000000000000001'],
    })
  })

  it('sends the raw bytes as multipart/form-data with bearer auth and tweet_image category', async () => {
    const { transport, requests } = harness()

    await adapter(transport).publish(xRequest({ media: [media('ws-1/a.jpg')] }))

    const upload = requests.find((r) => r.url.includes('/2/media/upload'))
    expect(upload?.url).toContain('media_category=tweet_image')
    expect(upload?.headers?.['Authorization']).toBe('Bearer secret-token')
    expect(upload?.headers?.['content-type']).toMatch(/^multipart\/form-data; boundary=/)
    expect(upload?.body).toBeInstanceOf(Uint8Array)
    const bodyBytes = upload?.body as Uint8Array
    const asLatin1 = Buffer.from(bodyBytes).toString('latin1')
    expect(asLatin1).toContain('name="media"')
    expect(Buffer.from(bodyBytes).includes(Buffer.from(JPEG_BYTES))).toBe(true)
  })

  it('merges uploaded ids with pre-supplied mediaIds, uploads first', async () => {
    const { transport, requests } = harness()

    await adapter(transport).publish(
      xRequest({
        media: [media('ws-1/a.jpg')],
        content: { channel: 'x', text: 't', mediaIds: ['pre-existing-1'] },
      }),
    )

    const tweet = requests.find((r) => r.url.includes('/2/tweets'))
    expect(JSON.parse(typeof tweet?.body === 'string' ? tweet.body : '{}').media).toEqual({
      media_ids: ['1710000000000000001', 'pre-existing-1'],
    })
  })

  it('rejects media honestly when no readMedia is wired — no network, never dropped', async () => {
    const { transport, requests } = harness()

    await expect(
      createXAdapter({ transport }).publish(xRequest({ media: [media('a.jpg')] })),
    ).rejects.toMatchObject({ classification: 'permanent', code: 'MEDIA_UNSUPPORTED' })
    expect(requests).toHaveLength(0)
  })

  it('rejects more media than the shared spec allows before any upload', async () => {
    const { transport, requests } = harness()
    const five = ['a', 'b', 'c', 'd', 'e'].map((n) => media(`${n}.jpg`))

    await expect(adapter(transport).publish(xRequest({ media: five }))).rejects.toMatchObject({
      classification: 'permanent',
      code: 'INVALID_CONTENT',
    })
    expect(requests).toHaveLength(0)
  })

  it('counts pre-supplied mediaIds against the cap', async () => {
    const { transport, requests } = harness()

    await expect(
      adapter(transport).publish(
        xRequest({
          media: [media('a.jpg'), media('b.jpg')],
          content: { channel: 'x', text: 't', mediaIds: ['p1', 'p2', 'p3'] },
        }),
      ),
    ).rejects.toMatchObject({ classification: 'permanent', code: 'INVALID_CONTENT' })
    expect(requests).toHaveLength(0)
  })

  it('classifies an upload 400 as PERMANENT and never posts the tweet', async () => {
    const { transport, requests } = harness(uploadError)

    await expect(
      adapter(transport).publish(xRequest({ media: [media('a.jpg')] })),
    ).rejects.toMatchObject({ classification: 'permanent' })
    expect(requests.some((r) => r.url.includes('/2/tweets'))).toBe(false)
  })

  it('classifies an upload 429 as TRANSIENT', async () => {
    const { transport } = harness({ status: 429, body: { title: 'Too Many Requests' } })

    await expect(
      adapter(transport).publish(xRequest({ media: [media('a.jpg')] })),
    ).rejects.toMatchObject({ classification: 'transient' })
  })

  it('rejects a non-numeric uploaded media id as BAD_RESPONSE', async () => {
    const { transport } = harness({ status: 200, body: { data: { id: '<bad>' } } })

    await expect(
      adapter(transport).publish(xRequest({ media: [media('a.jpg')] })),
    ).rejects.toMatchObject({ classification: 'permanent', code: 'BAD_RESPONSE' })
  })

  it('classifies a storage read failure as TRANSIENT without leaking details into raw', async () => {
    const { transport } = harness()
    const failing = adapter(transport, {
      readMedia: async () => {
        throw new Error('storage exploded — Bearer secret-token')
      },
    })

    try {
      await failing.publish(xRequest({ media: [media('a.jpg')] }))
      throw new Error('expected publish to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(AdapterError)
      const e = err as AdapterError
      expect(e.classification).toBe('transient')
      expect(e.code).toBe('STORAGE_ERROR')
      expect(JSON.stringify({ m: e.message, r: e.raw })).not.toContain('secret-token')
    }
  })

  it('publishes with no media exactly as before (no upload calls)', async () => {
    const { transport, requests } = harness()

    const result = await adapter(transport).publish(xRequest())

    expect(result.mode).toBe('live')
    expect(requests.filter((r) => r.url.includes('/2/media/upload'))).toHaveLength(0)
  })
})
