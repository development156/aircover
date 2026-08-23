import { SiteLeadSubmitSchema } from '@sahoda/shared'

import { fixedWindowAllow } from '@/lib/ops/rate-limit'
import { submitSiteLead } from '@/lib/ops/service-rpc'
import { clientIpFrom, verifyTurnstile } from '@/lib/ops/turnstile'

/**
 * POST /api/public/site-lead — DOOR ONE INTO `leads`.
 *
 * The `leads` table shipped on 2026-07-18 with row-level security, five status
 * values and no writer at all. The /leads screen has said so in as many words
 * ever since: two doors, neither open. This is the first of them.
 *
 * The order of the checks is the design, and it is the same order
 * `api/public/beta-apply` uses, for the same reasons:
 *
 *   1. rate limit      — cheapest, and stops a flood before it costs anything
 *   2. shape           — zod, including the honeypot, before any network call
 *   3. Turnstile       — the expensive one, and only for plausible submissions
 *   4. write           — `lead_submit`, service-role, tenant resolved from the slug
 *
 * ── THE VISITOR IS NEVER TOLD WHOSE SITE THIS IS ─────────────────────────────
 * A slug that names no site and a slug that names one both answer the same way.
 * Distinguishing them would turn this endpoint into a way to enumerate which
 * Sahoda sites exist, which is a fact about other people's businesses.
 *
 * ── AND NOTHING IS EVER REPORTED AS STORED THAT WAS NOT ──────────────────────
 * The one thing a contact form must not do is thank somebody for an enquiry it
 * dropped. Every failure below says plainly that nothing was saved.
 */
export const dynamic = 'force-dynamic'

const PER_MINUTE = 5
const PER_DAY = 50

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
}

/** One sentence, no jargon — this renders inside somebody else's landing page. */
const COULD_NOT_SEND =
  'We could not send that just now. Nothing was saved. Please try again in a moment.'

export async function POST(request: Request): Promise<Response> {
  const ip = clientIpFrom(request.headers)

  // Both windows, because 5/min alone permits 7,200 a day.
  const minute = await fixedWindowAllow(`lead:${ip ?? 'unknown'}`, PER_MINUTE, 60)
  const day = await fixedWindowAllow(`lead:day:${ip ?? 'unknown'}`, PER_DAY, 86_400)
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

  const parsed = SiteLeadSubmitSchema.safeParse(raw)
  if (!parsed.success) {
    // The honeypot lives in the schema as `website: z.string().max(0)`, so a bot
    // that fills every field fails here and never reaches Turnstile or the
    // database. It is told the same thing as any other invalid submission —
    // naming the trap would teach the next bot to avoid it.
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))]
    return json(
      { ok: false, error: 'invalid', fields, message: 'Please check the details and try again.' },
      400,
    )
  }

  // A lead with no way to reply to it is not a lead. Checked here so a visitor
  // is told what to fix, and checked AGAIN inside `lead_submit`, because that is
  // a rule about the row rather than about this route.
  if (!parsed.data.email && !parsed.data.phone) {
    return json(
      {
        ok: false,
        error: 'no_contact',
        fields: ['email', 'phone'],
        message: 'Leave an email address or a phone number so they can reply.',
      },
      400,
    )
  }

  const captcha = await verifyTurnstile(parsed.data.turnstile_token, ip)
  if (!captcha.ok) {
    // Unprovisioned keys are a 503, not a silent pass. An unverified captcha on a
    // service-role insert is an open public endpoint, and the operator needs to
    // be able to tell "not set up" from "we think you are a bot".
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

  const stored = await submitSiteLead({
    siteSlug: parsed.data.site_slug,
    name: parsed.data.name,
    email: parsed.data.email,
    phone: parsed.data.phone,
    message: parsed.data.message,
    sourceUrl: parsed.data.source_url ?? null,
  })

  if (!stored.ok) {
    // `no_such_site` answers exactly as an outage does, and the status code is
    // the same. A 404 here would confirm which slugs are real.
    return json({ ok: false, error: 'unavailable', message: COULD_NOT_SEND }, 502)
  }

  // The id is deliberately NOT returned. It identifies a row in somebody else's
  // workspace to an anonymous caller, and the visitor has no use for it.
  return json({ ok: true, message: 'Thanks. They have your details and will be in touch.' }, 200)
}
