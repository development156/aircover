import 'server-only'
import { createHash, timingSafeEqual } from 'node:crypto'

const BEARER = 'Bearer '

export interface CronAuthInput {
  /** The request's raw `authorization` header, or null when absent. */
  header: string | null
  /** `process.env.CRON_SECRET`. Undefined when the variable is not set. */
  secret: string | undefined
}

/**
 * Whether a request may run the scheduled sweeps.
 *
 * The cron route is a PUBLIC URL that mutates user data — it is excluded from Clerk's
 * middleware, because an unauthenticated cron request would otherwise be redirected to
 * /sign-in and Vercel cron does not follow redirects. This function is the only thing
 * standing in front of it.
 *
 * Vercel sends the value of the CRON_SECRET environment variable as an `Authorization`
 * header when it invokes a cron job, so the same check serves any other caller that can
 * present the secret (QStash, a workflow) if the schedule ever moves off Vercel.
 *
 * Two properties this deliberately has:
 *
 * 1. It fails CLOSED on a missing or empty secret. An unset variable is not "no auth
 *    required" — it is an endpoint that is not ready, and treating it as open would leave
 *    a public mutation endpoint live between deploy and configuration.
 * 2. It compares fixed-width SHA-256 digests rather than the raw tokens. `timingSafeEqual`
 *    throws on unequal lengths, so comparing raw bytes would turn a wrong-length token
 *    into a 500 and leak the secret's length; hashing first makes every comparison the
 *    same width and constant time.
 */
export function isAuthorizedCronRequest({ header, secret }: CronAuthInput): boolean {
  if (secret === undefined || secret.length === 0) return false
  if (header === null || !header.startsWith(BEARER)) return false

  const presented = header.slice(BEARER.length)
  return timingSafeEqual(sha256(presented), sha256(secret))
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}
