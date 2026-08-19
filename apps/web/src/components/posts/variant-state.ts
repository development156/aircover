import { ChannelSchema, type Channel, type PostVariant } from '@sahoda/shared'

import { parseExtras, type VariantExtras } from '@/lib/posts/variant-extras'
import type { SaveConflict } from '@/lib/posts/state'
import { expectedVersionFor, type VariantVersions } from '@/lib/posts/variant-version'

/**
 * What one channel's draft IS, and how it is seeded from the rows.
 *
 * Split out of `use-variants.ts` when that file crossed the 300-line rule. The
 * seam is the shape versus the behaviour: this file holds the state a version
 * can be in and how a server read becomes one, and nothing here writes anything.
 *
 * Pure: no React, no I/O, no clock.
 */

export interface VariantState {
  body: string
  extras: VariantExtras
  /** Local edits not yet written to `post_variants`. */
  dirty: boolean
  saving: boolean
  error: string | null
  /**
   * Another writer saved this channel while this one was editing. Reachable only
   * once migration 20260819000000 gives `post_variants` its version column; before
   * that the save cannot detect a clash and this stays null.
   * Carried on the state rather than derived, because the losing tab has to keep
   * showing its own text alongside the stored one.
   */
  conflict: SaveConflict | null
  /**
   * What this channel's stored copy is at, for the compare-and-set save.
   *
   * `undefined` is the ordinary state until migration 20260819000000 is applied:
   * the column is not there, so there is nothing to compare and the save behaves
   * exactly as it always has. `null` means the column IS there and this channel
   * has no copy yet — a save then creates one, and a second tab creating at the
   * same moment loses and is told.
   *
   * Kept on the state rather than in a ref because it changes on every successful
   * save and on every refusal, and both of those already rebuild this object.
   */
  version: number | null | undefined
  /**
   * This channel has never been written independently, so it FOLLOWS the post.
   *
   * ── WHY THIS EXISTS, AND WHY IT IS NOT A LIE ─────────────────────────────────
   * The publisher sends `post_variants.body` and nothing else — there is no
   * fallback to `posts.body` in `runPublishPost`. So a channel whose row is empty
   * publishes nothing, and an editor that showed the post's body in an empty
   * channel box would be describing something that cannot happen.
   *
   * Following therefore does not display the post's body while storing nothing.
   * It MIRRORS it into this channel's draft and marks the draft unsaved, so what
   * is on screen is what a save would write. The card says so in those words.
   *
   * It ends the moment the writer types here, or a generated variant lands: from
   * then on this channel is its own.
   */
  following: boolean
  /**
   * The live URL on the platform, once it exists. Server-owned and never edited
   * here — it is written by the publisher, and its PRESENCE is the only thing that
   * makes a post real (doc 13 §5). Local edits do not clear it: the post that went
   * out is still out.
   */
  permalink: string | null
}

export type VariantStates = Record<Channel, VariantState>

const EMPTY: Omit<VariantState, 'version' | 'body' | 'dirty' | 'following'> = {
  extras: {},
  saving: false,
  error: null,
  conflict: null,
  permalink: null,
}

export function seed(
  variants: readonly PostVariant[],
  versions: VariantVersions,
  canonicalBody: string,
): VariantStates {
  const byChannel = new Map<Channel, PostVariant>()
  for (const variant of variants) byChannel.set(variant.channel, variant)

  const states = {} as VariantStates
  for (const channel of ChannelSchema.options) {
    const row = byChannel.get(channel)
    // Read from `versions` rather than from the row: `PostVariantSchema` is frozen
    // and strips the column, so the row genuinely does not have it. See
    // `lib/posts/variant-version.ts`.
    const version = expectedVersionFor(versions, channel)
    // A row with copy in it is this channel's own. Everything else — no row at
    // all, or a row someone emptied — follows the post, which on the very first
    // render means it already holds the post's body as an unsaved draft.
    const own = row !== undefined && row.body !== ''
    states[channel] = own
      ? {
          ...EMPTY,
          body: row.body,
          dirty: false,
          following: false,
          extras: parseExtras(row.extras),
          version,
          permalink: row.permalink,
        }
      : {
          ...EMPTY,
          body: canonicalBody,
          // Unsaved, and truthfully so: this text is not in the row yet.
          dirty: canonicalBody !== '',
          following: true,
          extras: row === undefined ? {} : parseExtras(row.extras),
          version,
          permalink: row?.permalink ?? null,
        }
  }
  return states
}
