/**
 * WHAT A DRAG CARRIES, AND WHAT IT ACTUALLY MOVES.
 *
 * Pure: no DOM, no `DataTransfer`. The two decisions worth getting right here
 * are both decisions about data, and both are ones a component would make
 * inline and get subtly wrong.
 */

/**
 * A private MIME type, and NOT `text/plain`.
 *
 * `text/plain` would make every drag out of this library droppable into any
 * text field on the page as a line of raw JSON, and would make text dragged
 * from anywhere else look to a folder like a file drop. A custom type is
 * invisible to both.
 *
 * Files dragged from the DESKTOP arrive as `Files` instead, which is a
 * different type this never claims — so an upload dropped on a folder is not
 * silently read as a filing of nothing.
 */
export const ASSET_DRAG_MIME = 'application/x-sahoda-assets'

/**
 * A FOLDER being dragged, under its own type.
 *
 * Separate from `ASSET_DRAG_MIME` so a target can tell the two apart during the
 * drag, when the payload is unreadable. They mean opposite things — dropping
 * files ADDS memberships and keeps every other one, dropping a folder MOVES it
 * and it leaves where it was — so a target that could not distinguish them
 * would have to guess, and would guess wrong half the time.
 */
export const FOLDER_DRAG_MIME = 'application/x-sahoda-folder'

/**
 * The dragged folder's id, ENCODED INTO A SECOND MIME TYPE.
 *
 * ── WHY THE ID CANNOT LIVE ONLY IN THE PAYLOAD ───────────────────────────────
 * `getData` returns '' during `dragover` in every browser; the payload is
 * readable only on `drop`. So a target deciding whether it can accept THIS
 * folder — not folders in general — has nothing to read.
 *
 * `types` IS readable throughout. Putting the id in a type name is the standard
 * way out, and it is what lets a folder refuse a drop BEFORE it happens rather
 * than accepting it and explaining afterwards. Without this the row highlights
 * for a move it will then reject, which is a control that looks like it can do
 * the thing and cannot.
 *
 * Lowercased on the way out and compared lowercased, because the drag-and-drop
 * spec lowercases type strings. Folder ids are UUIDs, so nothing is lost.
 */
export function folderDragType(folderId: string): string {
  return `${FOLDER_DRAG_MIME}+${folderId}`.toLowerCase()
}

/** The dragged folder's id, read from the types list. Null when this is not a folder drag. */
export function folderIdFromTypes(
  types: readonly string[] | DOMStringList | undefined,
): string | null {
  if (types === undefined) return null
  const prefix = `${FOLDER_DRAG_MIME}+`
  for (const type of Array.from(types as readonly string[])) {
    if (type.startsWith(prefix)) {
      const id = type.slice(prefix.length)
      if (id !== '') return id
    }
  }
  return null
}

/**
 * WHICH FILES A DRAG MOVES, given the one that was picked up.
 *
 * ── THE RULE EVERY FILE MANAGER SHARES, AND WHY ──────────────────────────────
 * Dragging a file that IS part of the selection moves the whole selection.
 * Dragging one that is NOT moves only that file, and it does so WITHOUT
 * disturbing the selection — the person reached past their selection for a
 * different file, which is an unambiguous statement about which they meant.
 *
 * Getting this backwards is expensive in both directions. Always moving the
 * whole selection files a photo somebody never touched; always moving just the
 * dragged one throws away the work of selecting forty.
 */
export function idsForDrag(draggedId: string, selected: ReadonlySet<string>): string[] {
  return selected.has(draggedId) ? [...selected] : [draggedId]
}

/** The payload, as it goes onto the `DataTransfer`. */
export function encodeAssetDrag(ids: readonly string[]): string {
  return JSON.stringify(ids)
}

/**
 * Read a drag payload back, defensively.
 *
 * ── EVERYTHING HERE IS UNTRUSTED ─────────────────────────────────────────────
 * A `DataTransfer` can be populated by any page, any extension, or a drag that
 * began before a deploy and finished after it. So this returns `[]` for every
 * shape it does not recognise rather than throwing: a malformed payload must
 * cost the drop, never the screen. `[]` reaching `fileAssets` is a no-op, which
 * is the correct outcome for a drop that carried nothing legible.
 */
export function decodeAssetDrag(raw: string | null | undefined): string[] {
  if (typeof raw !== 'string' || raw === '') return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Filtered rather than rejected wholesale: a payload with one bad entry is
    // still a real drag of the others, and dropping all of them would lose work
    // over a value nothing was going to use anyway.
    return parsed.filter((id): id is string => typeof id === 'string' && id !== '')
  } catch {
    return []
  }
}

/**
 * Is this drag one of ours?
 *
 * Checked against the TYPES list rather than by reading the data, because
 * `getData` returns an empty string during `dragover` in every browser — the
 * payload is only readable on `drop`. A target that waited for the data to
 * decide whether to highlight would never highlight.
 */
export function isAssetDrag(types: readonly string[] | DOMStringList | undefined): boolean {
  return hasType(types, ASSET_DRAG_MIME)
}

/** Is this drag a folder being re-parented? Same reasoning as `isAssetDrag`. */
export function isFolderDrag(types: readonly string[] | DOMStringList | undefined): boolean {
  return hasType(types, FOLDER_DRAG_MIME)
}

function hasType(types: readonly string[] | DOMStringList | undefined, wanted: string): boolean {
  if (types === undefined) return false
  for (const type of Array.from(types as readonly string[])) {
    if (type === wanted) return true
  }
  return false
}
