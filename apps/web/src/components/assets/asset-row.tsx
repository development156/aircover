'use client'

import { Lock } from 'lucide-react'
import type { AssetFolder } from '@sahoda/shared'

import { AssetThumb } from '@/components/assets/asset-thumb'
import { FileMenuBody } from '@/components/assets/file-menu-body'
import { DELETE_ITEM_KEY, RENAME_ITEM_KEY } from '@/components/assets/library-shortcuts'
import { useAssetDragSource } from '@/components/assets/use-asset-drag'
import {
  isContextMenuKey,
  useContextMenuTrigger,
} from '@/components/assets/use-context-menu-trigger'
import type { AssetCard } from '@/lib/assets/view'
import { displayName, lockedSites, usageLine } from '@/lib/assets/view'
import { formatBytes } from '@/lib/format-bytes'
import { cn } from '@/lib/utils'
import { DEFAULT_ZONE } from '@/lib/time/zone'

/** `13 Oct 2025`. IST, same as every other date this screen reads out loud. */
const DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: DEFAULT_ZONE,
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
  onTrash,
  dragIds,
  navProps,
}: {
  card: AssetCard
  onOpen: () => void
  selectable?: boolean
  selected?: boolean
  /**
   * Selection click, carrying whether SHIFT was held. The flag comes from the
   * event rather than from a keyboard listener because a listener can be out of
   * date by a frame, and a stale shift is the difference between selecting one
   * file and selecting forty.
   */
  onToggleSelect?: (shift: boolean) => void
  onQuickLook?: () => void
  folders?: readonly AssetFolder[]
  insideFolderId?: string | null
  onFileInto?: (folderId: string) => void
  onRemoveFromFolder?: () => void
  onDeleted?: () => void
  onTrash?: () => void
  /**
   * The ids this tile's drag carries — the whole selection when this file is
   * part of it, otherwise just this file (`idsForDrag`). A function so the
   * selection is read at PICK-UP time: a value captured at render would carry
   * whatever was selected when the tile last painted.
   */
  dragIds?: () => readonly string[]
  /**
   * Roving-tabindex and arrow-key props from `useGridNav`. Absent means this
   * tile is an ordinary tab stop, which is what a tile outside the grid (the
   * composer's picker) should be.
   */
  navProps?: {
    'data-grid-tile': boolean
    tabIndex: number
    onKeyDown: (event: React.KeyboardEvent) => void
    onFocus: () => void
  }
}) {
  const locked = lockedSites(card).length > 0
  const size = formatBytes(card.bytes)
  const trigger = useContextMenuTrigger()
  const drag = useAssetDragSource(dragIds ?? (() => []))
  const menuEnabled =
    !selectable &&
    onFileInto !== undefined &&
    onRemoveFromFolder !== undefined &&
    onTrash !== undefined

  return (
    <div className="group relative">
      <button
        type="button"
        // Spread on the BUTTON, not the wrapper: the wrapper also holds the
        // "..." trigger, and making that draggable would mean grabbing the
        // menu button started a drag of the file instead of opening the menu.
        {...(dragIds !== undefined ? drag : {})}
        // `navProps` is spread WITHOUT its `onKeyDown`; that handler is called
        // from inside this file's own one instead.
        //
        // MEASURED, because the first version of this comment was wrong: a whole
        // spread HERE is harmless, since JSX is last-wins and the explicit
        // `onKeyDown` below would override it anyway. What actually breaks is a
        // whole spread placed AFTER that handler — then nav's handler replaces
        // it and F2, Delete and the context-menu key stop working silently.
        // So the protection is prop ORDER, which is invisible and easy to
        // disturb. Destructuring makes the intent explicit at the cost of
        // nothing, and `asset-library.test.tsx`'s F2 case is what actually
        // catches a reorder.
        {...(navProps === undefined
          ? {}
          : {
              'data-grid-tile': navProps['data-grid-tile'],
              tabIndex: navProps.tabIndex,
              onFocus: navProps.onFocus,
            })}
        onClick={selectable ? (event) => onToggleSelect?.(event.shiftKey) : onOpen}
        onKeyDown={(event) => {
          // Arrows and Home/End first. `useGridNav` claims only those six keys
          // and only unmodified, so everything below still gets its turn.
          navProps?.onKeyDown(event)
          if (event.defaultPrevented) return
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
          'flex w-full items-center gap-3 py-2 pr-9 pl-3 text-left transition-micro hover:bg-s2',
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
            onTrash={onTrash!}
          />
        </span>
      ) : null}
    </div>
  )
}
