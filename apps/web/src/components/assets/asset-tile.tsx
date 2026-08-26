'use client'

import { Lock } from 'lucide-react'

import { AssetThumb } from '@/components/assets/asset-thumb'
import type { AssetCard } from '@/lib/assets/view'
import { displayName, lockedSites, usageLine } from '@/lib/assets/view'
import { formatBytes } from '@/lib/format-bytes'
import { cn } from '@/lib/utils'

/**
 * One tile. The whole tile is the control — a photo with a separate "open"
 * button beside it gives one thing two targets, and on a phone the photo is
 * what a thumb lands on.
 *
 * ── SELECTION IS AN OVERLAY, NEVER A SECOND CONTROL INSIDE THE BUTTON ────────
 * A checkbox nested inside a `<button>` is invalid HTML and unreachable by a
 * screen reader's rotor, exactly the reason `folder-tile.tsx` keeps its own
 * menu as a sibling rather than a child. In select mode the tile becomes a
 * `<div>` whose own click toggles selection, and the checkbox is decorative
 * inside it, painted rather than interactive on its own.
 */
export function AssetTile({
  card,
  onOpen,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  card: AssetCard
  onOpen: () => void
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: () => void
}) {
  const locked = lockedSites(card).length > 0
  const size = formatBytes(card.bytes)

  return (
    <button
      type="button"
      onClick={selectable ? onToggleSelect : onOpen}
      aria-pressed={selectable ? selected : undefined}
      className={cn(
        'surface-ring flex w-full flex-col overflow-hidden rounded-card bg-surface text-left transition-micro hover:bg-s1',
        selectable && selected ? 'shadow-[inset_0_0_0_2px_var(--acc)]' : '',
      )}
    >
      <span className="relative block">
        <AssetThumb card={card} className="aspect-[4/3] w-full" />
        {selectable ? (
          <span
            aria-hidden
            className={cn(
              'absolute top-1.5 left-1.5 grid size-5 place-items-center rounded-sm border transition-micro',
              selected
                ? 'border-accent bg-primary text-primary-foreground'
                : 'border-line-firm bg-surface',
            )}
          >
            {selected ? (
              <svg viewBox="0 0 16 16" width={11} height={11} aria-hidden>
                <path
                  d="M3 8.5 6.5 12 13 4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : null}
          </span>
        ) : locked ? (
          // Over the picture, because the picture is what a thumb reaches for
          // and the lock has to arrive before the press does.
          <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-pill bg-ink px-2 py-0.5 type-chip text-white dark:bg-white dark:text-[var(--canvas)]">
            <Lock size={10} strokeWidth={2.2} aria-hidden />
            In use
          </span>
        ) : null}
      </span>

      <span className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
        <span className="truncate type-sm font-semibold text-ink">{displayName(card)}</span>
        <span className="truncate type-meta text-muted">{usageLine(card)}</span>
        {size !== null ? <span className="num type-meta text-muted">{size}</span> : null}
      </span>
    </button>
  )
}
