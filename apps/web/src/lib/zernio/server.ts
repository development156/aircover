import 'server-only'

import {
  createZernioClient,
  createZernioReads,
  fetchTransport,
  type ZernioClient,
  type ZernioReads,
} from '@sahoda/publishing'

import { env } from '@/lib/env'

/**
 * The Zernio client for this request, or null when the key is not provisioned.
 *
 * Null rather than a throw: the connect surface must be able to say "connecting
 * isn't available right now" honestly, and a build box with no key must still
 * compile and boot. Every caller handles the null — none of them pretend.
 *
 * The key never leaves this module's closure: it goes into the client's auth
 * header and is never logged, returned, or put in an error message.
 */
export function zernioClient(): ZernioClient | null {
  const apiKey = env.ZERNIO_API_KEY
  if (!apiKey) return null
  return createZernioClient({ transport: fetchTransport(), apiKey })
}

/**
 * The Zernio READ surface for this request, or null when the key is not provisioned.
 *
 * Separate from `zernioClient()` because these are different capabilities: that one
 * publishes and connects, this one only reads. Nothing here can write, so a screen
 * that merely displays metrics never holds a handle that could post.
 *
 * Null propagates the same way — a caller with no key must report "we could not
 * read this", never an empty or zeroed metric.
 */
export function zernioClientReads(): ZernioReads | null {
  const apiKey = env.ZERNIO_API_KEY
  if (!apiKey) return null
  return createZernioReads({ transport: fetchTransport(), apiKey })
}

/** True when the rail is provisioned — drives whether the connect button is live. */
export function zernioAvailable(): boolean {
  return Boolean(env.ZERNIO_API_KEY)
}

/**
 * The absolute URL Zernio sends the browser back to.
 *
 * Explicit rather than derived from the incoming request: a return URL built from
 * a forwarded host header is attacker-influenceable, and this one is handed to a
 * third party who will redirect a signed-in customer to it.
 */
export function zernioReturnUrl(): string {
  const origin = env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') ?? ''
  return `${origin}/api/oauth/zernio/return`
}
