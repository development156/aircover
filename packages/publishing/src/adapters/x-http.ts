import { AdapterError } from '@sahoda/shared'
import type { TransportResponse } from '../transport'

/**
 * Shared X HTTP error classification — one definition for the tweet-create and
 * media-upload calls. Transient = worth retrying (timeout, rate limit, server error);
 * everything else is permanent → the durable job stops and shows a reconnect/fix CTA.
 * `raw` is persisted to post_publish_logs, so it carries only the status + X's own
 * error text — never our request or token material.
 */
export function classifyXHttpError(res: TransportResponse): AdapterError {
  const isTransient = res.status === 408 || res.status === 429 || res.status >= 500
  return new AdapterError({
    message: `X request failed with HTTP ${res.status}`,
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

/** Pull X's own error text (title/detail) — never our request/token. */
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
