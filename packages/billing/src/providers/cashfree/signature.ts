import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * How far a webhook timestamp may sit from local time. Cashfree does NOT replay-protect its
 * webhooks and a captured signature stays valid indefinitely, so this window is the only thing
 * stopping an intercepted delivery from being replayed later. Symmetric, to absorb clock skew.
 */
const DEFAULT_TOLERANCE_MS = 5 * 60_000

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

  const issuedAtMs = Number(timestamp)
  if (!Number.isFinite(issuedAtMs)) return false

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
