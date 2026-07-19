import {
  AdapterError,
  CONSTRAINTS,
  type PublishAdapter,
  type PublishRequest,
  type PublishSuccess,
} from '@sahoda/shared'
import type { Transport, TransportResponse } from '../transport'
import { classifyXHttpError } from './x-http'
import { uploadXMedia, type ReadMedia } from './x-media'

/** X API v2 create-post endpoint. Real network I/O is injected via {@link Transport}. */
const CREATE_TWEET_URL = 'https://api.twitter.com/2/tweets'

export interface XAdapterDeps {
  transport: Transport
  /** Injectable clock — deterministic in tests, real wall-clock in production. */
  now?: () => Date
  /** Resolves a storage path to raw bytes for upload. Media without this is rejected, never dropped. */
  readMedia?: ReadMedia
}

/**
 * The X publish adapter. It translates the frozen `FormattedContent` (already shaped by
 * the shared Constraint Engine) into the X wire payload, uploads any attached media
 * first (v2 media upload), posts via the injected transport, and returns a
 * `PublishSuccess`. It NEVER retries — a transient {@link AdapterError} tells the
 * durable job to retry; a permanent one drives a reconnect CTA.
 */
export function createXAdapter(deps: XAdapterDeps): PublishAdapter {
  const now = deps.now ?? (() => new Date())
  const spec = CONSTRAINTS.x

  return {
    channel: 'x',
    async publish(req: PublishRequest): Promise<PublishSuccess> {
      if (req.content.channel !== 'x') {
        // Mis-routing is a caller bug, not a retryable condition — fail permanently and
        // never touch the network.
        throw new AdapterError({
          message: `X adapter received ${req.content.channel} content`,
          code: 'WRONG_CHANNEL',
          classification: 'permanent',
          channel: 'x',
        })
      }

      const preSupplied = req.content.mediaIds ?? []
      let mediaIds = preSupplied
      if (req.media.length > 0) {
        if (req.media.length + preSupplied.length > spec.maxMediaCount) {
          throw new AdapterError({
            message: `X allows ${spec.maxMediaCount} media items.`,
            code: 'INVALID_CONTENT',
            classification: 'permanent',
            channel: 'x',
          })
        }
        if (!deps.readMedia) {
          // Honesty rule: dropping attached media would present a partial publish as success.
          throw new AdapterError({
            message: 'X media publishing is not wired on this path yet.',
            code: 'MEDIA_UNSUPPORTED',
            classification: 'permanent',
            channel: 'x',
          })
        }
        const uploaded = await uploadXMedia(
          deps.transport,
          req.auth.accessToken,
          req.media,
          deps.readMedia,
        )
        mediaIds = [...uploaded, ...preSupplied]
      }

      const payload: { text: string; media?: { media_ids: string[] } } = { text: req.content.text }
      if (mediaIds.length > 0) {
        payload.media = { media_ids: mediaIds }
      }
      // Serialize BEFORE the try so a payload-construction bug surfaces as itself, not as a
      // "transient" network error the durable job would pointlessly retry.
      const body = JSON.stringify(payload)

      let res: TransportResponse
      try {
        res = await deps.transport({
          method: 'POST',
          url: CREATE_TWEET_URL,
          headers: {
            Authorization: `Bearer ${req.auth.accessToken}`,
            'content-type': 'application/json',
          },
          body,
        })
      } catch (err) {
        // No response arrived — a network blip is worth retrying. Persist ONLY the error name:
        // a misbehaving transport could echo the Authorization header into `err.message`, and
        // `raw` is written to post_publish_logs — free-form dependency text must never land there.
        throw new AdapterError({
          message: 'X request failed before a response was received',
          code: 'NETWORK_ERROR',
          classification: 'transient',
          channel: 'x',
          raw: { name: err instanceof Error ? err.name : 'unknown' },
        })
      }

      if (res.status === 200 || res.status === 201) {
        const id = parseTweetId(res.body)
        if (!id) {
          throw new AdapterError({
            message: 'X returned success without a tweet id',
            code: 'BAD_RESPONSE',
            classification: 'permanent',
            channel: 'x',
            raw: { status: res.status, bodySample: res.body.slice(0, 300) },
          })
        }
        return {
          platformPostId: id,
          permalink: `https://x.com/i/web/status/${id}`,
          publishedAt: now().toISOString(),
          mode: 'live',
        }
      }

      throw classifyXHttpError(res)
    },
  }
}

function parseTweetId(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { data?: { id?: unknown } }
    const id = parsed.data?.id
    // Tweet ids are numeric snowflakes — reject anything else so a hostile/garbled response
    // can never reach the stored permalink (would be a stored-XSS primitive downstream).
    return typeof id === 'string' && /^\d+$/.test(id) ? id : undefined
  } catch {
    return undefined
  }
}
