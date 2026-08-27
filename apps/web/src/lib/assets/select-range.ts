/**
 * SELECTING MORE THAN ONE FILE WITHOUT CLICKING EACH ONE.
 *
 * Selecting forty photos took forty clicks. This is the shift-click every file
 * manager has had for thirty years, plus a select-all.
 *
 * Pure: no DOM, no React. Every decision here is about which ids end up in a
 * set, and each one has a wrong answer that is easy to write inline in a
 * component and hard to see once it is there.
 */

export interface SelectionState {
  selected: ReadonlySet<string>
  /**
   * The last file clicked WITHOUT shift. Shift-click extends from here.
   *
   * Null before anything has been clicked, and after a clear. A shift-click
   * with no anchor is an ordinary click: there is no range to describe, and
   * inventing one from the top of the list would select files the person never
   * went near.
   */
  anchor: string | null
}

export const EMPTY_SELECTION: SelectionState = { selected: new Set(), anchor: null }

/**
 * Toggle one file, or extend a range to it.
 *
 * ── `order` IS WHAT IS ON SCREEN, NOT THE LIBRARY ────────────────────────────
 * The caller passes the VISIBLE ids, already filtered and already sorted. That
 * is the whole correctness of a range: after a search and a sort, "everything
 * between these two" means everything between them AS DRAWN. Ranging over the
 * unsorted library would select files that are not on screen at all, and the
 * count in the bulk bar would then exceed the number of tiles a person can see.
 */
export function selectWithRange(
  state: SelectionState,
  id: string,
  shift: boolean,
  order: readonly string[],
): SelectionState {
  const anchorIndex = state.anchor === null ? -1 : order.indexOf(state.anchor)
  const index = order.indexOf(id)

  // A shift-click whose anchor has scrolled out of the filter is an ordinary
  // click. The alternative is a range measured from a file that is no longer
  // there, which selects an arbitrary run of whatever took its place.
  if (!shift || anchorIndex === -1 || index === -1) {
    const next = new Set(state.selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    // The anchor moves on a plain click even when that click DESELECTED, so the
    // next shift-click extends from where the hand last was rather than from
    // wherever it was two actions ago.
    return { selected: next, anchor: id }
  }

  const from = Math.min(anchorIndex, index)
  const to = Math.max(anchorIndex, index)
  const next = new Set(state.selected)
  for (let i = from; i <= to; i += 1) {
    const entry = order[i]
    if (entry !== undefined) next.add(entry)
  }

  // ── THE ANCHOR DOES NOT MOVE ON A SHIFT-CLICK ──────────────────────────────
  // So a second shift-click further down extends the SAME range rather than
  // starting a new one from where the first ended. That is what makes
  // "click 5, shift-click 20, realise you meant 30, shift-click 30" work.
  return { selected: next, anchor: state.anchor }
}

/**
 * Select everything currently on screen.
 *
 * Scoped to `visible` on purpose. A select-all that reached the whole library
 * would, on a screen showing eight search results, silently select two hundred
 * files and hand them to a bulk action — the one place where the gap between
 * what a person sees and what they act on is most expensive.
 */
export function selectAll(state: SelectionState, visible: readonly string[]): SelectionState {
  const next = new Set(state.selected)
  for (const id of visible) next.add(id)
  return { selected: next, anchor: state.anchor }
}

/** Is everything on screen already selected? Drives the Select all / None label. */
export function allVisibleSelected(state: SelectionState, visible: readonly string[]): boolean {
  // An empty screen is NOT "all selected". Returning true there would label the
  // button "Select none" over a list with nothing in it.
  if (visible.length === 0) return false
  return visible.every((id) => state.selected.has(id))
}

/** Drop everything on screen from the selection, keeping anything off-screen. */
export function deselectVisible(state: SelectionState, visible: readonly string[]): SelectionState {
  const next = new Set(state.selected)
  for (const id of visible) next.delete(id)
  // The anchor goes only if it was one of the ids just dropped: keeping an
  // anchor on a file that is no longer selected is fine and even useful, but
  // keeping one the person just cleared is not.
  const anchor = state.anchor !== null && visible.includes(state.anchor) ? null : state.anchor
  return { selected: next, anchor }
}
