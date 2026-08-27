'use client'

import { Lock } from 'lucide-react'
import type { AssetFolder } from '@sahoda/shared'

import { AssetThumb } from '@/components/assets/asset-thumb'
import { FileMenuBody } from '@/components/assets/file-menu-body'
import { DELETE_ITEM_KEY, RENAME_ITEM_KEY } from '@/components/assets/library-shortcuts'
import {
  isContextMenuKey,
  useContextMenuTrigger,
} from '@/components/assets/use-context-menu-trigger'
import type { AssetCard } from '@/lib/assets/view'
import { displayName, lockedSites, usageLine } from '@/lib/assets/view'
import { formatBytes } from '@/lib/format-bytes'
import { cn } from '@/lib/utils'

/** `13 Oct 2025`. IST, same as every other date this screen reads out loud. */
const DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
})

/**
 * One file, as a dense row — list view's answer to `AssetTile`.
 *
 * Same control shape: the whole row is the button, and selection is an
 * overlaid mark rather than a checkbox nested inside it, for the reason
 * `asset-tile.tsx` gives at length (a control inside a control is invalid
 * HTML and unreachable by a screen reader's rotor). Same F1 wiring too: the
 * row owns its own context-menu trigger and `FileMenuBody` renders as a
 * sibling of the row's own button, never a child of it.
 */
export function AssetRow({
  card,
  onOpen,
  selectable = false,
  selected = false,
  onToggleSelect,
  onQuickLook,
  folders = [],
  insideFolderId = null,
  onFileInto,
  onRemoveFromFolder,
  onDeleted,
}: {
  card: AssetCard
  onOpen: () => void
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: () => void
  onQuickLook?: () => void
  folders?: readonly AssetFolder[]
  insideFolderId?: string | null
  onFileInto?: (folderId: string) => void
  onRemoveFromFolder?: () => void
  onDeleted?: () => void
}) {
  const locked = lockedSites(card).length > 0
  const size = formatBytes(card.bytes)
  const trigger = useContextMenuTrigger()
  const menuEnabled = !selectable && onFileInto !== undefined && onRemoveFromFolder !== undefined

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={selectable ? onToggleSelect : onOpen}
        onKeyDown={(event) => {
          if (event.key === ' ' || event.code === 'Space') {
            event.preventDefault()
            onQuickLook?.()
            return
          }
          if (!menuEnabled) return
          if (isContextMenuKey(event)) {
            event.preventDefault()
            trigger.openAtElement(event.currentTarget)
          } else if (event.key === RENAME_ITEM_KEY) {
            event.preventDefault()
            trigger.openAtElement(event.currentTarget, 'rename')
          } else if (event.key === DELETE_ITEM_KEY) {
            event.preventDefault()
            trigger.openAtElement(event.currentTarget, 'delete')
          }
        }}
        onContextMenu={
          menuEnabled
            ? (event) => {
                event.preventDefault()
                trigger.openAtPoint(event.clientX, event.clientY, event.currentTarget)
              }
            : undefined
        }
        aria-pressed={selectable ? selected : undefined}
        className={cn(
          // `pr-9` reserves the space the "..." trigger floats in, the same
          // trick `library-sidebar-row.tsx` uses — text truncates before it,
          // rather than the button and the trigger sharing one pixel.
          'flex w-full items-center gap-3 py-2 pr-9 pl-3 text-left transition-micro hover:bg-s1',
          selectable && selected ? 'bg-brand-wash' : '',
        )}
      >
        {selectable ? (
          <span
            aria-hidden
            className={cn(
              'grid size-5 shrink-0 place-items-center rounded-sm border transition-micro',
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
        ) : null}

        <AssetThumb card={card} className="size-10 shrink-0 rounded-sm object-cover" />

        <span className="min-w-0 flex-1 truncate type-sm font-semibold text-ink">
          {displayName(card)}
        </span>

        {locked && !selectable ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-ink px-2 py-0.5 type-chip text-white dark:bg-white dark:text-[var(--canvas)]">
            <Lock size={10} strokeWidth={2.2} aria-hidden />
            In use
          </span>
        ) : null}

        <span className="hidden w-[160px] shrink-0 truncate type-meta text-muted narrow:block">
          {usageLine(card)}
        </span>
        <span className="num hidden w-16 shrink-0 type-meta text-muted narrow:block">
          {size ?? ''}
        </span>
        <span className="num hidden w-20 shrink-0 type-meta text-muted wide:block">
          {DATE.format(new Date(card.createdAt))}
        </span>
      </button>

      {menuEnabled ? (
        <span className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 transition-micro group-focus-within:opacity-100 group-hover:opacity-100">
          <FileMenuBody
            card={card}
            folders={folders}
            insideFolderId={insideFolderId}
            trigger={trigger}
            onOpen={onOpen}
            onFileInto={onFileInto!}
            onRemoveFromFolder={onRemoveFromFolder!}
            onDeleted={onDeleted ?? (() => {})}
          />
        </span>
      ) : null}
    </div>
  )
}
