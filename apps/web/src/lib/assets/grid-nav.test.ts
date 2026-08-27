import { describe, expect, it } from 'vitest'

import { columnsFromRects, isGridKey, nextIndex } from './grid-nav'

describe('nextIndex: left and right', () => {
  it('moves one tile', () => {
    expect(nextIndex(0, 'ArrowRight', 10, 4)).toBe(1)
    expect(nextIndex(5, 'ArrowLeft', 10, 4)).toBe(4)
  })

  // ── CLAMPS, NEVER WRAPS ───────────────────────────────────────────────────
  it('stays put at the ends instead of wrapping around', () => {
    // Wrapping moves the eye across the whole screen for what felt like one
    // step. Null means "nothing moved", so the caller leaves the event alone.
    expect(nextIndex(9, 'ArrowRight', 10, 4)).toBeNull()
    expect(nextIndex(0, 'ArrowLeft', 10, 4)).toBeNull()
  })
})

describe('nextIndex: up and down move by a ROW', () => {
  it('down adds the column count, up subtracts it', () => {
    expect(nextIndex(0, 'ArrowDown', 10, 4)).toBe(4)
    expect(nextIndex(6, 'ArrowUp', 10, 4)).toBe(2)
  })

  it('the same index moves differently at a different column count', () => {
    // The whole reason the count is measured rather than assumed.
    expect(nextIndex(0, 'ArrowDown', 10, 2)).toBe(2)
    expect(nextIndex(0, 'ArrowDown', 10, 3)).toBe(3)
    expect(nextIndex(0, 'ArrowDown', 10, 4)).toBe(4)
  })

  it('DOWN from a partial bottom row stays put rather than jumping sideways', () => {
    // 10 tiles in 4 columns leaves a bottom row of two. Down from index 8 has
    // nothing below it. Clamping to the LAST tile would move the focus sideways
    // in response to a Down press, which is movement nobody asked for.
    expect(nextIndex(8, 'ArrowDown', 10, 4)).toBeNull()
    expect(nextIndex(9, 'ArrowDown', 10, 4)).toBeNull()
  })

  it('up from the top row stays put', () => {
    expect(nextIndex(2, 'ArrowUp', 10, 4)).toBeNull()
  })
})

describe('nextIndex: Home and End', () => {
  it('jump to the ends, and do nothing when already there', () => {
    expect(nextIndex(7, 'Home', 10, 4)).toBe(0)
    expect(nextIndex(0, 'End', 10, 4)).toBe(9)
    expect(nextIndex(0, 'Home', 10, 4)).toBeNull()
    expect(nextIndex(9, 'End', 10, 4)).toBeNull()
  })
})

describe('nextIndex is total: no input makes it throw or leave the list', () => {
  it('an empty grid moves nowhere', () => {
    for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'] as const) {
      expect(nextIndex(0, key, 0, 4)).toBeNull()
    }
  })

  it('a current index outside the list is treated as the nearest real one', () => {
    // Happens for one render after a filter shrinks the list under the focus.
    expect(nextIndex(99, 'ArrowLeft', 10, 4)).toBe(8)
    expect(nextIndex(-5, 'ArrowRight', 10, 4)).toBe(1)
  })

  it('a column count of zero behaves as one, so Down still means Down', () => {
    // `columns` is measured, and a measurement can come back 0 for one frame
    // before layout settles. Dividing a grid into zero columns has no meaning;
    // one is what a list view genuinely is.
    expect(nextIndex(0, 'ArrowDown', 10, 0)).toBe(1)
  })

  it('every returned index is inside the list', () => {
    for (let i = 0; i < 10; i += 1) {
      for (const key of [
        'ArrowRight',
        'ArrowLeft',
        'ArrowDown',
        'ArrowUp',
        'Home',
        'End',
      ] as const) {
        const next = nextIndex(i, key, 10, 4)
        if (next === null) continue
        expect(next).toBeGreaterThanOrEqual(0)
        expect(next).toBeLessThan(10)
      }
    }
  })
})

describe('columnsFromRects measures the layout instead of restating the CSS', () => {
  it('counts the tiles sharing the first row', () => {
    expect(columnsFromRects([0, 0, 0, 0, 200, 200, 200, 200])).toBe(4)
    expect(columnsFromRects([0, 0, 180, 180, 360])).toBe(2)
  })

  it('tolerates sub-pixel layout, which is normal rather than exotic', () => {
    expect(columnsFromRects([12.4, 12.6, 12.5, 190.2])).toBe(3)
  })

  it('a single tile, an empty grid and a list are all one column', () => {
    expect(columnsFromRects([])).toBe(1)
    expect(columnsFromRects([0])).toBe(1)
    expect(columnsFromRects([0, 40, 80, 120])).toBe(1)
  })
})

describe('isGridKey lets everything else through', () => {
  it('claims only the six keys it handles', () => {
    // Typing into the search box must not be swallowed, and neither must Tab,
    // Enter, Escape or the shortcuts this screen already has.
    expect(isGridKey('ArrowDown')).toBe(true)
    expect(isGridKey('Home')).toBe(true)
    for (const key of ['Tab', 'Enter', 'Escape', ' ', 'a', 'F2', 'Delete', 'PageDown']) {
      expect(isGridKey(key), key).toBe(false)
    }
  })
})
