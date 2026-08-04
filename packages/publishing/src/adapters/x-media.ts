import { randomBytes } from 'node:crypto'
import { AdapterError, type PublishRequestMedia } from '@sahoda/shared'
import type { Transport, TransportResponse } from '../transport'
import { classifyXHttpError } from './x-http'

/**
 * X media upload sub-step (API v2 simple upload — our images cap at 5 MB per the
 * shared spec, so no chunked INIT/APPEND/FINALIZE needed). Bytes come from the
 * injected reader (the jobs runner wires Supabase storage); the adapter never
 * touches storage itself. Requires the media.write OAuth scope.
 */
const X_MEDIA_UPLOAD_URL = 'https://api.twitter.com/2/media/upload?media_category=tweet_image'

export type ReadMedia = (storagePath: string) => Promise<Uint8Array>

/** Upload each attachment in order; returns the platform media ids for the tweet. */
export async function uploadXMedia(
  transport: Transport,
  accessToken: string,
  media: PublishRequestMedia[],
  readMedia: ReadMedia,
): Promise<string[]> {
  const ids: string[] = []
  for (const item of media) {
    let bytes: Uint8Array
    try {
      bytes = await readMedia(item.storagePath)
    } catch (err) {
      // A storage blip is worth retrying; raw carries only the error name (log safety).
      throw new AdapterError({
        message: 'Could not read media from storage',
        code: 'STORAGE_ERROR',
        classification: 'transient',
        channel: 'x',
        raw: { name: err instanceof Error ? err.name : 'unknown' },
      })
    }
    ids.push(await uploadOne(transport, accessToken, item.mime, bytes))
  }
  return ids
}

async function uploadOne(
  transport: Transport,
  accessToken: string,
  mime: string,
  bytes: Uint8Array,
): Promise<string> {
  const boundary = `sahoda-${randomBytes(12).toString('hex')}`

  let res: TransportResponse
  try {
    res = await transport({
      method: 'POST',
      url: X_MEDIA_UPLOAD_URL,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      body: buildMultipartBody(boundary, mime, bytes),
    })
  } catch (err) {
    throw new AdapterError({
      message: 'X media upload failed before a response was received',
      code: 'NETWORK_ERROR',
      classification: 'transient',
      channel: 'x',
      raw: { name: err instanceof Error ? err.name : 'unknown' },
    })
  }

  if (res.status !== 200 && res.status !== 201) {
    throw classifyXHttpError(res)
  }
  const id = parseMediaId(res.body)
  if (!id) {
    throw new AdapterError({
      message: 'X media upload returned no usable media id',
      code: 'BAD_RESPONSE',
      classification: 'permanent',
      channel: 'x',
      raw: { status: res.status, bodySample: res.body.slice(0, 300) },
    })
  }
  return id
}

function buildMultipartBody(boundary: string, mime: string, bytes: Uint8Array): Uint8Array {
  const head =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="media"; filename="upload"\r\n` +
    `Content-Type: ${mime}\r\n\r\n`
  const tail = `\r\n--${boundary}--\r\n`
  return Buffer.concat([
    Buffer.from(head, 'latin1'),
    Buffer.from(bytes),
    Buffer.from(tail, 'latin1'),
  ])
}

/** Media ids are numeric snowflakes — reject anything else (mirrors the tweet-id guard). */
function parseMediaId(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { data?: { id?: unknown } }
    const id = parsed.data?.id
    return typeof id === 'string' && /^\d+$/.test(id) ? id : undefined
  } catch {
    return undefined
  }
}
