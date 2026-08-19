'use client'

import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * A CHIP is a small piece of data the user put there — a channel on a post, a
 * filter they applied, a tag.
 *
 * NOT a badge. A badge is a STATUS the system computed and the user cannot
 * remove; a chip is an INPUT the user chose and usually can. Getting these two
 * confused is why `/posts` rendered channel names and lifecycle status in
 * visually similar pills, so a reader could not tell what was a fact about the
 * post from what was a decision they had made.
 *
 * A removable chip carries a real button with a real accessible name — never a
 * bare glyph, and never a click handler on the chip itself, which would make
 * "select" and "delete" the same gesture.
 */
export function Chip({
  children,
  onRemove,
  removeLabel,
  className,
}: {
  children: React.ReactNode
  onRemove?: () => void
  /** Required when removable — "Remove Instagram", not "Remove". */
  removeLabel?: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border border-line bg-s2 py-[3px] text-[12px] font-medium',
        onRemove ? 'pr-1 pl-2' : 'px-2',
        className,
      )}
    >
      {children}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? 'Remove'}
          className="grid size-[18px] place-items-center rounded-sm text-muted transition-micro hover:bg-surface hover:text-ink"
        >
          <X size={12} aria-hidden />
        </button>
      ) : null}
    </span>
  )
}
