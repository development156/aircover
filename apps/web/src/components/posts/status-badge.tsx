import type { PostStatus } from '@sahoda/shared'

import { certaintyFor, type CertaintyLevel, type PostPublishMode } from '@/lib/posts/certainty'
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

export interface StatusBadgeProps {
  status: PostStatus
  /**
   * What the publish logs prove. REQUIRED — not optional — so a call site cannot
   * forget it and silently get the wrong certainty. Pass `null` when unknown;
   * `certaintyFor` then renders the weaker claim.
   */
  mode: PostPublishMode
  className?: string
}

export function StatusBadge({ status, mode, className }: StatusBadgeProps) {
  const style = STATUS_STYLES[status]
  const certainty = certaintyFor(status, mode)

  return (
    <span
      data-testid="status-chip"
      data-status={status}
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
