import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Svix webhook signature verification, which is what Clerk sends (doc 13 §4).
 *
 * Written here rather than taken from `@clerk/nextjs/webhooks` because that path
 * imports `svix`, which is not installed — and this repo's lockfile has already
 * cost one production outage, so a new dependency for forty lines of HMAC is a
 * bad trade. The scheme is fully specified: the signed content is
 * `${id}.${timestamp}.${rawBody}`, the secret is base64 after its `whsec_`
 * prefix, and the signature header carries one or more space-separated
 * `v1,<base64>` entries.
 *
 * THE RAW BODY MATTERS. Verification must run against the exact bytes received;
 * parsing to JSON and re-serialising changes key order and whitespace, and the
 * signature is over the original text.
 *
 * Everything is a verdict, never a throw, and every unexpected shape is
 * `invalid` — an unverified webhook that reaches application code is a stranger
 * writing to the database.
 */

export type WebhookVerdict =
  { ok: true } | { ok: false; reason: 'not_configured' | 'missing_headers' | 'stale' | 'invalid' }

/** Svix's own tolerance. A replay older than this is refused. */
export const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60

export interface SvixHeaders {
  id: string | null
  timestamp: string | null
  signature: string | null
}

export function svixHeadersFrom(headers: Headers): SvixHeaders {
  return {
    id: headers.get('svix-id'),
    timestamp: headers.get('svix-timestamp'),
    signature: headers.get('svix-signature'),
  }
}

export function verifySvixSignature({
  secret,
  headers,
  rawBody,
  now = Date.now(),
}: {
  secret: string | undefined
  headers: SvixHeaders
  rawBody: string
  now?: number
}): WebhookVerdict {
  if (!secret) return { ok: false, reason: 'not_configured' }
  if (!headers.id || !headers.timestamp || !headers.signature) {
    return { ok: false, reason: 'missing_headers' }
  }

  const sentAt = Number(headers.timestamp)
  if (!Number.isFinite(sentAt)) return { ok: false, reason: 'invalid' }

  // Both directions: a far-future timestamp is as much a forgery signal as an
  // old one, and only checking the past would accept it.
  const driftSeconds = Math.abs(now / 1000 - sentAt)
  if (driftSeconds > TIMESTAMP_TOLERANCE_SECONDS) return { ok: false, reason: 'stale' }

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  if (key.length === 0) return { ok: false, reason: 'not_configured' }

  const expected = createHmac('sha256', key)
    .update(`${headers.id}.${headers.timestamp}.${rawBody}`)
    .digest()

  // The header may carry several versioned signatures during a secret rotation.
  // Any v1 match is a pass; anything else is ignored rather than guessed at.
  const candidates = headers.signature
    .split(' ')
    .map((part) => part.split(','))
    .filter(([version]) => version === 'v1')
    .map(([, value]) => value ?? '')

  for (const candidate of candidates) {
    let decoded: Buffer
    try {
      decoded = Buffer.from(candidate, 'base64')
    } catch {
      continue
    }
    // timingSafeEqual throws on a length mismatch, which is itself a rejection.
    if (decoded.length === expected.length && timingSafeEqual(decoded, expected)) {
      return { ok: true }
    }
  }

  return { ok: false, reason: 'invalid' }
}

/**
 * The one field this application needs out of a `user.created` payload.
 *
 * Clerk sends every address the user has; the primary one is identified by id,
 * and falling back to the first is how an account with two addresses gets linked
 * to the wrong seat. Returns null rather than guessing.
 */
export function primaryEmailFrom(payload: unknown): string | null {
  const data = (payload as { data?: unknown } | null)?.data as
    | {
        id?: unknown
        primary_email_address_id?: unknown
        email_addresses?: unknown
      }
    | undefined
  if (!data) return null

  const addresses = Array.isArray(data.email_addresses) ? data.email_addresses : []
  const primaryId = data.primary_email_address_id

  const primary = addresses.find(
    (entry) => (entry as { id?: unknown } | null)?.id === primaryId,
  ) as { email_address?: unknown; verification?: { status?: unknown } } | undefined

  // VERIFIED, not merely primary. This address is about to be bound to an
  // ops_admins seat that may already be an active owner with user_id NULL —
  // seeded from ADMIN_BOOTSTRAP_EMAILS before that person ever signed up. The
  // only thing standing between "anyone who can create a Clerk account with
  // that string" and full console access was Clerk's Restricted mode, which is
  // a dashboard toggle this code cannot see or enforce. Requiring Clerk's own
  // verification verdict is the layer that does not depend on a setting
  // drifting.
  if (primary?.verification?.status !== 'verified') return null

  const value = primary?.email_address
  return typeof value === 'string' && value.includes('@') ? value : null
}

export function clerkUserIdFrom(payload: unknown): string | null {
  const id = ((payload as { data?: { id?: unknown } } | null)?.data ?? {}).id
  return typeof id === 'string' && id.length > 0 ? id : null
}
