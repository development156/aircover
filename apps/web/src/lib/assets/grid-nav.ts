/**
 * MOVING AROUND THE GRID WITH THE KEYBOARD.
 *
 * Until now the arrow keys did nothing on this screen. A keyboard user reached
 * the fortieth photo by pressing Tab forty times, and there was no way at all to
 * move DOWN a row — the one direction a grid is for.
 *
 * Pure: no DOM. The caller measures the column count (see `columnsFromRects`,
 * which reads it off the laid-out tiles rather than guessing from a breakpoint)
 * and this decides where the focus goes.
 */

/** Keys this understands. Anything else returns null and the caller lets it through. */
export type GridKey = 'ArrowRight' | 'ArrowLeft' | 'ArrowDown' | 'ArrowUp' | 'Home' | 'End'

const KEYS: ReadonlySet<string> = new Set([
  'ArrowRight',
  'ArrowLeft',
  'ArrowDown',
  'ArrowUp',
  'Home',
  'End',
])

export function isGridKey(key: string): key is GridKey {
  return KEYS.has(key)
}

/**
 * Where the focus goes.
 *
 * ── EVERY MOVE CLAMPS, AND NONE WRAPS ────────────────────────────────────────
 * Right at the last tile stays on the last tile. It does NOT jump to the first,
 * because a grid is a picture of a list and wrapping from the end to the
 * beginning moves the eye across the whole screen for what felt like one step.
 *
 * Down from the bottom row stays put rather than clamping to the LAST tile. A
 * partial bottom row is normal — 10 photos in 4 columns leaves two — and jumping
 * sideways to the last tile in response to Down would be movement the person did
 * not ask for. Down means down or nothing.
 *
 * Returns null when nothing should move, so the caller can leave the event alone
 * rather than calling `preventDefault` on a key it did not use.
 */
export function nextIndex(
  current: number,
  key: GridKey,
  count: number,
  columns: number,
): number | null {
  if (count <= 0) return null
  // A column count of zero or less would make Down a no-op division; one is the
  // honest floor and is what a list view genuinely is.
  const cols = columns > 0 ? columns : 1
  const last = count - 1
  const at = current < 0 ? 0 : current > last ? last : current

  switch (key) {
    case 'Home':
      return at === 0 ? null : 0
    case 'End':
      return at === last ? null : last
    case 'ArrowRight':
      return at < last ? at + 1 : null
    case 'ArrowLeft':
      return at > 0 ? at - 1 : null
    case 'ArrowDown': {
      const below = at + cols
      return below <= last ? below : null
    }
    case 'ArrowUp': {
      const above = at - cols
      return above >= 0 ? above : null
    }
  }
}

/**
 * How many columns the grid is ACTUALLY laid out in, measured from the tiles.
 *
 * ── WHY THIS IS MEASURED AND NOT READ OFF THE BREAKPOINT ─────────────────────
 * The grid is `grid-cols-2 narrow:grid-cols-3 wide:grid-cols-4`. Restating that
 * in TypeScript means two places that must agree about three numbers and two
 * breakpoints, and they would drift the first time a column is added — silently,
 * because the arrow keys would still WORK, just move by the wrong amount.
 *
 * Counting the tiles that share the first tile's top edge cannot drift: it is
 * the same question the browser already answered.
 *
 * ── A TOLERANCE, NOT `Math.round` ───────────────────────────────────────────
 * Rounding looks like it handles sub-pixel layout and does not: 12.4 rounds to
 * 12 and 12.6 rounds to 13, so two tiles two tenths of a pixel apart land in
 * different rows and the column count collapses to 1. The arrow keys would still
 * WORK — Down would just move by one tile instead of a row, silently. Caught by
 * a test written before this was read back.
 *
 * `ROW_TOLERANCE` is far below a tile's height and far above any rounding error,
 * so it cannot merge two real rows or split one.
 *
 * Returns 1 for an empty or single-tile grid, which is also the right answer for
 * the list view.
 */
const ROW_TOLERANCE = 4

export function columnsFromRects(tops: readonly number[]): number {
  if (tops.length === 0) return 1
  const first = tops[0] as number
  let columns = 0
  for (const top of tops) {
    if (Math.abs(top - first) > ROW_TOLERANCE) break
    columns += 1
  }
  return columns > 0 ? columns : 1
}
