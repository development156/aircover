import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Constant-time check on the `x-ops-token` header (doc 13 §9.6, §16).
 *
 * Both sides are hashed before comparison rather than compared directly.
 * `timingSafeEqual` throws on length mismatch, so the usual shape — compare
 * lengths, then compare bytes — leaks the token's length to anyone who can time
 * a request. Two SHA-256 digests are always 32 bytes, so the comparison is
 * genuinely constant-time over every input, including a one-character guess.
 *
 * A configured token shorter than 32 characters is treated as NOT configured.
 * Doc 13 §16 asks for ≥32 bytes of randomness, and quietly accepting a weak one
 * is how an endpoint ends up "authenticated" by a value someone can guess. The
 * env schema rejects it at boot too; this is the second of the two places,
 * because the route must not depend on boot validation having run.
 */
export function opsTokenMatches(provided: string | null, expected: string | undefined): boolean {
  if (!expected || expected.length < 32) return false
  if (!provided) return false

  const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest()
  return timingSafeEqual(digest(provided), digest(expected))
}

/** Is the endpoint usable at all? Distinguishes "misconfigured" from "forbidden". */
export function opsTokenConfigured(expected: string | undefined): boolean {
  return Boolean(expected && expected.length >= 32)
}
