import { AlertCircle, FlaskConical, TriangleAlert } from 'lucide-react'
import type { PostStatus } from '@sahoda/shared'

import { autoPublishTruth, autoPublishCopy } from '@/lib/posts/schedule-status'
import type { VariantStatusRow } from '@/lib/posts/variant-status'
import { cn } from '@/lib/utils'

/**
 * The honest label under a "Scheduled" post.
 *
 * Same idiom as the publish preview's "Simulated — nothing was posted" banner:
 * warn tokens, and a sentence that states what did NOT happen rather than
 * leaving the badge to imply what did. Renders nothing at all for a post that
 * makes no auto-publish promise — see `autoPublishTruth` for why the rule is
 * narrow.
 *
 * Server component. `now` is a prop so one page render uses one instant across
 * every row, and so the note cannot drift between two renders of the same list.
 */

const ICONS = {
  // Echoes the fixture/simulated marker used elsewhere: this is the
  // not-yet-real path, not a fault.
  awaiting: FlaskConical,
  // A promise that has already failed is a warning, not a footnote — same icon
  // the wallet uses for holds nothing will release.
  overdue: TriangleAlert,
  // Something IS out. That is not a failed promise, it is an uneven one, so it
  // takes the softer of the two warning marks the app already uses.
  partial: AlertCircle,
  // The fixture marker again, and for the literal reason: this post's publishes
  // ran on the fixture rail.
  simulated: FlaskConical,
} as const

export interface AutoPublishNoteProps {
  status: PostStatus
  scheduledAt: string | null
  now: Date
  /**
   * Per-channel publish state for THIS post's channels, from `listVariantStates`.
   *
   * Required, and never optional: what a post has actually published is the whole
   * basis for what may be said about it, and a call site that forgot the prop
   * would silently revive the claim that this note exists to stop making. Pass
   * `[]` to mean "no rows" — see `autoPublishTruth` for why that is read as the
   * floor rather than as proof nothing published.
   */
  variants: readonly VariantStatusRow[]
  /** `compact` is for week-grid cells, which have room for about 14 characters. */
  variant?: 'full' | 'compact'
  /**
   * Whether the dispatcher is switched on HERE. From `autoPublishEnabled()` on the
   * server — defaulting to false so a call site that forgets it under-promises
   * rather than claiming an auto-publish that will not happen.
   */
  autoPublish?: boolean
  className?: string
}

export function AutoPublishNote({
  status,
  scheduledAt,
  now,
  variants,
  variant = 'full',
  autoPublish = false,
  className,
}: AutoPublishNoteProps) {
  const truth = autoPublishTruth(status, scheduledAt, now, variants)
  if (truth === 'none') return null

  const copy = autoPublishCopy(autoPublish)[truth]
  const Icon = ICONS[truth]

  if (variant === 'compact') {
    return (
      // Colour is inherited: the week-grid chip already paints itself from
      // STATUS_STYLES, and a second colour on top of it would fight the token
      // pair rather than read as part of the same chip.
      <span className={cn('flex items-center gap-1 text-[11px] font-semibold', className)}>
        <Icon size={11} strokeWidth={2.2} className="shrink-0" aria-hidden />
        <span aria-hidden>{copy.short}</span>
        {/* Sighted users get the abbreviation; nobody gets less of the truth. */}
        <span className="sr-only">{copy.note}</span>
      </span>
    )
  }

  return (
    <p className={cn('flex items-start gap-1.5 text-[12.5px] text-warn', className)}>
      <Icon size={13} strokeWidth={2} className="mt-[3px] shrink-0" aria-hidden />
      <span>{copy.note}</span>
    </p>
  )
}
