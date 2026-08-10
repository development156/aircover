import type { Channel } from '@sahoda/shared'

/**
 * The gap between the channels a post is aimed at and the channels that can
 * actually receive it — and the words for it, in one place.
 *
 * ── WHY THIS IS SHARED RATHER THAN WRITTEN TWICE ─────────────────────────────
 * `PublishNow` already said this at the Publish button. `ScheduleField` now says it
 * at the schedule, which is a different moment and a different sentence but the
 * same fact. Two hand-written versions of "which of these channels is missing" is
 * the drift this repo keeps paying for — the settled-schedule rule was written down
 * three times before anyone counted.
 *
 * Pure: no React, no clock, no I/O.
 */

/**
 * The picked channels with no live connection.
 *
 * `connected === undefined` means NOT KNOWN and yields `[]`. Silence is the only
 * honest output there: claiming a channel is unconnected because the read failed
 * would send someone to reconnect an account that is fine. Same rule the wallet
 * applies to an unreadable balance, and the same one `PublishNow` already carried.
 *
 * DISTINCT, in first-seen order. `post.channels` is a `text[]` off the row and the
 * planner hands it over untouched, so a repeat is reachable — and every caller uses
 * this list as a set: two of them count it to pick singular or plural wording, and
 * both render it as the names to go and reconnect. Undeduplicated, one repeated
 * channel produced "LinkedIn and LinkedIn aren’t connected" — two accounts named
 * where one is broken, on a plural verb the count had no right to.
 */
export function unconnectedFrom(
  channels: readonly Channel[],
  connected: ReadonlySet<Channel> | undefined,
): Channel[] {
  if (connected === undefined) return []
  return [...new Set(channels)].filter((channel) => !connected.has(channel))
}

/** `A` · `A and B` · `A, B and C`. Serial comma omitted to match the app's copy. */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * What the schedule picker says about channels that cannot receive this post.
 *
 * Two sentences, not one, because the difference matters to the reader: with some
 * channels still connected the post DOES go out — just not everywhere — and with
 * none of them connected nothing happens at all. Collapsing those into "some
 * channels aren't connected" leaves the writer unsure which they are in.
 *
 * Returns null when there is nothing to warn about, so a caller renders the ordinary
 * note instead of an empty warning.
 */
export function scheduleGapNote(
  unconnectedNames: readonly string[],
  /**
   * Whether ANY picked channel can still receive this post.
   *
   * Stated by the caller rather than inferred from a count. It was
   * `unconnectedNames.length >= totalChannels` for one revision, which is the same
   * thing only while `channels` holds no duplicates — and `post.channels` is a
   * `text[]` off the row, not a set. `['linkedin','linkedin']` with LinkedIn
   * unconnected gives `1 >= 2` false, and the picker would have promised the post
   * goes out when nothing could receive it. A condition that can be said directly
   * should not be derived from a length.
   */
  someChannelStillConnected: boolean,
): string | null {
  if (unconnectedNames.length === 0) return null

  const names = joinNames(unconnectedNames)
  const isPlural = unconnectedNames.length > 1
  const verb = isPlural ? 'aren’t' : 'isn’t'

  if (!someChannelStillConnected) {
    // Nothing this post is aimed at can receive it. The schedule is a promise with
    // no way to keep it, and saying "it goes out" first would bury that.
    return `Nothing goes out at that time — ${names} ${verb} connected.`
  }

  return `This goes out on its own at around that time — but ${names} ${verb} connected, so it won’t go out there.`
}
