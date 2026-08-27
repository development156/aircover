'use client'

import { useCallback, useRef, useState } from 'react'

import { columnsFromRects, isGridKey, nextIndex } from '@/lib/assets/grid-nav'

/**
 * ARROW KEYS ACROSS THE GRID, PLUS A ROVING TABINDEX.
 *
 * ── WHY THE TABINDEX HALF MATTERS AS MUCH AS THE ARROWS ──────────────────────
 * Every tile is a `<button>`, so before this a keyboard user met TWO HUNDRED tab
 * stops between the search box and anything below the grid. That is the whole
 * library standing between you and the rest of the page.
 *
 * A roving tabindex is the standard answer and the one ARIA specifies for a
 * grid: exactly one tile is tabbable at a time, so Tab enters the grid once and
 * Tab again leaves it. Inside, the arrows move, and Shift+Arrow extends the
 * selection while Select is on.
 *
 * ── THE COLUMN COUNT IS MEASURED EVERY PRESS ─────────────────────────────────
 * Not cached, and not read off a breakpoint. The window can be resized between
 * two presses and the grid reflows without telling anyone; a cached count would
 * then move Down by the wrong number of tiles, silently and only sometimes.
 * `getBoundingClientRect` is the same question the browser has already answered,
 * and it is cheap once per keypress.
 */
export function useGridNav(
  count: number,
  /**
   * Called when Shift+Arrow moves the focus, with the index it landed on.
   *
   * Absent means Shift+Arrow is not claimed at all and falls through to the
   * browser — which is what should happen outside Select mode, where there is no
   * selection to extend. A key that silently does nothing is worse than a key
   * that does what it always did.
   */
  onExtendTo?: (index: number) => void,
) {
  // Which tile is TABBABLE. Not "which is focused" — focus can leave the grid
  // entirely and this has to remember where to come back to.
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLElement | null>(null)

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent, index: number) => {
      if (!isGridKey(event.key)) return
      // Alt/Ctrl/Meta presses belong to the browser and to this screen's own
      // shortcuts, always. SHIFT is claimed only when the caller passed
      // `onExtendTo` — outside Select mode there is no selection to extend, and
      // a key that silently does nothing is worse than one that keeps its
      // default behaviour.
      if (event.altKey || event.ctrlKey || event.metaKey) return
      const extending = event.shiftKey
      if (extending && onExtendTo === undefined) return

      const container = containerRef.current
      const tiles =
        container === null ? [] : [...container.querySelectorAll<HTMLElement>('[data-grid-tile]')]
      const columns = columnsFromRects(tiles.map((tile) => tile.getBoundingClientRect().top))

      const next = nextIndex(index, event.key, count, columns)
      // Null means nothing moved. The event is left alone rather than
      // preventDefault-ed, so a Down press at the bottom of the grid still
      // scrolls the page, which is what it would do on any other screen.
      if (next === null) return

      event.preventDefault()
      setActiveIndex(next)
      tiles[next]?.focus()
      // The selection is extended TO the tile the focus landed on, and the
      // caller resolves that against its own anchor. This hook deliberately
      // knows nothing about anchors: `selectWithRange` already owns every rule
      // about how one moves, and a second copy here would be the two drifting.
      if (extending) onExtendTo?.(next)
    },
    [count, onExtendTo],
  )

  return {
    containerRef,
    /**
     * Props for one tile. `data-grid-tile` is the hook's own marker rather than
     * a class or a tag selector, so restyling a tile or wrapping it in another
     * element cannot quietly break the navigation.
     */
    tileProps: (index: number) => ({
      'data-grid-tile': true,
      // Clamped, because the list can shrink under the focus when a filter
      // changes. An activeIndex past the end would leave NO tile tabbable and
      // the grid unreachable by keyboard until something else re-rendered it.
      tabIndex: index === Math.min(activeIndex, Math.max(count - 1, 0)) ? 0 : -1,
      onKeyDown: (event: React.KeyboardEvent) => onKeyDown(event, index),
      onFocus: () => setActiveIndex(index),
    }),
  }
}
