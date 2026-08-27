'use client'

import type { AssetFolder, AssetSmartFolder } from '@sahoda/shared'

import { FolderBreadcrumb } from '@/components/assets/folder-breadcrumb'
import { ROOT, locationName, type LibraryLocation } from '@/lib/assets/organize-view'

/** Where you are, plus (only inside a real folder) the path and the "include sub-folders" toggle. */
export function LibraryLocationHeader({
  location,
  unfiledOnly,
  folders,
  smart,
  currentFolderPath,
  onGoTo,
  onToggleDeep,
}: {
  location: LibraryLocation
  unfiledOnly: boolean
  folders: readonly AssetFolder[]
  smart: readonly AssetSmartFolder[]
  currentFolderPath: readonly AssetFolder[]
  onGoTo: (next: LibraryLocation) => void
  onToggleDeep: (deep: boolean) => void
}) {
  if (location.at === 'folder' && !unfiledOnly) {
    return (
      <FolderBreadcrumb
        path={[...currentFolderPath]}
        deep={location.deep}
        onNavigate={(id) =>
          id === null ? onGoTo(ROOT) : onGoTo({ at: 'folder', id, deep: false })
        }
        onToggleDeep={onToggleDeep}
      />
    )
  }
  return (
    <p className="type-sm font-semibold text-ink">
      {unfiledOnly ? 'Unfiled' : locationName(location, folders, smart)}
    </p>
  )
}
