'use client'

import { ImageOff, SearchX } from 'lucide-react'
import type { AssetFolder } from '@sahoda/shared'

import { AssetRow } from '@/components/assets/asset-row'
import { AssetTile } from '@/components/assets/asset-tile'
import type { LibraryView } from '@/components/assets/library-view-storage'
import { useGridNav } from '@/components/assets/use-grid-nav'
import { idsForDrag } from '@/lib/assets/drag-payload'
import type { AssetCard } from '@/lib/assets/view'

/** The grid or the list, whichever view is active, and the one "nothing here" message both share. */
export function LibraryGrid({
  view,
  visible,
  narrowing,
  query,
  selectMode,
  selected,
  onOpen,
  onToggleSelect,
  onQuickLook,
  onClearSearch,
  folders,
  insideFolderId,
  onFileInto,
  onRemoveFromFolder,
  onDeleted,
  onTrash,
  onExtendSelectionTo,
}: {
  view: LibraryView
  visible: readonly AssetCard[]
  narrowing: boolean
  query: string
  selectMode: boolean
  selected: ReadonlySet<string>
  onOpen: (id: string) => void
  onToggleSelect: (id: string, shift: boolean) => void
  onQuickLook: (id: string) => void
  /** Clears the search box. Only ever offered while `narrowing` is true — a
   *  remedy that removes the one thing standing between "here" and "nothing". */
  onClearSearch: () => void
  /** F1: every tile's own right-click / "..." menu needs these to offer
   *  "File into folder" and (only inside a real folder) "Remove from this
   *  folder". */
  folders: readonly AssetFolder[]
  insideFolderId: string | null
  onFileInto: (id: string, folderId: string) => void
  onRemoveFromFolder: (id: string) => void
  onDeleted: (id: string) => void
  /** Moves one file to the trash, reported in the banner with Undo. */
  onTrash: (id: string) => void
  /**
   * Shift+Arrow landed on this index; extend the selection to it. Undefined
   * outside Select mode, which is what stops the hook claiming Shift+Arrow
   * there at all.
   */
  onExtendSelectionTo?: (index: number) => void
}) {
  // Declared BEFORE the empty-state return so the hook count never changes
  // between renders — the rule React enforces and the reason this is not
  // tucked inside the branch that uses it.
  const nav = useGridNav(visible.length, onExtendSelectionTo)

  if (visible.length === 0) {
    // B6: this used to be a big bordered card holding one centred sentence —
    // exactly the "big empty card" the founder circled. There is no ring, no
    // fill and no card here now: a small marker, a short sentence, and — only
    // when clearing the search would actually change anything — the one
    // action that does that.
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
        <span aria-hidden className="grid size-9 place-items-center rounded-md bg-s2 text-muted">
          {narrowing ? (
            <SearchX size={18} strokeWidth={1.7} />
          ) : (
            <ImageOff size={18} strokeWidth={1.7} />
          )}
        </span>
        <p className="type-sm text-muted">
          {narrowing
            ? `Nothing here matches “${query.trim()}”. Try a shorter word, or clear the filter.`
            : 'Nothing is here yet.'}
        </p>
        {narrowing ? (
          <button
            type="button"
            onClick={onClearSearch}
            className="type-sm font-semibold text-accent hover:underline"
          >
            Clear filter
          </button>
        ) : null}
      </div>
    )
  }

  if (view === 'list') {
    return (
      <ul
        ref={nav.containerRef as React.RefObject<HTMLUListElement>}
        className="surface-ring flex flex-col divide-y divide-line-soft rounded-card bg-surface"
      >
        {visible.map((card, index) => (
          <li key={card.id}>
            <AssetRow
              card={card}
              onOpen={() => onOpen(card.id)}
              selectable={selectMode}
              selected={selected.has(card.id)}
              onToggleSelect={(shift) => onToggleSelect(card.id, shift)}
              onQuickLook={() => onQuickLook(card.id)}
              folders={folders}
              insideFolderId={insideFolderId}
              onFileInto={(folderId) => onFileInto(card.id, folderId)}
              onRemoveFromFolder={() => onRemoveFromFolder(card.id)}
              onDeleted={() => onDeleted(card.id)}
              onTrash={() => onTrash(card.id)}
              dragIds={() => idsForDrag(card.id, selected)}
              navProps={nav.tileProps(index)}
            />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <ul
      ref={nav.containerRef as React.RefObject<HTMLUListElement>}
      className="grid grid-cols-2 gap-3 narrow:grid-cols-3 wide:grid-cols-4"
    >
      {visible.map((card, index) => (
        <li key={card.id}>
          <AssetTile
            card={card}
            onOpen={() => onOpen(card.id)}
            selectable={selectMode}
            selected={selected.has(card.id)}
            onToggleSelect={(shift) => onToggleSelect(card.id, shift)}
            onQuickLook={() => onQuickLook(card.id)}
            folders={folders}
            insideFolderId={insideFolderId}
            onFileInto={(folderId) => onFileInto(card.id, folderId)}
            onRemoveFromFolder={() => onRemoveFromFolder(card.id)}
            onDeleted={() => onDeleted(card.id)}
            onTrash={() => onTrash(card.id)}
            dragIds={() => idsForDrag(card.id, selected)}
            navProps={nav.tileProps(index)}
          />
        </li>
      ))}
    </ul>
  )
}
