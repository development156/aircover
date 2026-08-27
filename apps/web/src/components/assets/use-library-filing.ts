'use client'

import { useBulkFiling } from '@/components/assets/use-bulk-filing'
import { locationName, type LibraryLocation } from '@/lib/assets/organize-view'
import { displayName, type AssetCard } from '@/lib/assets/view'
import type { AssetFolder, AssetSmartFolder } from '@sahoda/shared'

/**
 * Filing, unfiling and delete-cleanup, for both the bulk bar AND a single
 * file's own context menu — split out of `asset-library.tsx` only to keep
 * that file under 300 lines. `useBulkFiling`'s outcome messaging (the
 * "Filed 1 to X" banner, and its Undo) already works for one id exactly as
 * well as for a selection, so a context menu's "File into folder" reuses
 * the SAME call rather than a second, silent path with no outcome at all.
 */
export function useLibraryFiling({
  cards,
  folders,
  smart,
  location,
  selected,
  clearSelection,
  openId,
  setOpenId,
  setSelected,
}: {
  cards: readonly AssetCard[]
  folders: readonly AssetFolder[]
  smart: readonly AssetSmartFolder[]
  location: LibraryLocation
  selected: ReadonlySet<string>
  clearSelection: () => void
  openId: string | null
  setOpenId: (id: string | null) => void
  setSelected: (updater: (current: Set<string>) => Set<string>) => void
}) {
  const {
    pending: bulkPending,
    fileInto: fileIntoRaw,
    removeFromFolder,
    trashOne,
    trashMany,
    moveFolderInto,
    outcome: bulkOutcome,
    dismiss: dismissBulkOutcome,
  } = useBulkFiling(cards, clearSelection)

  function folderName(folderId: string): string {
    return folders.find((f) => f.id === folderId)?.name ?? 'the folder'
  }

  function fileInto(folderId: string) {
    fileIntoRaw(folderId, folderName(folderId), [...selected])
  }

  function fileSingleInto(id: string, folderId: string) {
    fileIntoRaw(folderId, folderName(folderId), [id])
  }

  function removeFromCurrentFolder() {
    if (location.at === 'folder') {
      removeFromFolder(location.id, locationName(location, folders, smart), [...selected])
    }
  }

  function removeSingleFromCurrentFolder(id: string) {
    if (location.at === 'folder') {
      removeFromFolder(location.id, locationName(location, folders, smart), [id])
    }
  }

  /**
   * "Move to trash" from one file's own menu.
   *
   * The NAME is looked up here rather than passed from the menu, so the banner
   * says the same words the tile does — `displayName`'s answer for a file with
   * no title is "Untitled photo", and a menu that sent a raw title would print
   * an empty string into the sentence.
   */
  /**
   * Files dropped onto a folder in the sidebar.
   *
   * Goes through the SAME `fileIntoRaw` the menu and the bulk bar use, so a
   * drop reports the same counted outcome and the same Undo. A drag with its
   * own quieter path would be the one way of filing that says nothing when it
   * half-worked — and filing is where "9 selected, 7 added, 2 already there"
   * actually happens.
   */
  function dropIntoFolder(folderId: string, ids: string[]) {
    if (ids.length === 0) return
    fileIntoRaw(folderId, folderName(folderId), ids)
  }

  /** A folder dropped inside another folder. Names both for the outcome line. */
  function dropFolderInto(draggedId: string, newParentId: string) {
    moveFolderInto(draggedId, folderName(draggedId), newParentId, folderName(newParentId))
  }

  /** The bulk bar's delete: the whole selection, then the selection is cleared. */
  function trashSelection() {
    trashMany([...selected])
  }

  function trashSingle(id: string) {
    const card = cards.find((entry) => entry.id === id)
    trashOne(id, card === undefined ? 'that file' : displayName(card))
    onFileDeleted(id)
  }

  function onFileDeleted(id: string) {
    if (openId === id) setOpenId(null)
    setSelected((current) => {
      if (!current.has(id)) return current
      const next = new Set(current)
      next.delete(id)
      return next
    })
  }

  return {
    bulkPending,
    bulkOutcome,
    dismissBulkOutcome,
    fileInto,
    fileSingleInto,
    removeFromCurrentFolder,
    removeSingleFromCurrentFolder,
    dropIntoFolder,
    dropFolderInto,
    trashSingle,
    trashSelection,
    onFileDeleted,
  }
}
