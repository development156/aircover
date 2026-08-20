import {
  CheckCheck,
  CircleAlert,
  Clock,
  ExternalLink,
  LoaderCircle,
  MinusCircle,
  PencilLine,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { VariantPublishStatus } from '@sahoda/shared'

import { Unreadable } from '@/components/design-system/absence-row'
import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import type { CampaignCell } from '@/lib/campaigns/cell'
import { CERTAINTY_CLASS, type CertaintyLevel } from '@/lib/posts/certainty'
import { cn } from '@/lib/utils'

/**
 * One cell of the campaign grid: what ONE post is doing on ONE channel.
 *
 * ── THREE ENCODINGS, NONE OF THEM A HUE ──────────────────────────────────────
 * The palette has one orange and no red, so a cell that carried its meaning in
 * colour would carry none. Each cell says the same thing three ways:
 *
 *     FILL + EDGE  the Certainty System rung — how real this is
 *     GLYPH        what happens next on this channel
 *     WORD         the status, spelled out, never abbreviated to a symbol
 *
 * Any one of them is enough, which is what makes the grid readable in
 * greyscale, on a photocopy, and to a colour-blind reader.
 *
 * ── AND A FOURTH THING THAT IS NOT A TREATMENT: THE EMPTY CELL ───────────────
 * A post that does not target LinkedIn gets an empty LinkedIn cell. Not a dash,
 * not a mark, not a grey "n/a" — nothing, because there is no such quantity and
 * the absence vocabulary's answer to that is to delete the slot. The column
 * header still names the channel, so the gap in the column reads correctly at a
 * glance; the sentence a screen reader gets is `sr-only`, since a silent cell
 * would make the absence invisible rather than legible.
 */

/** Per-status glyph and word. Exhaustive: a new variant status is a compile error. */
const STATUS_META = {
  pending: { word: 'Not sent yet', icon: Clock },
  scheduled: { word: 'Booked', icon: Clock },
  publishing: { word: 'Going out', icon: LoaderCircle },
  published: { word: 'Live', icon: CheckCheck },
  failed: { word: 'Did not go out', icon: CircleAlert },
  skipped: { word: 'Skipped', icon: MinusCircle },
} satisfies Record<VariantPublishStatus, { word: string; icon: LucideIcon }>

export function ChannelCell({ cell }: { cell: CampaignCell }) {
  const channel = CHANNEL_LABELS[cell.channel]

  if (cell.kind === 'absent') {
    // Deliberately renders no mark. See the header.
    return <span className="sr-only">Not on {channel} — this post does not target it</span>
  }

  if (cell.kind === 'unreadable') {
    // The broken rule: the line to this cell is cut. Never the same object as
    // an empty cell, and never the same as "no body yet".
    return <Unreadable what={`This post’s ${channel} status`} />
  }

  if (cell.kind === 'unwritten') {
    return (
      <Mark
        certainty="proposed"
        icon={PencilLine}
        word="No body yet"
        hint={`${channel} is picked and has no caption of its own`}
      />
    )
  }

  const meta = STATUS_META[cell.status]
  return (
    <span className="inline-flex items-center gap-1.5">
      <Mark
        certainty={cell.certainty}
        icon={meta.icon}
        word={meta.word}
        hint={`on ${channel}`}
        // `.is-simulated` may never render without its word — the hatch alone is
        // not a claim. The label comes from the mapping, so no call site can
        // forget it.
        extra={cell.certaintyLabel}
      />
      {/* Keyed off the LINK, never off the status: a variant can read published
          while the platform is still finishing, and there is nothing real to
          point at until a URL exists. */}
      {cell.permalink ? (
        <a
          href={cell.permalink}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted transition-micro hover:text-ink"
        >
          <ExternalLink aria-hidden size={13} strokeWidth={2} />
          <span className="sr-only">Open the {channel} post</span>
        </a>
      ) : null}
    </span>
  )
}

function Mark({
  certainty,
  icon: Icon,
  word,
  hint,
  extra,
}: {
  certainty: CertaintyLevel
  icon: LucideIcon
  word: string
  hint: string
  extra?: string | null
}) {
  return (
    <span
      data-certainty={certainty}
      className={cn(
        'type-sm inline-flex items-center gap-1.5 rounded-sm px-1.5 py-[2px] font-[550] whitespace-nowrap',
        CERTAINTY_CLASS[certainty],
      )}
    >
      <Icon aria-hidden size={12} strokeWidth={2.25} className="shrink-0" />
      {word}
      <span className="sr-only"> {hint}</span>
      {extra ? (
        <span className="type-eyebrow rounded-sm bg-surface px-1 py-px text-ink-mute">{extra}</span>
      ) : null}
    </span>
  )
}

/**
 * The one figure the grid may report, and the sentence that goes with it.
 *
 * Both halves are counts of rows — targeted channel-slots, and the subset a
 * platform confirmed — so the fraction is derivable and neither number is
 * modelled. `null` means the variants could not be read, and then nothing is
 * rendered at all: `0 of 0` would be a claim, and this app has already shipped
 * one fraction with no real denominator.
 */
export function LiveCount({ count }: { count: { live: number; slots: number } | null }) {
  if (count === null) {
    return (
      <p className="type-sm flex items-center gap-2 text-muted">
        <Unreadable what="How much of this campaign is out" />
        Sahoda could not read where this campaign stands.
      </p>
    )
  }
  if (count.slots === 0) return null
  return (
    <p className="type-sm text-muted">
      <span className="num font-[550] text-ink">
        {count.live} of {count.slots}
      </span>{' '}
      channel {count.slots === 1 ? 'slot is' : 'slots are'} live on a platform.
    </p>
  )
}
