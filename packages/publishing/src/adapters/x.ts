import {
  AdapterError,
  type PublishAdapter,
  type PublishRequest,
  type PublishSuccess,
} from '@sahoda/shared'
import type { Transport, TransportResponse } from '../transport'

/** X API v2 create-post endpoint. Real network I/O is injected via {@link Transport}. */
const CREATE_TWEET_URL = 'https://api.twitter.com/2/tweets'

export interface XAdapterDeps {
  transport: Transport
  /** Injectable clock — deterministic in tests, real wall-clock in production. */
  now?: () => Date
}

/**
 * The X publish adapter. It translates the frozen `FormattedContent` (already shaped by
 * the shared Constraint Engine) into the X wire payload, posts it via the injected
 * transport, and returns a `PublishSuccess`. It NEVER retries — a transient
 * {@link AdapterError} tells the durable job to retry; a permanent one drives a reconnect CTA.
 */
export function createXAdapter(deps: XAdapterDeps): PublishAdapter {
  const now = deps.now ?? (() => new Date())

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

      const payload: { text: string; media?: { media_ids: string[] } } = { text: req.content.text }
      if (req.content.mediaIds && req.content.mediaIds.length > 0) {
        payload.media = { media_ids: req.content.mediaIds }
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

      throw classifyHttpError(res)
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

/** Map an HTTP failure to a classified AdapterError. `raw` carries only status + X's own detail. */
function classifyHttpError(res: TransportResponse): AdapterError {
  // Transient = worth retrying: rate limit, request timeout, or a server-side error. Everything
  // else (401/403/400/404/422 …) is permanent → the job stops and shows a reconnect/fix CTA.
  const isTransient = res.status === 408 || res.status === 429 || res.status >= 500
  return new AdapterError({
    message: `X publish failed with HTTP ${res.status}`,
    code: httpErrorCode(res.status),
    classification: isTransient ? 'transient' : 'permanent',
    channel: 'x',
    raw: { status: res.status, detail: safeDetail(res.body) },
  })
}

function httpErrorCode(status: number): string {
  if (status === 401) return 'UNAUTHORIZED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 408) return 'TIMEOUT'
  if (status === 429) return 'RATE_LIMITED'
  if (status >= 500) return 'SERVER_ERROR'
  return 'HTTP_ERROR'
}

/** Pull X's own error text (title/detail) for the reconnect CTA — never our request/token. */
function safeDetail(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { detail?: unknown; title?: unknown }
    const detail =
      typeof parsed.detail === 'string'
        ? parsed.detail
        : typeof parsed.title === 'string'
          ? parsed.title
          : undefined
    return detail?.slice(0, 300)
  } catch {
    return undefined
  }
}
