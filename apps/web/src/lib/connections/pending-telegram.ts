import 'server-only'

import { cookies } from 'next/headers'

/**
 * THE PAIRING CODE, HELD SERVER-SIDE FOR THE LIFE OF ONE ATTEMPT.
 *
 * ── WHY IT IS A COOKIE AND NOT A REQUEST PARAMETER ───────────────────────────
 * The poll needs a code to ask Zernio about, and the obvious build takes it from
 * the query string the page just received. That works, and it leaks: polling
 * `PATCH /v1/connect/telegram?code=…` with SOMEBODY ELSE'S code answers with
 * their status and, once it lands, their channel's title and type. Nothing about
 * the code is secret enough to stop a guess being tried, and there is no reason
 * for this app to be the thing that tries it.
 *
 * A code this browser was issued is the only code it can poll, because that is
 * the only one in its cookie jar. `httpOnly`, so a page script cannot read it
 * either — the screen is shown the code in its own response body and does not
 * need to hold it.
 *
 * ── AND THE POLL STILL DOES NOT TRUST WHAT COMES BACK ────────────────────────
 * Even a code that is genuinely ours only ever answers "has it landed". The
 * account is re-derived from `listAccounts` under the profile we read from our
 * own table, keyed by the workspace from the Clerk session — the same tenant
 * boundary the OAuth return route draws, for the same reason: doc 13 §3 records
 * that Zernio validates an accountId against the whole TEAM, so an id obtained
 * by polling is an id we have no business writing.
 *
 * ── FIFTEEN MINUTES ──────────────────────────────────────────────────────────
 * Zernio's own code lifetime, MEASURED: `expiresIn` came back as 900 seconds.
 * A cookie outliving the code would only ever authorise a poll that must answer
 * `expired`.
 */

export const PENDING_TELEGRAM_COOKIE = 'sahoda_telegram'

/** Fifteen minutes — Zernio's `expiresIn`, not a round number chosen here. */
const MAX_AGE_SECONDS = 15 * 60

/**
 * Zernio's codes look like `ZRN-DLPTJW`. MEASURED from a live issue.
 *
 * Validated on the way OUT of the cookie as well as in, because a cookie is
 * attacker-writable in ways the httpOnly flag does not cover (a subdomain, an
 * earlier XSS, a shared machine) and this value is interpolated into a URL we
 * call. Anything that is not this shape is treated as no code at all.
 */
const CODE_RE = /^[A-Z0-9]{2,8}-[A-Z0-9]{4,16}$/

export function isTelegramCode(value: unknown): value is string {
  return typeof value === 'string' && CODE_RE.test(value)
}

/**
 * The `Set-Cookie` VALUE, as a literal header.
 *
 * Same rule as the other two cookies on this flow, learned the hard way: these
 * routes answer with `Response` objects they build themselves, and mutating the
 * request-scoped cookie store puts no header on an object the framework never
 * sees. That omission alone caused two separate reported bugs on the OAuth flow.
 */
export function setPendingTelegramHeader(code: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return (
    `${PENDING_TELEGRAM_COOKIE}=${encodeURIComponent(code)}` +
    `; Path=/; Max-Age=${MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax${secure}`
  )
}

/** The code this browser was issued, or null. */
export async function readPendingTelegram(): Promise<string | null> {
  const store = await cookies()
  const raw = store.get(PENDING_TELEGRAM_COOKIE)?.value
  if (raw === undefined) return null
  const decoded = decodeURIComponent(raw)
  return isTelegramCode(decoded) ? decoded : null
}

/**
 * Spend it. Cleared once the attempt is over, in either direction — a landed
 * link has nothing left to poll, and an expired code can only answer `expired`
 * for the next fifteen minutes.
 */
export const CLEAR_PENDING_TELEGRAM = `${PENDING_TELEGRAM_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
