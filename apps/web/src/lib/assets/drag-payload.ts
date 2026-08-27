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
  if (types === undefined) return false
  for (const type of Array.from(types as readonly string[])) {
    if (type === ASSET_DRAG_MIME) return true
  }
  return false
}
