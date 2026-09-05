import { OpsBetaApplyInputSchema } from '@sahoda/shared'

import {
  CHALLENGE_MISSING_ERROR,
  CHALLENGE_MISSING_MESSAGE,
} from '@/components/embed/challenge-copy'
import { fixedWindowAllow } from '@/lib/ops/rate-limit'
import { submitBetaApplication } from '@/lib/ops/service-rpc'
import { clientIpFrom, verifyTurnstile } from '@/lib/ops/turnstile'

/**
 * POST /api/public/beta-apply — the embeddable form's only endpoint (doc 13 §5).
 *
 * The single genuinely public write in this application, on a service-role
 * connection, so the order of the checks is the design:
 *
 *   1. rate limit      — cheapest, and stops a flood before it costs anything
 *   2. shape           — zod, including the honeypot, before any network call
 *   3. Turnstile       — the expensive one, and only for plausible submissions
 *   4. write
 *
 * Every failure that is not the visitor's fault says so without blaming them,
 * and nothing here ever reports a submission we did not store.
 */
export const dynamic = 'force-dynamic'

const PER_MINUTE = 5
const PER_DAY = 20

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
}

/** One sentence, no jargon — this renders inside somebody else's landing page. */
const COULD_NOT_SEND =
  'We could not send that just now. Nothing was saved. Please try again in a moment.'

export async function POST(request: Request): Promise<Response> {
  const ip = clientIpFrom(request.headers)

  // Both windows, because 5/min alone permits 7,200 a day.
  const minute = await fixedWindowAllow(`beta:${ip ?? 'unknown'}`, PER_MINUTE, 60)
  const day = await fixedWindowAllow(`beta:day:${ip ?? 'unknown'}`, PER_DAY, 86_400)
  if (!minute.allowed || !day.allowed) {
    return json(
      {
        ok: false,
        error: 'rate_limited',
        message: 'That is a lot of requests. Try again shortly.',
      },
      429,
    )
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return json({ ok: false, error: 'invalid_json', message: COULD_NOT_SEND }, 400)
  }

  const parsed = OpsBetaApplyInputSchema.safeParse(raw)
  if (!parsed.success) {
    // The honeypot lives in this schema as `website: z.string().max(0)`, so a
    // bot that fills every field fails here and never reaches Turnstile or the
    // database. It is told the same thing as any other invalid submission —
    // naming the trap would teach the next bot to avoid it.
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))]
    // ONLY the token missing, every detail fine: the bot check never loaded on
    // the visitor's side (an ad blocker, a proxy, the challenge host blocked).
    // MEASURED 2026-09-02: this used to answer "check the details", and there
    // were no details to check. Any other failure keeps the generic sentence,
    // including the honeypot, which must never be named.
    if (fields.length === 1 && fields[0] === 'turnstile_token') {
      return json(
        { ok: false, error: CHALLENGE_MISSING_ERROR, fields, message: CHALLENGE_MISSING_MESSAGE },
        400,
      )
    }
    return json(
      {
        ok: false,
        error: 'invalid',
        fields,
        message: 'Please check the details and try again.',
      },
      400,
    )
  }

  const captcha = await verifyTurnstile(parsed.data.turnstile_token, ip)
  if (!captcha.ok) {
    // Unprovisioned keys are a 503, not a silent pass. An unverified captcha on
    // a service-role insert is an open public endpoint, and the operator needs
    // to be able to tell "not set up" from "we think you are a bot".
    if (captcha.reason === 'not_configured') {
      return json(
        {
          ok: false,
          error: 'not_configured',
          message: 'This form is not finished being set up yet. Nothing was saved.',
        },
        503,
      )
    }
    return json(
      {
        ok: false,
        error: captcha.reason,
        message:
          captcha.reason === 'unreachable'
            ? COULD_NOT_SEND
            : 'We could not confirm you are a person. Please try again.',
      },
      captcha.reason === 'unreachable' ? 502 : 400,
    )
  }

  const stored = await submitBetaApplication({
    name: parsed.data.name,
    businessName: parsed.data.business_name,
    email: parsed.data.email,
    phone: parsed.data.phone,
    sourceUrl: parsed.data.source_url ?? null,
  })
  if (!stored.ok) return json({ ok: false, error: 'unavailable', message: COULD_NOT_SEND }, 502)

  // The id is deliberately NOT returned. It identifies a row in an internal
  // table to an anonymous caller, and the visitor has no use for it.
  return json({ ok: true, message: "Thanks. We have your details and we'll be in touch." }, 200)
}
