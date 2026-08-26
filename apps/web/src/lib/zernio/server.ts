import 'server-only'

import {
  createZernioClient,
  createZernioReads,
  createZernioSends,
  fetchTransport,
  type ZernioClient,
  type ZernioReads,
  type ZernioSends,
} from '@sahoda/publishing'

import { env } from '@/lib/env'
import { returnUrl } from '@/lib/zernio/return-url'

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

/**
 * The Zernio INBOX WRITE surface for this request, or null when the key is not there.
 *
 * A third handle rather than a method on either of the others, because these are three
 * different capabilities and the separation is load-bearing: a page that renders a
 * conversation calls `zernioClientReads()` and therefore holds nothing that can post.
 * Only a server action that is explicitly replying reaches for this one.
 *
 * Null propagates like the others — a caller with no key must say it could not send,
 * never report a reply it did not make.
 */
export function zernioClientSends(): ZernioSends | null {
  const apiKey = env.ZERNIO_API_KEY
  if (!apiKey) return null
  return createZernioSends({ transport: fetchTransport(), apiKey })
}

/** True when the rail is provisioned — drives whether the connect button is live. */
export function zernioAvailable(): boolean {
  return Boolean(env.ZERNIO_API_KEY)
}

/**
 * The absolute URL Zernio sends the browser back to, or `null` when this
 * environment cannot name one.
 *
 * ── STILL NOT DERIVED FROM THE REQUEST, AND FOR THE SAME REASON ──────────────
 * This URL is handed to a third party who will redirect a SIGNED-IN customer to
 * it, so a value built from `Host` or `X-Forwarded-Host` would be
 * attacker-influenceable. That ruling stands.
 *
 * What changed is that it is no longer one CONSTANT for every deployment.
 * `NEXT_PUBLIC_APP_URL` is set once on the Vercel project, so preview builds
 * carried the production origin and returned customers to production after they
 * had connected on a branch. The origin now comes from Vercel's own
 * platform-written variables, which no request can influence — see
 * `lib/zernio/return-url.ts` for the full argument and the rule.
 *
 * `null` rather than a relative path. `?? ''` used to produce
 * `/api/oauth/zernio/return`, a relative reference Zernio resolves against its
 * OWN origin; the caller must refuse to start the flow instead, because the grant
 * at the platform is real and cannot be undone once given.
 */
export function zernioReturnUrl(): string | null {
  return returnUrl({
    vercelEnv: process.env.VERCEL_ENV,
    vercelBranchUrl: process.env.VERCEL_BRANCH_URL,
    vercelUrl: process.env.VERCEL_URL,
    appUrl: env.NEXT_PUBLIC_APP_URL,
  })
}
