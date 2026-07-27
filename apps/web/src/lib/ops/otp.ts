import { createHash, randomInt } from 'node:crypto'

/**
 * The six digits that make the second admin a second admin (doc 13 §6).
 *
 * `randomInt` is the CSPRNG, not `Math.random()`. Six digits is only a million
 * possibilities, so the thing that actually protects this is the attempt
 * counter and the ten-minute window — but a predictable code would defeat both,
 * because a guess that can be computed does not need attempts.
 *
 * ONLY THE HASH IS EVER STORED. The plaintext exists in memory for exactly as
 * long as it takes to hand to the mailer, is never logged, never returned to
 * the requester, and never appears in an error. The requester learning the code
 * would turn maker-checker back into one person clicking twice.
 */

export const OTP_TTL_SECONDS = 600
export const OTP_MAX_ATTEMPTS = 3

/** Six digits, zero-padded, uniformly distributed over 000000–999999. */
export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/** sha256 hex — the only form that reaches the database. */
export function hashOtp(code: string): string {
  return createHash('sha256').update(code.trim(), 'utf8').digest('hex')
}

/** Six digits and nothing else, so a typo fails before a round trip. */
export function isWellFormedOtp(code: string): boolean {
  return /^\d{6}$/.test(code.trim())
}
