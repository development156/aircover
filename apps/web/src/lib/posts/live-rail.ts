import type { Channel } from '@sahoda/shared'

/**
 * The channels that can actually reach a platform today.
 *
 * `CONSTRAINTS[channel].publishable` answers a different question — whether the
 * Constraint Engine will format and validate a variant for that channel — and X,
 * GBP and LinkedIn all pass it. What they do not have is a working credential path:
 * `openSecret` is deliberately unwired in `apps/jobs`, so their publish attempt ends
 * at CONNECTION_UNAVAILABLE.
 *
 * Instagram is the exception because the credential is not ours to open: Zernio holds
 * the Meta token and we hold a reference to an account, so nothing needs unsealing.
 *
 * One definition, so the publish button and the connect page cannot drift into
 * disagreeing about what is real.
 */
export const LIVE_RAIL: ReadonlySet<Channel> = new Set<Channel>(['instagram'])

export function hasLiveRail(channel: Channel): boolean {
  return LIVE_RAIL.has(channel)
}
