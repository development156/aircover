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
 *
 * ── F1: RIGHT-CLICK, "...", AND SHIFT+F10 ALL OPEN THE SAME MENU ────────────
 * The trigger lives here (not inside `FileMenuBody`) for the same reason
 * `library-sidebar.tsx`'s `FolderRow` owns its own: the row IS the element
 * the right-click and the keyboard shortcut land on, and `FileMenuBody` is a
 * sibling of the tile's own button, never a child of it — a menu button
 * nested inside this `<button>` would be invalid HTML.
 */
export function AssetTile({
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
  /** Space toggles Quick Look; a click still opens the detail drawer. */
  onQuickLook?: () => void
  /** Destinations for the menu's "File into folder". */
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
          'surface-ring flex w-full flex-col overflow-hidden rounded-card bg-surface text-left transition-micro hover:bg-s1',
          selectable && selected ? 'shadow-[inset_0_0_0_2px_var(--acc)]' : '',
        )}
      >
        {/* B2: the wrapper carries the fixed aspect ratio AND `overflow-hidden`,
            so a preview whose intrinsic size does not match 4:3 is clipped by
            the tile's own frame rather than spilling past its rounded
            corners. The image itself is `object-cover` at `w-full h-full`,
            filling exactly this box instead of sizing itself and hoping the
            box agrees. */}
        <span className="relative block aspect-[4/3] w-full overflow-hidden">
          <AssetThumb card={card} className="h-full w-full" />
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
            // Over the picture, because the picture is what a thumb reaches
            // for and the lock has to arrive before the press does.
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

      {menuEnabled ? (
        <span className="absolute top-1.5 right-1.5 opacity-0 transition-micro group-focus-within:opacity-100 group-hover:opacity-100">
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
