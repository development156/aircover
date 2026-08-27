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
 * Tab again leaves it. Inside, the arrows move.
 *
 * ── THE COLUMN COUNT IS MEASURED EVERY PRESS ─────────────────────────────────
 * Not cached, and not read off a breakpoint. The window can be resized between
 * two presses and the grid reflows without telling anyone; a cached count would
 * then move Down by the wrong number of tiles, silently and only sometimes.
 * `getBoundingClientRect` is the same question the browser has already answered,
 * and it is cheap once per keypress.
 */
export function useGridNav(count: number) {
  // Which tile is TABBABLE. Not "which is focused" — focus can leave the grid
  // entirely and this has to remember where to come back to.
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLElement | null>(null)

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent, index: number) => {
      if (!isGridKey(event.key)) return
      // Modified presses belong to the browser and to this screen's own
      // shortcuts. Shift+Arrow in particular must stay free: it is the natural
      // spelling of "extend the selection", and claiming it here would take it
      // away before it can be built.
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return

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
    },
    [count],
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
