import { env } from '@/lib/env'
import {
  clerkUserIdFrom,
  primaryEmailFrom,
  svixHeadersFrom,
  verifySvixSignature,
} from '@/lib/ops/clerk-webhook'
import { linkClerkUser } from '@/lib/ops/service-rpc'

/**
 * POST /api/webhooks/clerk — `user.created` (doc 13 §4).
 *
 * Listed by EXACT path in middleware's public matcher, per the standing rule in
 * that file: a blanket `/api/webhooks(.*)` prefix is an unauthenticated hole
 * waiting for a route.
 *
 * The signature is verified against the RAW body before anything is parsed, and
 * before any database call. Parsing first and verifying the re-serialised text
 * would check a different string than the one Clerk signed.
 *
 * A verified event that we do not handle is a 200, not an error: Clerk retries
 * non-2xx, and retrying an event nobody wants forever is noise, not safety.
 */
export const dynamic = 'force-dynamic'

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
}

export async function POST(request: Request): Promise<Response> {
  // Text, not .json(). The signature covers these exact bytes.
  const rawBody = await request.text()

  const verdict = verifySvixSignature({
    secret: env.CLERK_WEBHOOK_SECRET,
    headers: svixHeadersFrom(request.headers),
    rawBody,
  })

  if (!verdict.ok) {
    // Never echo which check failed beyond its category, and never the payload.
    // A 401 for every rejection keeps this from being an oracle for forging.
    const status = verdict.reason === 'not_configured' ? 503 : 401
    return json({ ok: false, error: verdict.reason }, status)
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }

  const type = (payload as { type?: unknown } | null)?.type
  if (type !== 'user.created') {
    return json({ ok: true, ignored: String(type ?? 'unknown') }, 200)
  }

  const email = primaryEmailFrom(payload)
  const clerkUserId = clerkUserIdFrom(payload)
  if (!email || !clerkUserId) {
    // Verified but unusable. 200 so Clerk stops retrying something that will
    // never succeed, and the shortfall is named in the body for the log.
    return json({ ok: true, ignored: 'no_primary_email' }, 200)
  }

  const linked = await linkClerkUser(email, clerkUserId)
  if (!linked.ok) {
    // Genuinely transient — 502 so Clerk DOES retry this one.
    return json({ ok: false, error: 'unavailable' }, 502)
  }

  return json({ ok: true, linked_admin_seat: linked.linkedSeat }, 200)
}
