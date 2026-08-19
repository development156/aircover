import type { Channel, ChannelSet, PostStatus, VariantPublishStatus } from '@sahoda/shared'

import { certaintyFor, type CertaintyLevel } from '@/lib/posts/certainty'
import { outcomeOf } from '@/lib/posts/publish-evidence'
import type { VariantStatusRow } from '@/lib/posts/variant-status'

/**
 * ONE POST, ONE CHANNEL, ONE TRUTH — the campaign grid's cell.
 *
 * ── WHY THIS IS THE SHAPE OF THE SCREEN ──────────────────────────────────────
 * Instagram's caption is not LinkedIn's. Each channel gets its own body, each
 * publishes on its own, and `post_variants.publish_status` is per channel. That
 * is the thing this product does that the tools it is compared against do not,
 * and a campaign is the first surface where several posts and several channels
 * are on screen at once — so it is the first place that fact can be shown as a
 * SHAPE rather than described in a sentence.
 *
 * Hence a grid: posts down, channels across. Collapsing a row to one campaign
 * status would throw away exactly the information the product is for, and it
 * would also be a claim no row proves — "this campaign is published" is not
 * something `post_variants` can ever say.
 *
 * ── FOUR CELL KINDS, AND WHY `absent` IS NOT A DASH ──────────────────────────
 * The absence vocabulary (docs/26 §4) has three states and only two of them get
 * a mark. A post that does not target LinkedIn does not have an unmeasured
 * LinkedIn or an unreadable one — there is NO such quantity, and the system's
 * answer to that is to delete the slot. So `absent` renders nothing at all: an
 * empty cell in a grid whose column header still names the channel is already
 * the complete statement, and it reads correctly at a glance because the eye
 * sees the gap in the column.
 *
 * `unreadable` is the one that must never be confused with it. `listVariantStates`
 * returns an EMPTY MAP on any read failure, so without this arm a hiccup would
 * render every targeted channel as "no body written yet" — a false claim about
 * every cell on the screen, wearing the costume of a designed empty state. The
 * broken rule says the line to this cell is cut, which is what actually happened.
 *
 * Pure: no React, no I/O, no clock.
 */

export type CampaignCell =
  /** This post never targeted this channel. Render NOTHING — see the header. */
  | { kind: 'absent'; channel: Channel }
  /** The variant read failed. Claim nothing; render the broken rule. */
  | { kind: 'unreadable'; channel: Channel }
  /**
   * The channel is chosen and no variant row exists — this channel has no body
   * of its own yet. A real, product-specific state, and the reason `hasBody` is
   * not folded into the certainty level: "nobody has written the Instagram
   * caption" and "the Instagram caption is written and waiting" are the same
   * rung of realness and completely different things to do next.
   */
  | { kind: 'unwritten'; channel: Channel; certainty: CertaintyLevel }
  /** A variant row exists. Its own status, its own certainty, its own link. */
  | {
      kind: 'variant'
      channel: Channel
      certainty: CertaintyLevel
      /** Required visible word for `simulated`; null otherwise. */
      certaintyLabel: string | null
      status: VariantPublishStatus
      permalink: string | null
    }

/**
 * Whether the variant rows for a post could be read at all.
 *
 * Three-way rather than a map-or-null, because "this post has no variants" and
 * "the variants query failed" arrive at the caller as the same empty map and
 * mean opposite things. Named at the boundary so no cell has to guess.
 */
export type VariantsRead =
  | { status: 'ok'; byPost: ReadonlyMap<string, readonly VariantStatusRow[]> }
  | { status: 'unreadable' }

/**
 * One row of the grid: the cells for every column, in the grid's column order.
 *
 * `columns` is the union across the WHOLE campaign, not this post's own channels
 * — that is what makes the grid a grid. A post's own channels decide only which
 * of those columns are `absent` for it.
 */
export function campaignRowCells(
  post: { id: string; status: PostStatus; channels: ChannelSet },
  columns: readonly Channel[],
  variants: VariantsRead,
): CampaignCell[] {
  const targeted = new Set<Channel>(post.channels)

  return columns.map((channel): CampaignCell => {
    // Checked FIRST, before the read status. A channel this post never targeted
    // is absent whether or not the query worked — reporting it as unreadable
    // would invent a gap where there is no slot.
    if (!targeted.has(channel)) return { kind: 'absent', channel }

    if (variants.status === 'unreadable') return { kind: 'unreadable', channel }

    const rows = variants.byPost.get(post.id) ?? []
    const row = rows.find((candidate) => candidate.channel === channel)

    if (!row) {
      // No row for a targeted channel. The certainty still comes from the post's
      // intent — approving a post commits every channel on it — but the body is
      // not there, which is what the caller renders in words.
      return { kind: 'unwritten', channel, certainty: certaintyFor(post.status, 'unknown').level }
    }

    // The per-channel certainty, through the SAME evidence path the post chip
    // uses. `outcomeOf([row])` is the whole point: one channel's rows are the
    // only admissible evidence about that one channel, and running them through
    // the argued-over collapse means a cell can never make a claim the post chip
    // would refuse to make.
    const certainty = certaintyFor(post.status, outcomeOf([row]))
    return {
      kind: 'variant',
      channel,
      certainty: certainty.level,
      certaintyLabel: certainty.label,
      status: row.status,
      permalink: row.permalink,
    }
  })
}

/**
 * How many of a campaign's channel-slots are live on a real platform.
 *
 * ── WHY THIS IS A FRACTION AND NOT A PERCENTAGE ──────────────────────────────
 * Both halves are counts of rows: the denominator is targeted channel-slots that
 * exist, the numerator is those a platform confirmed. A percentage would hide
 * which two numbers made it, and this app has already shipped one figure — the
 * rail's `100 of —` — that rendered a fraction with no denominator. Here the
 * denominator is real, so both numbers are shown and neither is derived.
 *
 * Returns null when the variants could not be read. A zero would be a claim.
 */
export function livePublishCount(
  rows: ReadonlyArray<{ cells: readonly CampaignCell[] }>,
): { live: number; slots: number } | null {
  let live = 0
  let slots = 0
  for (const row of rows) {
    for (const cell of row.cells) {
      if (cell.kind === 'absent') continue
      if (cell.kind === 'unreadable') return null
      slots += 1
      if (cell.kind === 'variant' && cell.certainty === 'real') live += 1
    }
  }
  return { live, slots }
}
