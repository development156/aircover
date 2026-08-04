import type { Channel } from '@sahoda/shared'

/**
 * The channels that can actually reach a platform today.
 *
 * All four, through Zernio. `CONSTRAINTS[channel].publishable` answers a different
 * question — whether the Constraint Engine will format and validate a variant —
 * and what x, gbp and linkedin lacked was a working CREDENTIAL path: their native
 * adapters need `openSecret`, which is deliberately unwired, so every attempt
 * ended at CONNECTION_UNAVAILABLE and none of them has ever published anything.
 *
 * Zernio holds the credential for all four, so none of them needs unsealing. A
 * workspace that holds its own OAuth grant still publishes through the native
 * adapter — the store chooses by looking at the connection row, not the channel —
 * but the rail is what makes the channel reachable at all.
 *
 * One definition, so the publish button and the connect page cannot drift into
 * disagreeing about what is real.
 */
export const LIVE_RAIL: ReadonlySet<Channel> = new Set<Channel>([
  'instagram',
  'x',
  'gbp',
  'linkedin',
])

export function hasLiveRail(channel: Channel): boolean {
  return LIVE_RAIL.has(channel)
}
