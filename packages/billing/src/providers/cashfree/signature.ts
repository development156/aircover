import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * How far a webhook timestamp may sit from local time. Cashfree does NOT replay-protect its
 * webhooks and a captured signature stays valid indefinitely, so this window is the only thing
 * stopping an intercepted delivery from being replayed later. Symmetric, to absorb clock skew.
 */
const DEFAULT_TOLERANCE_MS = 5 * 60_000

/**
 * Boundary between an epoch expressed in SECONDS and one expressed in MILLISECONDS.
 *
 * Epoch milliseconds passed 1e12 in September 2001; epoch seconds will not reach it until
 * the year 33658. So any timestamp below this is seconds, and anything at or above it is
 * milliseconds, for every date this software will ever see.
 */
const EPOCH_MS_THRESHOLD = 1e12

/**
 * Normalize `x-webhook-timestamp` to milliseconds, whichever unit Cashfree sent.
 *
 * ── WHY THIS IS NOT JUST `Number(timestamp)` ─────────────────────────────────
 * The unit is not stated in the documentation, and getting it wrong is invisible to every
 * test in this repository: the HMAC concatenates the timestamp as a STRING, so the signature
 * verifies identically under either reading. Only the replay window is unit-sensitive — and
 * a test that signs its fixture in milliseconds and an implementation that assumes
 * milliseconds agree with each other while both being wrong.
 *
 * The failure that would cause is total and silent: seconds read as milliseconds put every
 * genuine delivery ~55 years in the past, so `Math.abs(now - issuedAt)` exceeds any
 * tolerance and EVERY real payment is rejected as a stale replay. Payments taken, credits
 * never granted. Peer rails are split on this — Stripe and Razorpay both send seconds — so
 * assuming either one is a coin flip on money.
 *
 * Accepting both costs nothing: the two ranges are twelve orders of magnitude apart, so
 * there is no ambiguous value an attacker could exploit to widen the window.
 */
export function parseCashfreeTimestampMs(timestamp: string | undefined): number | null {
  if (!timestamp) return null
  const value = Number(timestamp)
  if (!Number.isFinite(value)) return null
  return Math.abs(value) < EPOCH_MS_THRESHOLD ? value * 1000 : value
}

export interface CashfreeSignatureInput {
  /** The body EXACTLY as received. A re-stringified parse will not verify. */
  rawBody: string
  /** The `x-webhook-signature` header. */
  signature: string
  /** The `x-webhook-timestamp` header. */
  timestamp: string | undefined
  secretKey: string
  /** Injected for deterministic tests. */
  now?: Date
  toleranceMs?: number
}

/**
 * Verify a Cashfree PG webhook signature.
 *
 * Documented algorithm (x-api-version 2025-01-01):
 *
 *   signedPayload     := $timestamp.$payload        // PHP concat — no literal separator
 *   expectedSignature := Base64Encode(HMACSHA256($signedPayload, $merchantSecretKey))
 *
 * Note this replaced a completely different pre-2022 scheme (ksort-ed POST params, no
 * timestamp). Snippets implementing that older form are common online and are wrong here.
 *
 * Returns a boolean and never throws — a malformed signature is a rejection, not an error.
 */
export function verifyCashfreeSignature(input: CashfreeSignatureInput): boolean {
  const { rawBody, signature, timestamp, secretKey } = input

  // A missing timestamp cannot be silently treated as an empty one: that would verify a
  // body-only HMAC and drop replay protection entirely.
  if (!timestamp) return false

  // Unit-agnostic — see parseCashfreeTimestampMs. The HMAC below still uses the header
  // VERBATIM; only the freshness window is normalized.
  const issuedAtMs = parseCashfreeTimestampMs(timestamp)
  if (issuedAtMs === null) return false

  const nowMs = (input.now ?? new Date()).getTime()
  const toleranceMs = input.toleranceMs ?? DEFAULT_TOLERANCE_MS
  if (Math.abs(nowMs - issuedAtMs) > toleranceMs) return false

  const expected = createHmac('sha256', secretKey)
    .update(timestamp + rawBody)
    .digest('base64')

  return constantTimeEquals(expected, signature)
}

/** Length guard first — timingSafeEqual throws on unequal lengths. */
function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
