'use client'

import type { AssetFolder, AssetSmartFolder } from '@sahoda/shared'

import { FolderMenu } from '@/components/assets/folder-menu'
import { SmartFolderMenu } from '@/components/assets/smart-folder-menu'
import type { ContextMenuTrigger } from '@/components/assets/use-context-menu-trigger'

/**
 * `LibrarySidebar`'s two menu renderers, split out of `asset-library.tsx`
 * only to keep that file under 300 lines. `undefined` for both while the
 * folder read failed — a menu offering to rename or delete a folder Sahoda
 * cannot currently vouch for is a control that might act on stale data.
 */
export function sidebarMenuRenderers({
  foldersUnreadable,
  folders,
  onSubfolderCreated,
}: {
  foldersUnreadable: boolean
  folders: AssetFolder[]
  onSubfolderCreated: (folderId: string) => void
}): {
  renderFolderMenu?: (folder: AssetFolder, trigger: ContextMenuTrigger) => React.ReactNode
  renderSmartMenu?: (entry: AssetSmartFolder) => React.ReactNode
} {
  if (foldersUnreadable) return {}
  return {
    renderFolderMenu: (folder, trigger) => (
      <FolderMenu
        folder={folder}
        allFolders={folders}
        trigger={trigger}
        onSubfolderCreated={onSubfolderCreated}
      />
    ),
    renderSmartMenu: (entry) => <SmartFolderMenu folder={entry} />,
  }
}
