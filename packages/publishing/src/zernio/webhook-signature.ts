import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Verification for Zernio webhook deliveries.
 *
 * The construction is not guessed. From Zernio's webhooks guide, verbatim:
 *
 *   "If the webhook has a secret configured, every delivery includes an
 *    `X-Zernio-Signature` header. The signature is the lowercase hex `HMAC-SHA256`
 *    of the raw request body keyed by your webhook secret."
 *
 * So: HMAC-SHA256, key = our secret, message = THE RAW BODY AND NOTHING ELSE,
 * lowercase hex, no `sha256=` prefix, no timestamp in the signed material.
 * `docs/29_Zernio_Webhooks_Contract.md` §1 carries the full extraction.
 *
 * ── WHY THIS TAKES A STRING AND NOT A REQUEST ────────────────────────────────
 * The bytes that were signed are the bytes that arrived. `await request.json()`
 * followed by `JSON.stringify` is a DIFFERENT byte sequence — key order, spacing
 * and unicode escaping all move — and the HMAC over it will not match. The caller
 * must read `await request.text()` exactly once and hand it here before anything
 * parses it. Taking a `Request` would invite this module to do the reading and get
 * it wrong somewhere a test would not look.
 *
 * ── WHY THE RESULT IS A BRANDED TYPE ─────────────────────────────────────────
 * `parseZernioWebhook` accepts only a `VerifiedZernioBody`, and only this file can
 * mint one. A caller cannot parse unverified bytes by forgetting a check, because
 * there is no unverified value of the right type to hand it. This mirrors the
 * `LiveVerifiedBody` shape the Cashfree receiver already uses.
 *
 * ── WHAT THIS FILE DELIBERATELY DOES NOT DO ──────────────────────────────────
 * There is no freshness window. Zernio signs no timestamp, and `payload.timestamp`
 * is pinned at event creation and repeated unchanged by every retry — up to 7
 * attempts spanning ~51 hours (docs/29 §3, §4). A window built on it would reject
 * the later attempts of exactly the events we missed. Replay is defended against by
 * the unique index on `event_id`, not by the clock.
 */

/** The header Zernio sends. */
export const ZERNIO_SIGNATURE_HEADER = 'x-zernio-signature'

/**
 * The legacy alias, "kept for backward compatibility" per the guide.
 *
 * Accepted as a FALLBACK only, never preferred: if a delivery somehow carried both
 * and they disagreed, honouring the legacy one would let an attacker who learned an
 * older secret keep using it. Read the current header first and only fall back when
 * it is absent entirely.
 */
export const ZERNIO_SIGNATURE_HEADER_LEGACY = 'x-late-signature'

/** Raw bytes proven to carry a valid signature. Only `verifyZernioWebhook` mints one. */
export type VerifiedZernioBody = string & { readonly __zernioVerified: unique symbol }

export type ZernioVerification =
  { ok: true; body: VerifiedZernioBody } | { ok: false; reason: 'no_signature' | 'bad_signature' }

/** Lowercase hex HMAC-SHA256 of `body` under `secret`. Exported for the test's forger. */
export function signZernioBody(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

/**
 * Constant-time compare of two hex signatures.
 *
 * `timingSafeEqual` THROWS when the two buffers differ in length, so a plain call
 * would turn a short forged signature into a 500 instead of a rejection — and a 500
 * on a public endpoint is both a lie about whose fault it is and a free oracle for
 * "was my guess the right length". Length is compared first, in the open: the
 * length of a signature is not a secret, the bytes are.
 */
function sameSignature(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

/**
 * Verify a delivery. `headers` is any Headers-like lookup; `rawBody` is the exact
 * text that arrived.
 *
 * FAILS CLOSED ON A MISSING HEADER. The signature is optional on ZERNIO's side — a
 * subscription created without a secret sends no header at all. That is a property
 * of how the subscription was configured, not a licence for the receiver to skip
 * the check: treating "no header" as "nothing to verify" would make this endpoint
 * accept anything from anyone who can find the URL. If the header is absent, either
 * the subscription is misconfigured or the caller is not Zernio, and both of those
 * are rejections.
 */
export function verifyZernioWebhook(args: {
  headers: { get(name: string): string | null }
  rawBody: string
  secret: string
}): ZernioVerification {
  const presented =
    args.headers.get(ZERNIO_SIGNATURE_HEADER) ?? args.headers.get(ZERNIO_SIGNATURE_HEADER_LEGACY)

  if (presented === null || presented.trim() === '') return { ok: false, reason: 'no_signature' }

  const expected = signZernioBody(args.rawBody, args.secret)
  // Zernio sends lowercase hex. Lowercasing what arrived means a correct signature
  // in the wrong case is honoured rather than rejected as a forgery; it widens
  // nothing, because hex case carries no information.
  if (!sameSignature(presented.trim().toLowerCase(), expected)) {
    return { ok: false, reason: 'bad_signature' }
  }

  return { ok: true, body: args.rawBody as VerifiedZernioBody }
}
