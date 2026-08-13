import type { PostStatus } from '@sahoda/shared'

import { certaintyFor, type CertaintyLevel } from '@/lib/posts/certainty'
import type { PostOutcome } from '@/lib/posts/publish-evidence'
import { cn } from '@/lib/utils'

/**
 * Post lifecycle chip (FSD 0.5 statuses). Shared with the editor.
 *
 * The map is `satisfies Record<PostStatus, StatusStyle>` on purpose: adding a
 * value to `PostStatusSchema` becomes a COMPILE ERROR here rather than silently
 * rendering an unstyled/grey chip for a status nobody thought about.
 */
interface StatusStyle {
  label: string
  /** Token pairs only — see the dark accent-on-tint note below. */
  className: string
}

export const STATUS_STYLES = {
  idea: { label: 'Idea', className: 'bg-s2 text-muted' },
  draft: { label: 'Draft', className: 'bg-s2 text-muted' },
  // Sitting with a human: same grey surface as draft, but full-strength ink so
  // it reads as "someone owes this an answer" rather than "not started".
  review: { label: 'In review', className: 'bg-s2 text-ink' },
  // Cleared, not yet dated → brand tint. dark: --t100 stays warm-light while
  // --acc flips to Orange300 (~1.7:1), so the surface swaps to s2 on dark.
  approved: { label: 'Approved', className: 'bg-tint-100 text-accent dark:bg-s2' },
  scheduled: { label: 'Scheduled', className: 'bg-warn-bg text-warn' },
  publishing: { label: 'Publishing', className: 'bg-warn-bg text-warn' },
  published: { label: 'Published', className: 'bg-ok-bg text-ok' },
  // Deliberately not green and not red: it is genuinely both, and a colour that
  // picks a side would be the flattening this status exists to avoid.
  partial: { label: 'Partly published', className: 'bg-warn-bg text-warn' },
  failed: { label: 'Failed', className: 'bg-danger-bg text-danger' },
  expired: { label: 'Expired', className: 'bg-s2 text-muted' },
} satisfies Record<PostStatus, StatusStyle>

/**
 * Certainty level → the structural signature from tokens.css.
 *
 * These carry the meaning. `.is-real` is a solid fill, `.is-committed` a
 * hairline and tint, `.is-proposed` a dash, `.is-simulated` a hatch — each
 * survives recolour, greyscale and colour blindness, which the old
 * colour-only chips did not.
 *
 * `failed` is deliberately NOT one of them: a danger stroke on a transparent
 * surface, because failure is a different axis from how-real-a-thing-is.
 * `neutral` is the terminal/no-claim case.
 */
const CERTAINTY_CLASS: Record<CertaintyLevel, string> = {
  real: 'is-real',
  committed: 'is-committed',
  proposed: 'is-proposed',
  simulated: 'is-simulated',
  failed: 'border border-danger bg-transparent text-danger',
  neutral: 'border border-line bg-transparent text-muted',
}

/**
 * The status this chip may SAY, which is not always the one on the post row.
 *
 * ── WHY THE WORD ITSELF HAD TO MOVE ──────────────────────────────────────────
 * Changing only the certainty signature would have left the chip reading
 * "Approved" in a solid `.is-real` fill — a post the badge admits is live, under
 * a word that says nobody has sent it. `posts.status` is stale by design here:
 * the publish path writes `post_variants` and never touches the post row, so for
 * every post that actually went out, the column's word is the wrong one.
 *
 * The evidence outranks it. Where the variant rows say nothing — `none` (rows
 * exist, nothing sent) or `unknown` (nothing read) — intent is all there is, and
 * it is used unchanged.
 *
 * `simulated` deliberately maps to `published`: the channels ARE marked
 * published and denying that would contradict the chips beside it. The
 * simulation is named by the certainty label, which `.is-simulated` requires to
 * be visible text.
 */
export function displayStatus(intent: PostStatus, outcome: PostOutcome): PostStatus {
  switch (outcome) {
    case 'live':
    case 'simulated':
      return 'published'
    case 'partial':
      return 'partial'
    case 'failed':
      return 'failed'
    case 'none':
    case 'unknown':
      return intent
  }
}

export interface StatusBadgeProps {
  /**
   * What the user committed to — `posts.status`, under the name that says what
   * it actually is. NOT evidence that anything was published.
   */
  intent: PostStatus
  /**
   * What the variant rows PROVE (`outcomeOf`). REQUIRED — not optional — so a
   * call site cannot forget it and silently get the wrong claim. Pass the rows
   * through `outcomeOf([])` for "no rows"; that reports `unknown`, and the chip
   * falls back to intent rather than claiming anything.
   */
  outcome: PostOutcome
  className?: string
}

export function StatusBadge({ intent, outcome, className }: StatusBadgeProps) {
  const shown = displayStatus(intent, outcome)
  const style = STATUS_STYLES[shown]
  const certainty = certaintyFor(intent, outcome)

  return (
    <span
      data-testid="status-chip"
      data-status={shown}
      data-intent={intent}
      data-certainty={certainty.level}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-pill px-2.5 py-[3px] text-[12px] leading-[18px] font-semibold',
        CERTAINTY_CLASS[certainty.level],
        className,
      )}
    >
      {style.label}
      {/* UI_RULES_v3: `.is-simulated` ALWAYS carries a visible text label. The
          label comes from the mapping rather than from this call site, so it
          cannot be forgotten — and it is rendered text, not a title attribute,
          because the hatch alone is not a claim. */}
      {certainty.label !== null ? (
        <span className="type-eyebrow rounded-sm bg-surface px-1 py-px text-ink-mute">
          {certainty.label}
        </span>
      ) : null}
    </span>
  )
}
