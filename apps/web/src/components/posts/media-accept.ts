import { CONSTRAINTS, ChannelSchema } from '@sahoda/shared'
import type { Channel } from '@sahoda/shared'

/**
 * The `accept` list for the attach input, DERIVED from the Constraint Engine.
 * The mime types are never restated here, so a spec change in
 * `packages/shared/src/publishing/constraints.ts` carries into the file dialog
 * on its own.
 *
 * UNION, not intersection: `decideAttach` accepts a file that ANY selected
 * channel can use and reports the rest as warnings. Narrowing the picker to the
 * intersection would hide files the post can legitimately carry — a writer
 * targeting x and linkedin can want a gif only x will take.
 *
 * With nothing selected the union widens to every channel rather than
 * collapsing to nothing: `decideAttach` raises no objection when `channels` is
 * empty, so an empty accept list would have the picker refuse files the server
 * would happily take.
 *
 * This is a HINT ONLY. The dialog's filter can be switched off by the user and
 * `File.type` is a claim the browser makes, not a fact — the server reads the
 * bytes and decides for real (see `attachMedia`).
 *
 * Pure module: no I/O, no React, no clock.
 */

const KNOWN_CHANNELS: ReadonlySet<string> = new Set(Object.keys(CONSTRAINTS))

function isKnownChannel(channel: string): channel is Channel {
  return KNOWN_CHANNELS.has(channel)
}

/**
 * The channels a pre-pick hint is allowed to speak for.
 *
 * A channel with no spec is dropped rather than guessed at, exactly as
 * `decideAttach` drops it — the two must agree on what is being checked. With
 * nothing selected the scope widens to every channel rather than collapsing to
 * nothing, because `decideAttach` raises no objection on an empty post.
 */
function scopeFor(channels: readonly Channel[]): readonly Channel[] {
  const selected = channels.filter(isKnownChannel)
  return selected.length > 0 ? selected : ChannelSchema.options
}

export function acceptForChannels(channels: readonly Channel[]): string {
  const types = new Set<string>()
  for (const channel of scopeFor(channels)) {
    for (const type of CONSTRAINTS[channel].mediaTypes) types.add(type)
  }

  return [...types].join(',')
}

/**
 * The size ceiling to quote BEFORE the pick, in whole MB, for this post's own
 * channels — not the global upload cap.
 *
 * MAX over the scope, not min, because that is exactly `decideAttach`'s rule: a
 * file any one selected channel accepts is attached, and the rest are reported
 * as warnings. So the largest selected `maxMediaMB` is the real point past which
 * nothing on this post can use the file.
 *
 * Quoting the global cap here would misstate the limit on most posts — x, gbp
 * and linkedin all stop at 5 MB while instagram reaches 8, so a gbp-only post
 * told "up to 8 MB" sends the writer off to export a 7 MB file the server will
 * refuse. Derived from `CONSTRAINTS`, never restated, so it tracks the engine.
 */
export function capMbForChannels(channels: readonly Channel[]): number {
  return Math.max(...scopeFor(channels).map((channel) => CONSTRAINTS[channel].maxMediaMB))
}
