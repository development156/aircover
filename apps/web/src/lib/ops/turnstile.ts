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

/** The first hop we can attribute a submission to, for rate limiting. */
export function clientIpFrom(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || null
  return headers.get('x-real-ip')
}
