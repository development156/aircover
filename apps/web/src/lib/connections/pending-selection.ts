import 'server-only'

import { cookies } from 'next/headers'
import type { ZernioSelectionPlatform, ZernioSelectionState } from '@sahoda/publishing'

import { ourPlatformFor } from '@/lib/zernio/selection'

/**
 * THE OAUTH STATE FOR A HALF-FINISHED CONNECT, HELD SERVER-SIDE FOR ONE PICK.
 *
 * ── WHY THIS IS A COOKIE AND NOT A HIDDEN FORM FIELD ─────────────────────────
 * The obvious build puts `tempToken` in the picker's HTML as a hidden input and
 * posts it back. `tempToken` is a live Facebook user access token — it starts
 * `EAA` and Zernio's own error text names it as one. The rule in CLAUDE.md is
 * "OAuth tokens: AES vault, decrypt in memory, never log/return", and writing one
 * into a page body is returning it: it lands in the DOM, in view-source, in any
 * extension reading the page, and in whatever the browser caches.
 *
 * It arrived in that browser already, on the URL Zernio redirected to — that is
 * the flow's design and not ours to change. What we can decide is whether we hand
 * it BACK. An httpOnly cookie is unreadable to page scripts, carries no token into
 * the markup, and expires on its own.
 *
 * ── TEN MINUTES ──────────────────────────────────────────────────────────────
 * Zernio's spec says a pending-data token is one-time-use and expires after ten,
 * so a cookie outliving it would only ever authorise a call that must fail. Long
 * enough to read a list of Pages and choose; short enough that an abandoned
 * attempt is not still holding a platform credential an hour later.
 *
 * ── AND `SameSite=Lax` IS REQUIRED, NOT INCIDENTAL ───────────────────────────
 * Same argument as `pending-connect.ts`: the trip that SETS this is a cross-site
 * top-level GET (Facebook to Zernio to us), which `Lax` allows and `Strict` drops.
 * The POST that reads it is same-site, which `Lax` also allows.
 */

export const PENDING_SELECTION_COOKIE = 'sahoda_connect_pick'

/** Ten minutes. See the header — it is Zernio's own token lifetime, not a guess. */
const MAX_AGE_SECONDS = 10 * 60

export interface PendingSelection {
  platform: ZernioSelectionPlatform
  state: ZernioSelectionState
}

/**
 * base64url of JSON. Not encryption and not claimed to be: this cookie is
 * `httpOnly`, so the browser will not hand it to a script, and the encoding exists
 * only because a cookie value may not carry raw JSON. Anyone who can read the
 * cookie jar can read the token — and anyone who can do that already read it off
 * the URL it arrived on.
 */
function encode(pending: PendingSelection): string {
  return Buffer.from(JSON.stringify(pending), 'utf8').toString('base64url')
}

/**
 * Parse the cookie, or null.
 *
 * Exported so it can be tested without a request. Every field is checked: the
 * platform against the allowlist this app actually runs a picker for, and the
 * profile id against Zernio's 24-hex id shape. Anything else is rejected WHOLE.
 * A half-read state — "the platform survived but the token did not" — would reach
 * Zernio as a request missing a required field and come back as a 400 the customer
 * would see as "connecting is broken".
 */
export function parsePendingSelection(raw: string | undefined): PendingSelection | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null

  const { platform, state } = parsed as { platform?: unknown; state?: unknown }
  if (typeof platform !== 'string' || ourPlatformFor(platform) === null) return null
  if (typeof state !== 'object' || state === null) return null

  const { profileId, tempToken, pendingDataToken, userProfile } = state as Record<string, unknown>
  if (typeof profileId !== 'string' || !/^[0-9a-f]{24}$/.test(profileId)) return null

  const temp = typeof tempToken === 'string' && tempToken !== '' ? tempToken : undefined
  const pending =
    typeof pendingDataToken === 'string' && pendingDataToken !== '' ? pendingDataToken : undefined
  if (!temp && !pending) return null

  return {
    platform: platform as ZernioSelectionPlatform,
    state: {
      profileId,
      tempToken: temp,
      pendingDataToken: pending,
      userProfile,
    },
  }
}

/**
 * The `Set-Cookie` VALUE, as a literal header rather than a `cookies().set()` call.
 *
 * The same rule `pending-connect.ts` learned the hard way: these routes answer with
 * `Response` objects they build themselves, and mutating the request-scoped cookie
 * store puts no header on an object the framework never sees. That omission alone
 * caused two separate reported bugs on the connect flow. A header string is applied
 * because it is written, and it is visible to `curl -I`.
 *
 * `Secure` is conditional so the plain-HTTP dev server still sends it; a hardcoded
 * `Secure` would make every local pick look like an expired one.
 */
export function setPendingSelectionHeader(pending: PendingSelection): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return (
    `${PENDING_SELECTION_COOKIE}=${encode(pending)}` +
    `; Path=/; Max-Age=${MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax${secure}`
  )
}

/** The OAuth state for this trip, or null when we cannot read one. */
export async function readPendingSelection(): Promise<PendingSelection | null> {
  const store = await cookies()
  return parsePendingSelection(store.get(PENDING_SELECTION_COOKIE)?.value)
}

/**
 * Spend it. One redirect authorises one pick.
 *
 * Cleared on the failure paths too, and that is the point: a platform credential
 * left sitting in a cookie after the attempt it belonged to is over is exactly the
 * thing the ten-minute lifetime is there to bound. `Max-Age=0` with the SAME
 * `Path`, because a clear that omits the path silently fails to match.
 */
export const CLEAR_PENDING_SELECTION = `${PENDING_SELECTION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
