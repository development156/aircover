import { randomBytes, timingSafeEqual } from 'node:crypto'

import type { ZernioSelectionPlatform, ZernioSelectionState } from '@sahoda/publishing'
import type { ZernioPlatform } from '@sahoda/shared'

/**
 * THE STEP BETWEEN "APPROVED" AND "CONNECTED", AND WHY FACEBOOK NEEDED ONE.
 *
 * ── THE DEFECT ───────────────────────────────────────────────────────────────
 * Reported three times, last as "facebook is also not connecting". MEASURED
 * 2026-08-27 against the live API: `GET /v1/accounts` returned **zero** facebook
 * accounts across every profile on this key, while `GET /v1/connect/facebook`
 * returned a perfectly good authUrl every time it was asked. Nothing was failing.
 *
 * Facebook does not resolve to one account on approval — it resolves to every Page
 * the customer administers, and Google Business to every location. Somebody has to
 * pick one, and **Zernio creates no account until they do**. So our return trip
 * asked for the accounts under our profile, was correctly told there were none, and
 * reported that honestly. The connect was one step short of existing.
 *
 * ── WHY WE HOST THE PICKER RATHER THAN LETTING ZERNIO DO IT ──────────────────
 * Zernio's default is to host it on zernio.com. The founder has already reported
 * that screen, without knowing what it was: "it opens a popup and it opens another
 * new website and connects there ... change the logo and add sahodalabs logo and
 * also change from social media connector to Sahodalabs". That is a third-party
 * brand asking a Sahoda customer to choose a Facebook Page, inside a 620px popup.
 *
 * `headless=true` turns it off and returns the browser to our own return route
 * carrying the OAuth state. The picker is then ours: our words, our origin, and a
 * step we can see fail.
 *
 * ── ONLY TWO PLATFORMS, DELIBERATELY ─────────────────────────────────────────
 * Zernio's spec lists selection endpoints for LinkedIn organizations, Pinterest
 * boards, Snapchat profiles, Instagram-via-Facebook-Login and WhatsApp numbers as
 * well. Those are NOT switched. Instagram and LinkedIn connect end to end today —
 * MEASURED, they are the two accounts this workspace actually holds — and moving a
 * working flow onto an untested one to be consistent would trade a fix for a
 * regression. Adding a platform here is one entry plus its endpoints.
 */

/**
 * Our channel id → the name Zernio's selection endpoints use, or `null` for a
 * platform that resolves to an account on its own.
 *
 * NOT keyed exhaustively over `ZernioPlatform` on purpose: this is a small
 * allowlist of platforms whose selection flow has been read off the spec and
 * built, and a platform added to the enum tomorrow must default to the standard
 * flow rather than to a headless one nobody wrote the second half of.
 */
const SELECTION: Readonly<Partial<Record<ZernioPlatform, ZernioSelectionPlatform>>> = {
  facebook: 'facebook',
  gbp: 'googlebusiness',
  pinterest: 'pinterest',
  // Added 2026-08-27 after the founder photographed Zernio's own board picker
  // mid-connect: its wordmark, its domain, asking a Sahoda customer to choose a
  // Pinterest board. That is precisely the screen this path removes.

  // Added 2026-08-27 after the founder photographed Zernio's own board picker
  // mid-connect: its wordmark, its domain, asking a Sahoda customer to choose a
  // Pinterest board. That is precisely the screen this path removes.
}

/** Zernio's name back to ours. Built from the map above so the two cannot drift. */
const OURS: Readonly<Record<string, ZernioPlatform>> = Object.fromEntries(
  Object.entries(SELECTION).map(([ours, theirs]) => [theirs, ours as ZernioPlatform]),
)

/** True when this platform needs a pick after OAuth, so `headless=true` applies. */
export function selectionPlatformFor(platform: ZernioPlatform): ZernioSelectionPlatform | null {
  return SELECTION[platform] ?? null
}

/** The channel id that owns a selection platform, or null for a name we don't run. */
export function ourPlatformFor(selection: string): ZernioPlatform | null {
  return OURS[selection] ?? null
}

/**
 * The `step` values Zernio puts on a headless redirect, mapped to the platform
 * whose picker they belong to.
 *
 * Read from `https://zernio.com/openapi.json`, which documents `step=select_page`
 * for Facebook and `step=select_location` for Google Business. A step we do not
 * recognise produces `null`, which sends the trip down the ordinary reconcile path
 * — the behaviour every connect had before this file existed.
 */
const STEPS: Readonly<Record<string, ZernioSelectionPlatform>> = {
  select_page: 'facebook',
  select_location: 'googlebusiness',
  select_board: 'pinterest',
}

/** What a headless redirect is asking us to do, or null when it is not one. */
export interface SelectionRedirect {
  platform: ZernioSelectionPlatform
  /** Our channel id for it — never read from the query string. See below. */
  ours: ZernioPlatform
  state: ZernioSelectionState
}

/**
 * Read a headless redirect, or return null.
 *
 * ── THE PROFILE ID HERE IS NOT TRUSTED, IT IS COMPARED ───────────────────────
 * `profileId` arrives on the query string, which this route's header is explicit
 * about: anything the browser carries is attacker-influenceable. It is returned so
 * the caller can check it against the profile it looked up from our own table,
 * keyed by the workspace derived from the Clerk session. A mismatch is refused.
 * That is the same shape `upsert_zernio_connection`'s PROFILE_MISMATCH check uses,
 * one layer up.
 *
 * ── AND OUR PLATFORM IS DERIVED, NOT READ ────────────────────────────────────
 * Zernio also appends `platform=…` to the redirect, and our own return URL already
 * carries a `platform` parameter of its own with OUR vocabulary in it. For gbp the
 * two disagree — `gbp` versus `googlebusiness` — and which one `searchParams.get`
 * returns depends on whether Zernio appends or replaces. So `ours` comes from the
 * STEP, which only Zernio sets and which has exactly one meaning.
 */
export function readSelectionRedirect(
  params: URLSearchParams,
  /**
   * The platform the customer actually pressed Connect on, as the return route
   * already resolved it from the cookie and the return URL. Used only to
   * RECOGNISE a pick this function would otherwise fail to name — never to
   * decide that a pick is pending. See below.
   */
  pressed: ZernioPlatform | null = null,
): SelectionRedirect | null {
  /**
   * ── THE TOKEN IS THE EVIDENCE, AND `step` IS ONLY THE LABEL ───────────────
   * The first version required `step` to be exactly `select_page` or
   * `select_location`, read off the OpenAPI spec. Those two strings are the only
   * part of this redirect that has never been observed on the wire, and a wrong
   * guess is silent in the worst way: this function returns null, the trip falls
   * through to the ordinary reconcile, finds no facebook account — because Zernio
   * has not created one — and answers `zernio=nothing`. The customer sees exactly
   * the failure this whole flow was built to remove, and we learn nothing.
   *
   * So the primary evidence is now the TOKEN, which the spec states in prose
   * twice: "Extract tempToken and userProfile from the OAuth redirect params."
   * A `tempToken` or a `pendingDataToken` on this URL means one thing and cannot
   * mean anything else — Zernio is holding an authorised OAuth session that has
   * not yet resolved to an account, and it is waiting to be told which one.
   *
   * `step` is still read FIRST and still decides the platform when it is one we
   * know, because it is the unambiguous signal. `pressed` is the fallback, and it
   * is safe as a fallback in a way it would not be as a trigger: it comes from
   * our own cookie or our own return URL, it is validated against the shared
   * allowlist upstream, and on its own it authorises nothing. Both paths still
   * require a token AND a profile id, and the caller still compares that profile
   * against the one it read from our own table.
   */
  const step = params.get('step')?.trim() || null
  const profileId = params.get('profileId')?.trim()
  const tempToken = params.get('tempToken')?.trim() || undefined
  const pendingDataToken = params.get('pendingDataToken')?.trim() || undefined

  if (!profileId) return null
  if (!tempToken && !pendingDataToken) return null

  const platform =
    (step === null ? undefined : STEPS[step]) ??
    (pressed === null ? null : selectionPlatformFor(pressed))
  if (!platform) return null

  const ours = ourPlatformFor(platform)
  if (ours === null) return null

  return {
    platform,
    ours,
    state: {
      profileId,
      tempToken,
      pendingDataToken,
      userProfile: readUserProfile(params.get('userProfile')),
    },
  }
}

/**
 * A connect that SHOULD have ended in a pick and did not — named, so it can be
 * reported instead of disappearing into "we found nothing".
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * Facebook and Google Business create no account at Zernio until a choice is
 * committed. So for those two, "the customer pressed Connect, came back, and
 * there is no account" is not the ordinary empty answer that `zernio=nothing`
 * describes — it is a step that failed, and the two must not read the same.
 *
 * Returns the PARAMETER NAMES that arrived, never their values. `tempToken` is a
 * live Facebook user access token and `connect_token` is a Zernio credential;
 * the names alone say which shape came back, which is the whole diagnostic, and
 * they are safe to put in an error report.
 */
export function unresolvedSelection(
  pressed: ZernioPlatform | null,
  params: URLSearchParams,
): { platform: ZernioSelectionPlatform; sawParams: string[] } | null {
  if (pressed === null) return null
  const platform = selectionPlatformFor(pressed)
  if (platform === null) return null
  return { platform, sawParams: [...new Set([...params.keys()])].sort() }
}

/**
 * Facebook's select POST requires `userProfile`, and it rides the redirect.
 *
 * Zernio's own wording is "the decoded user profile object from the OAuth
 * callback", and a JSON object in a query parameter is carried either as JSON or
 * base64 depending on who wrote the callback. Both are tried, in that order, and a
 * value that is neither becomes `undefined` rather than a thrown parse error — a
 * malformed parameter must not turn a connect into a 500.
 *
 * Never inspected beyond "is this an object". Zernio encoded it and Zernio reads
 * it; nothing here has any business knowing its fields.
 */
function readUserProfile(raw: string | null): unknown {
  if (raw === null || raw.trim() === '') return undefined
  const attempts = [raw, safeBase64(raw)]
  for (const attempt of attempts) {
    if (attempt === null) continue
    try {
      const parsed: unknown = JSON.parse(attempt)
      if (typeof parsed === 'object' && parsed !== null) return parsed
    } catch {
      // Try the next encoding.
    }
  }
  return undefined
}

function safeBase64(raw: string): string | null {
  try {
    // base64url as well as base64: a JSON payload in a URL is commonly the former.
    return Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
  } catch {
    return null
  }
}

/**
 * THE PER-ATTEMPT NONCE, AND WHY THE PICKER CANNOT RUN WITHOUT IT.
 *
 * ── THE HOLE ─────────────────────────────────────────────────────────────────
 * Everything the picker needs (`profileId`, `tempToken`, `pendingDataToken`,
 * `userProfile`) arrives on the query string, and the only thing that bound it
 * to the signed-in customer was `profileId === the one in our table`. A profile
 * id is not a secret: it is on every return URL the customer's browser has ever
 * visited. So a top-level GET link carrying the VICTIM's profile id and the
 * ATTACKER's `tempToken` rendered a normal-looking picker, and one click
 * committed the attacker's Page under the victim's profile. Clerk's session
 * cookie is `SameSite=Lax`, which rides exactly that kind of navigation.
 *
 * ── THE FIX ──────────────────────────────────────────────────────────────────
 * The start route mints sixteen random bytes per press, puts them in an
 * `httpOnly` cookie AND on the return URL Zernio preserves. The return route
 * honours selection parameters, and a create scoped by the URL's `platform`,
 * only when the two agree. A link somebody else built cannot carry a value
 * that lives in the customer's own cookie jar, and a value read off an old URL
 * no longer matches the cookie the next press overwrote.
 *
 * `SameSite=Lax` for the same reason `sahoda_connect` is: the trip home is a
 * cross-site top-level GET, which `Lax` allows and `Strict` would drop.
 *
 * Read off the request's own `Cookie` header rather than `cookies()`, so the
 * route stays testable with a plain `Request` and there is no request-scoped
 * store to mutate.
 */
export const CONNECT_NONCE_COOKIE = 'sahoda_connect_nonce'

/** The query parameter the start route puts the same value on. */
export const RETURN_NONCE_PARAM = 'nonce'

/** Fifteen minutes, matching `sahoda_connect`: the two are spent together. */
const NONCE_MAX_AGE_SECONDS = 15 * 60

/** Sixteen bytes as base64url is exactly 22 characters of this alphabet. */
const NONCE_RE = /^[A-Za-z0-9_-]{22}$/

export function mintConnectNonce(): string {
  return randomBytes(16).toString('base64url')
}

/** The `Set-Cookie` VALUE, as a literal header. See `pending-connect.ts` for why. */
export function setConnectNonceHeader(nonce: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return (
    `${CONNECT_NONCE_COOKIE}=${nonce}` +
    `; Path=/; Max-Age=${NONCE_MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax${secure}`
  )
}

/** Spend it. Same `Path`, or the clear silently fails to match. */
export const CLEAR_CONNECT_NONCE = `${CONNECT_NONCE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`

/** The nonce in a raw `Cookie` header, or null when there is no well-formed one. */
export function readNonceCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() !== CONNECT_NONCE_COOKIE) continue
    const value = part.slice(eq + 1).trim()
    return NONCE_RE.test(value) ? value : null
  }
  return null
}

/**
 * Did this trip start from a press in THIS browser?
 *
 *   `matched`     cookie and URL carry the same well-formed nonce
 *   `absent`      one or both are missing or malformed
 *   `mismatched`  both present, and they differ
 *
 * The two refusals are kept apart because they are different facts with
 * different sentences: a dropped cookie is a browser we could not follow, a
 * mismatch is a link that belongs to another attempt.
 */
export type NonceVerdict = 'matched' | 'absent' | 'mismatched'

export function verifyConnectNonce(
  cookieHeader: string | null | undefined,
  params: URLSearchParams,
): NonceVerdict {
  const fromCookie = readNonceCookie(cookieHeader)
  const raw = params.get(RETURN_NONCE_PARAM)?.trim() ?? ''
  const fromUrl = NONCE_RE.test(raw) ? raw : null
  if (fromCookie === null || fromUrl === null) return 'absent'
  // Same length by construction (the regex fixes it), so this cannot throw.
  return timingSafeEqual(Buffer.from(fromCookie), Buffer.from(fromUrl)) ? 'matched' : 'mismatched'
}
