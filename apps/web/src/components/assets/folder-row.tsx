'use client'

import { FolderOpen } from 'lucide-react'
import type { AssetFolder } from '@sahoda/shared'

import { SidebarRow } from '@/components/assets/library-sidebar-row'
import { useFolderDropTarget } from '@/components/assets/use-asset-drag'
import { DELETE_ITEM_KEY, RENAME_ITEM_KEY } from '@/components/assets/library-shortcuts'
import {
  isContextMenuKey,
  useContextMenuTrigger,
  type ContextMenuTrigger,
} from '@/components/assets/use-context-menu-trigger'
import type { FolderTally, LibraryLocation } from '@/lib/assets/organize-view'

/**
 * ONE real folder's row, owning its own context-menu trigger — F1's
 * right-click and Shift+F10, feeding the exact same `FolderMenu` instance
 * the "..." button drives. This has to be its own component (not a helper
 * function called from a `.flatMap`) because `useContextMenuTrigger` is a
 * hook: called from a genuine per-folder component instance it is fine,
 * called from a loop inside `LibrarySidebar`'s own body it would change the
 * number of hooks that component calls every time a folder is added or
 * removed. Split into its own file only to keep `library-sidebar.tsx` under
 * 300 lines.
 */
export function FolderRow({
  folder,
  tally,
  depth,
  active,
  collapsed,
  onGoTo,
  onDropFiles,
  renderMenu,
}: {
  folder: AssetFolder
  tally: FolderTally
  depth: number
  active: boolean
  collapsed: boolean
  onGoTo: (next: LibraryLocation) => void
  /** Files dropped onto this folder. Absent means this row takes no drops. */
  onDropFiles?: (folderId: string, ids: string[]) => void
  renderMenu?: (folder: AssetFolder, trigger: ContextMenuTrigger) => React.ReactNode
}) {
  const trigger = useContextMenuTrigger()
  const { isOver, dropProps } = useFolderDropTarget((ids) => onDropFiles?.(folder.id, ids))
  return (
    <SidebarRow
      icon={FolderOpen}
      label={folder.name}
      count={tally.direct}
      depth={depth}
      active={active}
      collapsed={collapsed}
      onClick={() => onGoTo({ at: 'folder', id: folder.id, deep: false })}
      onContextMenu={
        renderMenu
          ? (event) => {
              event.preventDefault()
              trigger.openAtPoint(event.clientX, event.clientY, event.currentTarget)
            }
          : undefined
      }
      onKeyDown={
        renderMenu
          ? (event) => {
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
            }
          : undefined
      }
      menu={renderMenu ? renderMenu(folder, trigger) : undefined}
      dropProps={onDropFiles ? dropProps : undefined}
      isDropTarget={onDropFiles ? isOver : false}
    />
  )
}
