import 'server-only'

import { env } from '@/lib/env'

/**
 * Cloudflare Turnstile, verified server-side (doc 13 §5).
 *
 * FAILS CLOSED, and that is the whole point. `packages/sites/CLAUDE.md` states
 * the rule for the sibling lead route in as many words: "an unprovisioned
 * captcha that degrades to accepting everything is an open public insert
 * endpoint on a service-role connection." So an unset secret is not "skip the
 * check" — it is `not_configured`, and the submission is refused.
 *
 * The token is single-use at Cloudflare's end, so a replayed one is rejected
 * there rather than here.
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export type TurnstileVerdict =
  { ok: true } | { ok: false; reason: 'not_configured' | 'rejected' | 'unreachable' }

export async function verifyTurnstile(
  token: string,
  remoteIp: string | null,
): Promise<TurnstileVerdict> {
  const secret = env.TURNSTILE_SECRET_KEY
  if (!secret) return { ok: false, reason: 'not_configured' }
  if (!token) return { ok: false, reason: 'rejected' }

  const body = new URLSearchParams({ secret, response: token })
  // Cloudflare treats remoteip as optional; sending it tightens the check when
  // we have it and is simply omitted when we do not.
  if (remoteIp) body.set('remoteip', remoteIp)

  try {
    const response = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store',
    })
    if (!response.ok) return { ok: false, reason: 'unreachable' }

    const result: unknown = await response.json()
    const success = (result as { success?: unknown } | null)?.success
    // Strictly true. A missing or truthy-but-not-true field is not a pass —
    // this is the one boolean in the request path that must not be coerced.
    return success === true ? { ok: true } : { ok: false, reason: 'rejected' }
  } catch {
    // Unreachable is NOT a pass. If we cannot tell whether a visitor is a bot,
    // the honest answer is that we could not check, and the caller refuses.
    return { ok: false, reason: 'unreachable' }
  }
}

/**
 * The hop we can attribute a submission to, for rate limiting.
 *
 * ── WHY NOT THE FIRST ENTRY, WHICH IS WHAT THIS USED TO TAKE ────────────────
 * `x-forwarded-for` is a LIST, and it is built left to right by each proxy
 * appending the peer it heard from. The LEFTMOST entry is therefore whatever the
 * original client claimed — a header, not an observation. Keying a rate limit on
 * it means a script sending a fresh random value per request gets a fresh bucket
 * per request, and the limit counts to one forever.
 *
 * The RIGHTMOST entry is the one appended by the proxy closest to us, which is
 * the only entry in the list we did not take a stranger's word for. It is also
 * correct in the other case: if the platform OVERWRITES the header rather than
 * appending — which Vercel may well do, and this audit could not measure from
 * outside — the list has one entry and rightmost and leftmost are the same
 * value. So this direction is right under both behaviours and wrong under
 * neither, which is why it was changed without waiting to find out which.
 *
 * `x-vercel-forwarded-for` is preferred where present because our own platform
 * sets it and a client cannot cause it to appear.
 *
 * ⚠ AND THIS IS NOT WHAT STOPS A SCRIPT ⚠ Turnstile is, and it fails CLOSED —
 * `unreachable` is a refusal, above. The rate limit is a cost control in front
 * of it. Reading this function as the bot defence would be reading a budget as a
 * lock.
 */
export function clientIpFrom(headers: Headers): string | null {
  // Each candidate FALLS THROUGH when it yields nothing, rather than being
  // consulted only when the header is absent. The old shape read `x-real-ip`
  // only if `x-forwarded-for` was missing entirely, so a client sending
  // `x-forwarded-for: " , "` suppressed the trustworthy header and got the
  // shared `'unknown'` bucket. Found by the test beside this file, not by
  // reading it.
  return (
    lastHop(headers.get('x-vercel-forwarded-for')) ??
    lastHop(headers.get('x-forwarded-for')) ??
    (headers.get('x-real-ip')?.trim() || null)
  )
}

function lastHop(value: string | null): string | null {
  if (value === null) return null
  const hops = value
    .split(',')
    .map((hop) => hop.trim())
    .filter((hop) => hop.length > 0)
  return hops[hops.length - 1] ?? null
}
