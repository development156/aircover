import { describe, it, expect } from 'vitest'

import { uploadMediaToZernio, decodeBase64Image } from './media'
import { ZernioError, type ZernioClient } from './client'

/**
 * THE LAST GATE BEFORE A SOCIAL NETWORK, AND IT HAD NO TEST.
 *
 * `uploadMediaToZernio` is the final thing between bytes in our storage and a
 * customer's public account. Fourteen modules in this directory carry a
 * `.test.ts`; this one did not, and it is the one whose failure is public.
 *
 * The mime gate at `media.ts:65` exists for a case the Constraint Engine cannot
 * see. The engine validates what a PERSON attached, in the editor. This catches
 * what SAHODA generates — an image model handing back WebP, a derivative encoded
 * to the wrong container — which never passes through the editor at all. Its own
 * comment says so, and nothing had ever watched it work.
 *
 * ── WHY EVERY REFUSAL TEST ASSERTS `calls` IS EMPTY ──────────────────────────
 * A gate placed after `presignMedia` would throw exactly the same error with
 * exactly the same message, and every assertion about the message would still
 * pass — while we had already asked Zernio for a slot and pushed bytes at it. The
 * point of refusing early is that nothing is spent, so that is what is asserted.
 */

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

interface Spy {
  client: ZernioClient
  calls: string[]
}

/**
 * A client that records which media calls were made. Only the three media methods
 * are real; anything else is absent, so a change that starts calling something new
 * from this path fails loudly here rather than silently passing.
 */
function spyClient(head?: { status?: number; contentType?: string; redirected?: boolean }): Spy {
  const calls: string[] = []
  const client = {
    presignMedia: async () => {
      calls.push('presignMedia')
      return {
        uploadUrl: 'https://upload.zernio.test/slot',
        publicUrl: 'https://media.zernio.test/abc.png',
        key: 'media/abc.png',
      }
    },
    uploadMedia: async () => {
      calls.push('uploadMedia')
    },
    headMedia: async () => {
      calls.push('headMedia')
      return {
        status: head?.status ?? 200,
        contentType: head?.contentType ?? 'image/png',
        redirected: head?.redirected ?? false,
      }
    },
  } as unknown as ZernioClient
  return { client, calls }
}

describe('uploadMediaToZernio · the mime gate', () => {
  it('refuses a type the channel does not accept, and spends nothing doing it', async () => {
    const spy = spyClient()

    await expect(
      uploadMediaToZernio(spy.client, {
        bytes: PNG,
        mime: 'image/webp',
        filename: 'generated.webp',
        allowedMime: ['image/jpeg', 'image/png'],
      }),
    ).rejects.toBeInstanceOf(ZernioError)

    // Nothing was presigned, nothing was uploaded, nothing was fetched.
    expect(spy.calls).toEqual([])
  })

  it('names both what the channel takes and what it got', async () => {
    const spy = spyClient()

    // The sentence is the diagnostic. "Unsupported media type" would send somebody
    // to the platform's docs; this says which of ours produced the wrong container.
    await expect(
      uploadMediaToZernio(spy.client, {
        bytes: PNG,
        mime: 'image/gif',
        filename: 'loop.gif',
        allowedMime: ['image/jpeg', 'image/png'],
      }),
    ).rejects.toThrow('This channel accepts image/jpeg and image/png; got image/gif.')
  })

  it('carries the MEDIA_TYPE code, which is what the screen renders from', async () => {
    const spy = spyClient()

    const error = await uploadMediaToZernio(spy.client, {
      bytes: PNG,
      mime: 'image/webp',
      filename: 'g.webp',
      allowedMime: ['image/jpeg', 'image/png'],
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ZernioError)
    expect((error as ZernioError).code).toBe('MEDIA_TYPE')
    // `classification` decides retry-versus-not upstream. A wrong container does
    // not fix itself, so this must never be transient.
    expect((error as ZernioError).classification).toBe('permanent')
  })

  it('DEFAULTS to the strictest set when the caller forgets to say', async () => {
    // The default is not a convenience. A caller that omits `allowedMime` gets
    // Instagram's JPEG/PNG, so forgetting it refuses a gif rather than paying to
    // host one the platform will reject.
    const spy = spyClient()

    await expect(
      uploadMediaToZernio(spy.client, { bytes: PNG, mime: 'image/gif', filename: 'a.gif' }),
    ).rejects.toThrow('This channel accepts image/jpeg and image/png; got image/gif.')
    expect(spy.calls).toEqual([])
  })

  it('lets a widened channel through — x takes webp, and the gate must not over-refuse', async () => {
    // The mirror of every test above. A gate that refuses everything passes all of
    // them and breaks the product, so one case has to get through.
    const spy = spyClient({ contentType: 'image/webp' })

    const result = await uploadMediaToZernio(spy.client, {
      bytes: PNG,
      mime: 'image/webp',
      filename: 'ok.webp',
      allowedMime: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    })

    expect(spy.calls).toEqual(['presignMedia', 'uploadMedia', 'headMedia'])
    expect(result.url).toBe('https://media.zernio.test/abc.png')
    expect(result.mime).toBe('image/webp')
    expect(result.bytes).toBe(PNG.byteLength)
  })

  it('matches the mime exactly, so image/JPEG is not image/jpeg', async () => {
    // `includes()` is case-sensitive, and the compose-time gate at
    // `constraints.ts:518` is too. Pinned so the two cannot drift apart.
    const spy = spyClient()

    await expect(
      uploadMediaToZernio(spy.client, {
        bytes: PNG,
        mime: 'IMAGE/JPEG',
        filename: 'shouty.jpg',
        allowedMime: ['image/jpeg', 'image/png'],
      }),
    ).rejects.toThrow(ZernioError)
    expect(spy.calls).toEqual([])
  })
})

describe('uploadMediaToZernio · the three post-upload assertions', () => {
  it('refuses a redirect, which is how a cloud drive serves an HTML page', async () => {
    const spy = spyClient({ redirected: true })

    await expect(
      uploadMediaToZernio(spy.client, {
        bytes: PNG,
        mime: 'image/png',
        filename: 'a.png',
        allowedMime: ['image/png'],
      }),
    ).rejects.toThrow('the URL redirects')
  })

  it('refuses a non-image content-type even on a 200', async () => {
    // A status-only check waves an HTML interstitial straight through, which is
    // the failure the three separate assertions exist to prevent.
    const spy = spyClient({ contentType: 'text/html' })

    await expect(
      uploadMediaToZernio(spy.client, {
        bytes: PNG,
        mime: 'image/png',
        filename: 'a.png',
        allowedMime: ['image/png'],
      }),
    ).rejects.toThrow('content-type text/html')
  })

  it('reports every problem at once rather than the first', async () => {
    // One round trip, one verdict. Reporting only `status 404` would send somebody
    // to fix that and meet the redirect on the next attempt.
    const spy = spyClient({ status: 404, contentType: 'text/html', redirected: true })

    const error = await uploadMediaToZernio(spy.client, {
      bytes: PNG,
      mime: 'image/png',
      filename: 'a.png',
      allowedMime: ['image/png'],
    }).catch((caught: unknown) => caught)

    expect((error as ZernioError).message).toContain('status 404')
    expect((error as ZernioError).message).toContain('content-type text/html')
    expect((error as ZernioError).message).toContain('the URL redirects')
    expect((error as ZernioError).code).toBe('MEDIA_NOT_FETCHABLE')
  })
})

describe('decodeBase64Image', () => {
  it('trusts the BYTES over the data URL that announced them', async () => {
    // The caller asked one format and cannot assume it got it — the module's own
    // comment calls that assumption defect 4. A PNG announced as JPEG is a PNG.
    const announced = `data:image/jpeg;base64,${Buffer.from(PNG).toString('base64')}`

    expect(decodeBase64Image(announced).mime).toBe('image/png')
  })

  it('reads bare base64 with no data URL at all', () => {
    const decoded = decodeBase64Image(Buffer.from(PNG).toString('base64'))

    expect(decoded.mime).toBe('image/png')
    expect(Array.from(decoded.bytes)).toEqual(Array.from(PNG))
  })
})
