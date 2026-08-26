import 'server-only'

import { cookies } from 'next/headers'
import { ZERNIO_PLATFORMS, type ZernioPlatform } from '@sahoda/shared'

/**
 * WHAT THE CUSTOMER ACTUALLY ASKED TO CONNECT, REMEMBERED SERVER-SIDE.
 *
 * ── THE BUG THIS EXISTS TO CLOSE ─────────────────────────────────────────────
 * `/api/oauth/zernio/return` asks Zernio for the accounts under our profile on
 * EVERY platform and writes a row for each one it finds. Its own comment calls
 * that a self-heal, and for a write that failed on an earlier trip it is one.
 * Against a DISCONNECT it is a resurrection:
 *
 *   1. the customer disconnects Instagram — we delete our row
 *   2. Zernio still holds that account; there is no API to remove it, and the
 *      client in packages/publishing exposes no method that could
 *   3. the customer connects anything at all
 *   4. the return trip lists Instagram again and writes it straight back
 *
 * Reported as "when you disconnect and connect again the other platforms get
 * connected automatically". It is not a caching fault and not an optimistic UI
 * fault; it is the reconcile being wider than the customer's intent.
 *
 * ── WHY A COOKIE AND NOT THE QUERY STRING ────────────────────────────────────
 * The return route ignores every query parameter on purpose, and that ruling
 * stands: doc 13 §3 records that a wrong `accountId` does not error, it publishes
 * to somebody else's Instagram and returns 200. Nothing arriving through the
 * browser may steer a write.
 *
 * This is `httpOnly`, so page scripts cannot write it, and it is set by our own
 * start route in the same request that validated the platform. `SameSite=Lax` is
 * required rather than incidental: the trip home is a cross-site top-level GET
 * navigation (platform → Zernio → us), which `Lax` allows and `Strict` would
 * drop, leaving every real connect looking like a replay.
 *
 * ── AND IT CANNOT WIDEN ANYTHING, WHICH IS THE SAFETY ARGUMENT ───────────────
 * The workspace still comes from the session; this value only ever NARROWS which
 * platform may have a row CREATED for it. A forged value cannot reach another
 * tenant, cannot admit an account over the plan limit, and cannot write more rows
 * than the route writes today — the worst it can do is scope the create to a
 * platform the customer did not press, which is precisely what happens for all
 * four platforms right now. So this strictly reduces what a trip can write.
 */

/** One name, so nothing has to remember two halves of the same handshake. */
export const PENDING_CONNECT_COOKIE = 'sahoda_connect'

/**
 * Fifteen minutes. Long enough for a consent screen with a password reset and a
 * two-factor prompt in the middle of it; short enough that a cookie left behind by
 * an abandoned attempt is not still authorising a create an hour later.
 */
const MAX_AGE_SECONDS = 15 * 60

/** How the flow was started, which decides how the return trip answers. */
export type ConnectMode = 'popup' | 'redirect'

export interface PendingConnect {
  platform: ZernioPlatform
  mode: ConnectMode
}

const PLATFORMS: ReadonlySet<string> = new Set<string>(ZERNIO_PLATFORMS)
const MODES: ReadonlySet<string> = new Set<ConnectMode>(['popup', 'redirect'])

/** `<platform>.<mode>` — two fields, one cookie, no JSON to mis-parse. */
function encode(pending: PendingConnect): string {
  return `${pending.platform}.${pending.mode}`
}

/**
 * Parse the cookie, or null.
 *
 * Exported so it can be tested without a request. Every field is checked against
 * its own allowlist and a value that is not exactly two known parts is rejected
 * whole — there is no partial read here, because "the platform survived but the
 * mode did not" is a state nothing downstream should have to reason about.
 */
export function parsePendingConnect(raw: string | undefined): PendingConnect | null {
  if (!raw) return null
  const parts = raw.split('.')
  if (parts.length !== 2) return null
  const [platform, mode] = parts
  if (platform === undefined || mode === undefined) return null
  if (!PLATFORMS.has(platform) || !MODES.has(mode)) return null
  return { platform: platform as ZernioPlatform, mode: mode as ConnectMode }
}

/** Record the platform and the mode before the customer leaves for the consent screen. */
export async function setPendingConnect(pending: PendingConnect): Promise<void> {
  const store = await cookies()
  store.set(PENDING_CONNECT_COOKIE, encode(pending), {
    httpOnly: true,
    sameSite: 'lax',
    // Not hardcoded true: the local dev server is plain HTTP, and a `secure`
    // cookie there is silently never sent — which would make every local connect
    // look like a replay and send anyone debugging this straight past the cause.
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  })
}

/** What the customer asked for on this trip, or null if we cannot tell. */
export async function readPendingConnect(): Promise<PendingConnect | null> {
  const store = await cookies()
  return parsePendingConnect(store.get(PENDING_CONNECT_COOKIE)?.value)
}

/**
 * The `Set-Cookie` VALUE that spends it, as a literal header rather than a call
 * through `cookies()`.
 *
 * One press authorises one create pass. Leaving it set would let a bookmarked
 * replay of the return URL keep re-creating the row the customer just
 * disconnected — the same bug one layer along.
 *
 * ── WHY A HEADER AND NOT THE COOKIE STORE ────────────────────────────────────
 * The return route answers with `Response` objects it builds itself, including
 * 4xx/5xx HTML bodies whose status code is load-bearing and asserted. Mutating the
 * request-scoped cookie store and trusting the framework to merge the result into
 * a hand-built `Response` is a guess about behaviour nobody on this route has
 * proven. A header string is applied because it is written, and it is visible to
 * `curl -I`.
 *
 * `Max-Age=0` with the SAME `Path` the cookie was set on. A clear that omits the
 * path silently fails to match, which is the failure mode where everything looks
 * right and the cookie is still there on the next trip. No `Secure` attribute:
 * this only ever deletes, so a plain-HTTP dev server must be able to act on it.
 */
export const CLEAR_PENDING_CONNECT = `${PENDING_CONNECT_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
