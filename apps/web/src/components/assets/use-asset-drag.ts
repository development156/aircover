'use client'

import { useState } from 'react'

import {
  ASSET_DRAG_MIME,
  FOLDER_DRAG_MIME,
  decodeAssetDrag,
  folderDragType,
  folderIdFromTypes,
  encodeAssetDrag,
  isAssetDrag,
  isFolderDrag,
} from '@/lib/assets/drag-payload'

/**
 * DRAG A PHOTO ONTO A FOLDER.
 *
 * The one gesture the library was missing. Filing was menu-only: open the
 * menu, choose "File into folder", pick from a list of names. That is three
 * decisions to express something a person can point at.
 *
 * ── WHY THE CURSOR SAYS "COPY" AND NOT "MOVE" ────────────────────────────────
 * Because that is what happens. Membership here is a table, not a `folder_id`
 * column, so a photo genuinely lives in "Diwali campaign" AND "Storefront" at
 * once — dragging it into a third folder removes it from neither. Drive's drag
 * MOVES, and setting `dropEffect = 'move'` would promise Drive's behaviour and
 * deliver ours: the person would drop a photo into a folder, go back to where
 * it was, and find it still there. `'copy'` draws the `+` cursor, which is the
 * true sentence.
 */

/** Props for a file that can be picked up. */
export function useAssetDragSource(ids: () => readonly string[]) {
  return {
    draggable: true,
    onDragStart: (event: React.DragEvent) => {
      const payload = ids()
      if (payload.length === 0) {
        // Nothing to carry. Cancelled rather than started empty, so a drop
        // target never lights up for a drag that could not file anything.
        event.preventDefault()
        return
      }
      event.dataTransfer.setData(ASSET_DRAG_MIME, encodeAssetDrag(payload))
      event.dataTransfer.effectAllowed = 'copy'
    },
  }
}

/**
 * Props for a folder that can receive files, plus whether it is being hovered.
 *
 * ── `dragenter`/`dragleave` COUNTING, AND WHY IT IS NOT A BOOLEAN ────────────
 * `dragleave` fires when the pointer crosses into a CHILD element, not only
 * when it leaves the row. A row whose highlight was a plain boolean would
 * therefore flicker off the moment the cursor passed over the folder's own icon
 * or its count, which is most of the row. Counting enters against leaves is the
 * standard fix and the only one that survives nested children.
 */
export function useFolderDropTarget(onFiles: (ids: string[]) => void) {
  const [depth, setDepth] = useState(0)

  return {
    isOver: depth > 0,
    dropProps: {
      onDragEnter: (event: React.DragEvent) => {
        if (!isAssetDrag(event.dataTransfer.types)) return
        event.preventDefault()
        setDepth((d) => d + 1)
      },
      onDragOver: (event: React.DragEvent) => {
        // Refusing to preventDefault is how a target says "not here", and the
        // browser then draws the no-entry cursor. So a desktop file drop or a
        // text drag is visibly refused rather than silently swallowed.
        if (!isAssetDrag(event.dataTransfer.types)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      },
      onDragLeave: (event: React.DragEvent) => {
        if (!isAssetDrag(event.dataTransfer.types)) return
        setDepth((d) => (d > 0 ? d - 1 : 0))
      },
      onDrop: (event: React.DragEvent) => {
        if (!isAssetDrag(event.dataTransfer.types)) return
        event.preventDefault()
        // Reset FIRST and unconditionally. If `onFiles` throws, or the action
        // it starts never settles, a highlight left switched on is a folder
        // that looks like a live drop target forever.
        setDepth(0)
        const ids = decodeAssetDrag(event.dataTransfer.getData(ASSET_DRAG_MIME))
        if (ids.length > 0) onFiles(ids)
      },
    },
  }
}

/**
 * A FOLDER being dragged onto another folder, to live inside it.
 *
 * ── THE REFUSAL IS DECIDED BEFORE THE DROP, NOT AFTER ────────────────────────
 * `canMoveFolder` already knows every reason a move is impossible: a folder
 * cannot go inside itself, cannot go inside its own descendant, and cannot take
 * its subtree past the depth limit. The caller runs it while the drag is still
 * in the air and passes `accepts`, so an impossible target simply never
 * highlights and the browser draws the no-entry cursor.
 *
 * The alternative — accept every drop and report a refusal afterwards — makes a
 * person complete a gesture, wait, and read a sentence explaining that what they
 * just did was never going to work. A control that cannot do the thing should
 * not look like it can.
 *
 * The server still runs the same check, and so does the database trigger. This
 * is the third statement of one rule, and it is the one that makes the screen
 * honest rather than the one that makes it safe.
 */
export function useFolderMoveTarget(
  accepts: (folderId: string) => boolean,
  onMove: (folderId: string) => void,
) {
  const [over, setOver] = useState(false)

  const readId = (event: React.DragEvent): string => event.dataTransfer.getData(FOLDER_DRAG_MIME)

  return {
    isOver: over,
    dropProps: {
      onDragOver: (event: React.DragEvent) => {
        const dragged = folderIdFromTypes(event.dataTransfer.types)
        // Not a folder drag, or one this target cannot take. Returning without
        // `preventDefault` is how a target says "not here", and the browser
        // draws the no-entry cursor. The id comes from the TYPES because the
        // payload is unreadable until the drop.
        if (dragged === null || !accepts(dragged)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        setOver(true)
      },
      onDragLeave: () => setOver(false),
      onDrop: (event: React.DragEvent) => {
        if (!isFolderDrag(event.dataTransfer.types)) return
        event.preventDefault()
        setOver(false)
        // The payload is authoritative here — it is readable now, and a type
        // name is a place a value can be truncated. `folderIdFromTypes` is for
        // the decision DURING the drag; this is for the act.
        const id = readId(event) || (folderIdFromTypes(event.dataTransfer.types) ?? '')
        // Re-checked at the DROP as well. The tree can change under a drag —
        // another tab, another person — and `accepts` was answered against the
        // tree as it was when the pointer entered.
        if (id !== '' && accepts(id)) onMove(id)
      },
    },
  }
}

/** Props for a folder row that can be picked up and moved. */
export function useFolderDragSource(folderId: string) {
  return {
    draggable: true,
    onDragStart: (event: React.DragEvent) => {
      event.dataTransfer.setData(FOLDER_DRAG_MIME, folderId)
      // The id again, as a TYPE, so a target can decide during the drag. Both
      // are set because each is readable at a different moment.
      event.dataTransfer.setData(folderDragType(folderId), '')
      event.dataTransfer.effectAllowed = 'move'
      // Stopped so a folder inside a folder does not start TWO drags, the
      // child's and its parent row's, with the outer one winning.
      event.stopPropagation()
    },
  }
}
