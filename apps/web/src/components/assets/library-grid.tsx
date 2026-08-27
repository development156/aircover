'use client'

import { AssetRow } from '@/components/assets/asset-row'
import { AssetTile } from '@/components/assets/asset-tile'
import type { LibraryView } from '@/components/assets/library-view-storage'
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
}: {
  view: LibraryView
  visible: readonly AssetCard[]
  narrowing: boolean
  query: string
  selectMode: boolean
  selected: ReadonlySet<string>
  onOpen: (id: string) => void
  onToggleSelect: (id: string) => void
  onQuickLook: (id: string) => void
}) {
  if (visible.length === 0) {
    return (
      <p className="surface-ring rounded-card bg-surface px-4 py-8 text-center type-sm text-muted">
        {narrowing
          ? `Nothing here matches “${query.trim()}”. Try a shorter word, or clear the filter.`
          : 'Nothing is here yet.'}
      </p>
    )
  }

  if (view === 'list') {
    return (
      <ul className="surface-ring flex flex-col divide-y divide-line-soft rounded-card bg-surface">
        {visible.map((card) => (
          <li key={card.id}>
            <AssetRow
              card={card}
              onOpen={() => onOpen(card.id)}
              selectable={selectMode}
              selected={selected.has(card.id)}
              onToggleSelect={() => onToggleSelect(card.id)}
              onQuickLook={() => onQuickLook(card.id)}
            />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <ul className="grid grid-cols-2 gap-3 narrow:grid-cols-3 wide:grid-cols-4">
      {visible.map((card) => (
        <li key={card.id}>
          <AssetTile
            card={card}
            onOpen={() => onOpen(card.id)}
            selectable={selectMode}
            selected={selected.has(card.id)}
            onToggleSelect={() => onToggleSelect(card.id)}
            onQuickLook={() => onQuickLook(card.id)}
          />
        </li>
      ))}
    </ul>
  )
}
