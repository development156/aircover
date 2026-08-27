'use client'

import type { AssetFolder, AssetSmartFolder } from '@sahoda/shared'

import { BulkBar } from '@/components/assets/bulk-bar'
import { BulkOutcomeBanner } from '@/components/assets/bulk-outcome-banner'
import { FilterChips } from '@/components/assets/filter-chips'
import { LibraryGrid } from '@/components/assets/library-grid'
import { LibraryLocationHeader } from '@/components/assets/library-location-header'
import type { LibraryView } from '@/components/assets/library-view-storage'
import type { BulkOutcome } from '@/components/assets/use-bulk-filing'
import type { LibraryLocation } from '@/lib/assets/organize-view'
import type { AssetCard } from '@/lib/assets/view'

/**
 * WHERE YOU ARE, PLUS EVERYTHING BELOW IT: the breadcrumb, F2's filter
 * chips, the grid or list itself, the bulk-action outcome and the bulk bar.
 * Split out of `asset-library.tsx` only to keep that file under 300 lines —
 * every prop here is already computed state or an already-bound callback,
 * nothing new is decided in this file.
 */
export function LibraryContent({
  location,
  unfiledOnly,
  folders,
  smart,
  currentFolderPath,
  onGoTo,
  onToggleDeep,
  unknownTotal,
  query,
  onQueryChange,
  view,
  visible,
  narrowing,
  selectMode,
  selected,
  onOpen,
  onToggleSelect,
  onQuickLook,
  onClearSearch,
  insideFolderId,
  onFileInto,
  onRemoveFromFolder,
  onDeleted,
  onTrash,
  bulkOutcome,
  bulkPending,
  onDismissBulkOutcome,
  showBulkRemove,
  onBulkFileInto,
  onBulkRemoveFromFolder,
  onClearSelection,
}: {
  location: LibraryLocation
  unfiledOnly: boolean
  folders: readonly AssetFolder[]
  smart: readonly AssetSmartFolder[]
  currentFolderPath: readonly AssetFolder[]
  onGoTo: (next: LibraryLocation) => void
  onToggleDeep: (deep: boolean) => void
  unknownTotal: number
  query: string
  onQueryChange: (query: string) => void
  view: LibraryView
  visible: readonly AssetCard[]
  narrowing: boolean
  selectMode: boolean
  selected: ReadonlySet<string>
  onOpen: (id: string) => void
  onToggleSelect: (id: string, shift: boolean) => void
  onQuickLook: (id: string) => void
  onClearSearch: () => void
  insideFolderId: string | null
  onFileInto: (id: string, folderId: string) => void
  onRemoveFromFolder: (id: string) => void
  onDeleted: (id: string) => void
  onTrash: (id: string) => void
  bulkOutcome: BulkOutcome | null
  bulkPending: boolean
  onDismissBulkOutcome: () => void
  showBulkRemove: boolean
  onBulkFileInto: (folderId: string) => void
  onBulkRemoveFromFolder: () => void
  onClearSelection: () => void
}) {
  return (
    <div className="min-w-0 flex-1 space-y-3">
      <LibraryLocationHeader
        location={location}
        unfiledOnly={unfiledOnly}
        folders={folders}
        smart={smart}
        currentFolderPath={currentFolderPath}
        onGoTo={onGoTo}
        onToggleDeep={onToggleDeep}
      />

      <FilterChips query={query} onQueryChange={onQueryChange} />

      {unknownTotal > 0 ? (
        <p className="type-meta text-muted">
          <span className="num">{unknownTotal}</span>
          {unknownTotal === 1 ? ' file could not be checked.' : ' files could not be checked.'}
        </p>
      ) : null}

      <LibraryGrid
        view={view}
        visible={visible}
        narrowing={narrowing}
        query={query}
        selectMode={selectMode}
        selected={selected}
        onOpen={onOpen}
        onToggleSelect={onToggleSelect}
        onQuickLook={onQuickLook}
        onClearSearch={onClearSearch}
        folders={folders}
        insideFolderId={insideFolderId}
        onFileInto={onFileInto}
        onRemoveFromFolder={onRemoveFromFolder}
        onDeleted={onDeleted}
        onTrash={onTrash}
      />

      <BulkOutcomeBanner
        outcome={bulkOutcome}
        pending={bulkPending}
        onDismiss={onDismissBulkOutcome}
      />

      {selectMode ? (
        <BulkBar
          count={selected.size}
          folders={[...folders]}
          showRemove={showBulkRemove}
          pending={bulkPending}
          onFileInto={onBulkFileInto}
          onRemoveFromFolder={onBulkRemoveFromFolder}
          onClear={onClearSelection}
        />
      ) : null}
    </div>
  )
}
