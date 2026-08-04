import { ZernioError, uploadMediaToZernio, type ZernioClient } from '@sahoda/publishing'
import { AdapterError, type Channel, type MediaRef, type PublishRequestMedia } from '@sahoda/shared'

/**
 * Turn the post's attachments into URLs the platform will actually fetch.
 *
 * ── WHY THIS STEP EXISTS AT ALL ───────────────────────────────────────────────
 * `post_media` rows hold a Supabase Storage path, and the `media` bucket is private.
 * Instagram does not receive bytes — it receives a URL that Meta's servers fetch,
 * possibly minutes after we hand it over, from infrastructure that carries none of
 * our credentials. A storage path is therefore not something Instagram can use, and
 * the gap between the two is what this module closes.
 *
 * The bytes go through this process rather than being handed over as a signed
 * Supabase URL. That choice, and its reasoning, live in `zernio/media.ts`: a signed
 * URL works right up until it expires, and it expires silently, at publish time,
 * when nobody is watching.
 */

/** Matches apps/web's `MEDIA_BUCKET`. Both sides address the same private bucket. */
const MEDIA_BUCKET = 'media'

/**
 * A hard ceiling on what one attachment may pull into memory.
 *
 * This runs in a serverless function with a fixed memory limit, and `post_media.bytes`
 * is a plain int with no CHECK — a corrupt or hostile row can claim any size. The cap
 * is checked against the CLAIM before the fetch and against the DELIVERED length after,
 * because a row that under-reports its size would otherwise slip the first check and
 * exhaust memory on the second.
 *
 * Set above instagram's own 8 MB limit: the Constraint Engine owns the per-channel
 * rule, and this number exists only to stop the process from dying.
 */
const MAX_MEDIA_BYTES = 12_000_000

/**
 * The channels whose media must be re-hosted before publish. Everything else takes
 * its bytes to the platform directly (X uploads them over its own media endpoint) and
 * must not be charged an upload it has no use for.
 */
const REHOSTED_CHANNELS = new Set<string>(['instagram'])

/** Fetch a private storage object's bytes, given its `post_media.storage_path`. */
export type ReadStorageObject = (storagePath: string) => Promise<Uint8Array>

/** Attachments → public, platform-fetchable media references. `[]` for channels that need none. */
export type HostMedia = (channel: Channel, media: PublishRequestMedia[]) => Promise<MediaRef[]>

export interface StorageReaderOptions {
  supabaseUrl: string
  serviceRoleKey: string
  fetchImpl?: typeof fetch
}

/**
 * Read one object out of the private `media` bucket with the service-role key.
 *
 * Uses the storage REST endpoint directly rather than supabase-js so this module adds
 * no dependency to the publish graph, and so the failure modes are visible: a 404 here
 * means the row and the object have diverged, which is a permanent condition no retry
 * fixes, while a 5xx is worth another attempt.
 */
export function createStorageReader(opts: StorageReaderOptions): ReadStorageObject {
  const { supabaseUrl, serviceRoleKey } = opts
  const doFetch = opts.fetchImpl ?? fetch
  const origin = supabaseUrl.replace(/\/+$/, '')

  return async (storagePath: string): Promise<Uint8Array> => {
    // Each segment is encoded separately: the path is `{workspace}/{post}/{object}.{ext}`
    // and the slashes are structural, so encoding the whole string would escape them.
    const encoded = storagePath.split('/').map(encodeURIComponent).join('/')
    const url = `${origin}/storage/v1/object/${MEDIA_BUCKET}/${encoded}`

    const res = await doFetch(url, {
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
    })

    if (!res.ok) {
      // The URL is not echoed: it carries the workspace id and the object name.
      throw new StorageReadError(res.status, `storage returned ${res.status}`)
    }

    const buffer = await res.arrayBuffer()
    if (buffer.byteLength > MAX_MEDIA_BYTES) {
      throw new StorageReadError(0, `object is larger than ${MAX_MEDIA_BYTES} bytes`)
    }
    return new Uint8Array(buffer)
  }
}

/** A storage read that failed. `status` drives whether the publish is worth retrying. */
export class StorageReadError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'StorageReadError'
    this.status = status
  }

  /** A missing or forbidden object will still be missing on the next attempt. */
  get classification(): 'transient' | 'permanent' {
    if (this.status === 0 || (this.status >= 400 && this.status < 500)) return 'permanent'
    return 'transient'
  }
}

export interface ZernioMediaHostDeps {
  client: ZernioClient
  readStorageObject: ReadStorageObject
}

/**
 * The Zernio implementation of `HostMedia`: read from our storage, upload to theirs,
 * hand back the public URL.
 *
 * Every failure leaves as an `AdapterError` so `runPublishPost` classifies it the same
 * way it classifies an adapter's own failures — a transient one is retried by the
 * runner, a permanent one is recorded terminally. Without this translation a
 * `ZernioError` would fall through to the default `transient` and be retried forever
 * on a file Instagram is never going to accept.
 */
export function createZernioMediaHost(deps: ZernioMediaHostDeps): HostMedia {
  return async (channel, media) => {
    if (!REHOSTED_CHANNELS.has(channel) || media.length === 0) return []

    const hosted: MediaRef[] = []
    for (const item of media) {
      // Checked against the CLAIM first, so an oversized row costs one query, not one
      // download. `createStorageReader` checks the delivered bytes as well.
      if (item.bytes > MAX_MEDIA_BYTES) {
        throw new AdapterError({
          message: 'That image is too large to publish.',
          code: 'MEDIA_TOO_LARGE',
          classification: 'permanent',
          channel,
        })
      }

      let bytes: Uint8Array
      try {
        bytes = await deps.readStorageObject(item.storagePath)
      } catch (err) {
        const classification =
          err instanceof StorageReadError ? err.classification : ('transient' as const)
        throw new AdapterError({
          message: 'Could not read the attached image from storage.',
          code: 'STORAGE_ERROR',
          classification,
          channel,
          // Name only. A storage error message can carry the object path, which is
          // built from the workspace and post ids.
          raw: { name: err instanceof Error ? err.name : 'unknown' },
        })
      }

      try {
        const uploaded = await uploadMediaToZernio(deps.client, {
          bytes,
          mime: item.mime,
          filename: filenameFor(item.storagePath),
        })
        hosted.push({ url: uploaded.url, mime: uploaded.mime, bytes: uploaded.bytes })
      } catch (err) {
        if (err instanceof ZernioError) {
          throw new AdapterError({
            message: err.message,
            code: err.code,
            classification: err.classification,
            channel,
          })
        }
        throw new AdapterError({
          message: 'Could not prepare the image for publishing.',
          code: 'MEDIA_UPLOAD_FAILED',
          classification: 'transient',
          channel,
          raw: { name: err instanceof Error ? err.name : 'unknown' },
        })
      }
    }
    return hosted
  }
}

/**
 * A filename for the upload, taken from the object path's last segment.
 *
 * Zernio only uses this to label the stored object, but it becomes part of a public
 * URL, so anything path-like is stripped rather than passed through.
 */
function filenameFor(storagePath: string): string {
  const last = storagePath.split('/').pop() ?? ''
  const safe = last.replace(/[^A-Za-z0-9._-]/g, '')
  return safe.length > 0 ? safe : 'image'
}
