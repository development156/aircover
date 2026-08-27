'use client'

import {
  ChevronsLeft,
  ChevronsRight,
  CircleDashed,
  Images,
  Inbox,
  Layers,
  Link2,
  Sparkles,
  Trash2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AssetFolder, AssetSmartFolder } from '@sahoda/shared'

import { FolderRow } from '@/components/assets/folder-row'
import { NewFolderInline } from '@/components/assets/new-folder-inline'
import { SidebarRow } from '@/components/assets/library-sidebar-row'
import type { ContextMenuTrigger } from '@/components/assets/use-context-menu-trigger'
import { ASSET_FOLDERS, folderCounts, type FolderId } from '@/lib/assets/folders'
import {
  contentsAt,
  folderTally,
  unfiledCount,
  type LibraryLocation,
} from '@/lib/assets/organize-view'
import type { AssetCard } from '@/lib/assets/view'

const DERIVED_GLYPH: Record<FolderId, LucideIcon> = {
  image: Images,
  'in-use': Link2,
  unused: CircleDashed,
}

/**
 * FOLDERS, LEFT. This is the whole redesign in one file.
 *
 * The founder's verdict on the grid of overlapping folder cards it replaces
 * was "very complicated and not simple". A vertical list costs one line per
 * place instead of a 164px panel, states one real count per row in
 * `tabular-nums`, and a nested folder is indented rather than drawn as a
 * second card beside its parent — the tree is legible at a glance instead of
 * inferred from a "2 sub-folders" caption.
 */
export function LibrarySidebar({
  cards,
  folders,
  smart,
  now,
  location,
  unfiledOnly,
  onGoTo,
  onGoUnfiled,
  onOpenSmart,
  trashedCount,
  foldersUnreadable,
  droppedFolders,
  droppedSmart,
  newFolderParentId,
  onFolderCreated,
  renderFolderMenu,
  renderSmartMenu,
  collapsed = false,
  onToggleCollapsed,
}: {
  cards: AssetCard[]
  folders: AssetFolder[]
  smart: AssetSmartFolder[]
  now: Date
  location: LibraryLocation
  /** A client-only fourth place `LibraryLocation` has no slot for. */
  unfiledOnly: boolean
  onGoTo: (next: LibraryLocation) => void
  onGoUnfiled: () => void
  onOpenSmart: (id: string) => void
  /**
   * How many files are in the trash, MEASURED from its own read rather than
   * counted out of `cards` — the live list's SQL excludes them, so no filter
   * over `cards` could ever produce this number.
   */
  trashedCount: number
  foldersUnreadable: boolean
  droppedFolders: number
  droppedSmart: number
  newFolderParentId: string | null
  onFolderCreated: (id: string) => void
  renderFolderMenu?: (folder: AssetFolder, trigger: ContextMenuTrigger) => React.ReactNode
  renderSmartMenu?: (entry: AssetSmartFolder) => React.ReactNode
  collapsed?: boolean
  onToggleCollapsed?: () => void
}) {
  const counts = folderCounts(cards)

  function children(parentId: string | null): AssetFolder[] {
    return folders
      .filter((folder) => folder.parent_id === parentId)
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  // Recursive, depth-first: a folder's row is immediately followed by its own
  // children's rows, which is what makes the indentation below read as a tree
  // rather than as a flat list that happens to have numbers in front of it.
  function folderRows(parentId: string | null, depth: number): React.ReactNode[] {
    return children(parentId).flatMap((folder) => {
      const tally = folderTally(folder.id, cards, folders)
      const active = !unfiledOnly && location.at === 'folder' && location.id === folder.id
      return [
        <FolderRow
          key={folder.id}
          folder={folder}
          tally={tally}
          depth={depth}
          active={active}
          collapsed={collapsed}
          onGoTo={onGoTo}
          renderMenu={renderFolderMenu}
        />,
        ...folderRows(folder.id, depth + 1),
      ]
    })
  }

  return (
    <nav
      aria-label="Library places"
      data-guide="assets.sidebar"
      className={
        collapsed ? 'flex w-14 shrink-0 flex-col gap-3' : 'flex w-[220px] shrink-0 flex-col gap-3'
      }
    >
      {onToggleCollapsed ? (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expand folders' : 'Collapse folders'}
          className="grid size-7 place-items-center self-end rounded-sm text-muted transition-micro hover:bg-s2 hover:text-ink"
        >
          {collapsed ? (
            <ChevronsRight size={14} aria-hidden />
          ) : (
            <ChevronsLeft size={14} aria-hidden />
          )}
        </button>
      ) : null}

      <div className="flex flex-col gap-0.5">
        <SidebarRow
          icon={Layers}
          label="All files"
          count={cards.length}
          active={!unfiledOnly && location.at === 'all'}
          collapsed={collapsed}
          onClick={() => onGoTo({ at: 'all' })}
        />
        {ASSET_FOLDERS.map((folder) => (
          <SidebarRow
            key={folder.id}
            icon={DERIVED_GLYPH[folder.id]}
            label={folder.name}
            count={counts[folder.id]}
            active={!unfiledOnly && location.at === 'derived' && location.id === folder.id}
            collapsed={collapsed}
            onClick={() => onGoTo({ at: 'derived', id: folder.id })}
          />
        ))}
      </div>

      {foldersUnreadable ? (
        collapsed ? null : (
          <p className="type-meta text-muted">
            Sahoda could not read your folders. This is not a claim that you have none.
          </p>
        )
      ) : (
        <>
          <div className="flex flex-col gap-1">
            {collapsed ? null : <p className="px-2.5 type-eyebrow text-muted">Folders</p>}
            <div className="flex flex-col gap-0.5">{folderRows(null, 0)}</div>
            {collapsed ? null : (
              <div className="px-1">
                <NewFolderInline parentId={newFolderParentId} onCreated={onFolderCreated} />
              </div>
            )}
          </div>

          {smart.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {collapsed ? null : <p className="px-2.5 type-eyebrow text-muted">Saved searches</p>}
              {smart.map((entry) => {
                const result = contentsAt(
                  { at: 'smart', id: entry.id },
                  cards,
                  folders,
                  [entry],
                  now,
                  // A saved search never matches a trashed file: the trash is
                  // not a place a search reaches into, and a count that
                  // included one would send a person to a list it is not in.
                  [],
                )
                return (
                  <SidebarRow
                    key={entry.id}
                    icon={Sparkles}
                    label={entry.name}
                    count={result.files.length}
                    active={!unfiledOnly && location.at === 'smart' && location.id === entry.id}
                    collapsed={collapsed}
                    onClick={() => onOpenSmart(entry.id)}
                    menu={renderSmartMenu ? renderSmartMenu(entry) : undefined}
                  />
                )
              })}
            </div>
          ) : null}

          {!collapsed && (droppedFolders > 0 || droppedSmart > 0) ? (
            <p className="type-meta text-muted">
              {droppedFolders > 0
                ? `${droppedFolders} folder${droppedFolders === 1 ? '' : 's'} could not be read. `
                : ''}
              {droppedSmart > 0
                ? `${droppedSmart} saved search${droppedSmart === 1 ? '' : 'es'} could not be read. `
                : ''}
              This is not a claim that you have none.
            </p>
          ) : null}

          <SidebarRow
            icon={Inbox}
            label="Unfiled"
            count={unfiledCount(cards)}
            active={unfiledOnly}
            collapsed={collapsed}
            onClick={onGoUnfiled}
          />

          {/* LAST, and after a divider, because it is the only row here that is
              not part of the library. Everything above is somewhere your files
              live; this is where they go when you say you do not want them. */}
          <div className="my-1 border-t border-line-soft" />
          <SidebarRow
            icon={Trash2}
            label="Trash"
            count={trashedCount}
            active={!unfiledOnly && location.at === 'trash'}
            collapsed={collapsed}
            onClick={() => onGoTo({ at: 'trash' })}
          />
        </>
      )}
    </nav>
  )
}
