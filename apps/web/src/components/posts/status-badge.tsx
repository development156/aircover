import type { PostStatus } from '@sahoda/shared'

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

const STATUS_STYLES = {
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
  failed: { label: 'Failed', className: 'bg-danger-bg text-danger' },
  expired: { label: 'Expired', className: 'bg-s2 text-faint' },
} satisfies Record<PostStatus, StatusStyle>

export interface StatusBadgeProps {
  status: PostStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const style = STATUS_STYLES[status]

  return (
    <span
      data-status={status}
      className={cn(
        'inline-flex shrink-0 items-center rounded-pill px-2.5 py-[3px] text-[12px] leading-[18px] font-semibold',
        style.className,
        className,
      )}
    >
      {style.label}
    </span>
  )
}
