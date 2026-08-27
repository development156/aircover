import { describe, expect, it } from 'vitest'

import {
  EMPTY_SELECTION,
  allVisibleSelected,
  deselectVisible,
  selectAll,
  selectWithRange,
  type SelectionState,
} from './select-range'

const ORDER = ['a', 'b', 'c', 'd', 'e']
const state = (ids: string[], anchor: string | null = null): SelectionState => ({
  selected: new Set(ids),
  anchor,
})
const ids = (s: SelectionState): string[] => [...s.selected].sort()

describe('a plain click toggles one file and sets the anchor', () => {
  it('adds, then removes', () => {
    const first = selectWithRange(EMPTY_SELECTION, 'b', false, ORDER)
    expect(ids(first)).toEqual(['b'])
    expect(first.anchor).toBe('b')

    const second = selectWithRange(first, 'b', false, ORDER)
    expect(ids(second)).toEqual([])
  })

  it('moves the anchor even when the click DESELECTED', () => {
    // So the next shift-click extends from where the hand last was, not from
    // wherever it happened to be two actions ago.
    const after = selectWithRange(state(['b'], 'a'), 'b', false, ORDER)
    expect(ids(after)).toEqual([])
    expect(after.anchor).toBe('b')
  })
})

describe('shift-click extends a range', () => {
  it('selects everything between the anchor and the click, inclusive', () => {
    const after = selectWithRange(state(['b'], 'b'), 'd', true, ORDER)
    expect(ids(after)).toEqual(['b', 'c', 'd'])
  })

  it('works backwards, from a later anchor to an earlier click', () => {
    const after = selectWithRange(state(['d'], 'd'), 'b', true, ORDER)
    expect(ids(after)).toEqual(['b', 'c', 'd'])
  })

  it('keeps files selected outside the range', () => {
    // Shift-click ADDS a range; it does not replace the selection. Someone who
    // picked one photo at the top and then ranged over five at the bottom meant
    // to have six.
    const after = selectWithRange(state(['a', 'c'], 'c'), 'e', true, ORDER)
    expect(ids(after)).toEqual(['a', 'c', 'd', 'e'])
  })

  // ── THE ANCHOR DOES NOT MOVE, AND THAT IS THE WHOLE GESTURE ───────────────
  it('a second shift-click extends the SAME range rather than starting a new one', () => {
    // Click b, shift-click d, realise you meant e, shift-click e. The result
    // must be b-e, not d-e plus whatever the first pass left behind.
    const first = selectWithRange(state(['b'], 'b'), 'd', true, ORDER)
    expect(first.anchor).toBe('b')
    const second = selectWithRange(first, 'e', true, ORDER)
    expect(ids(second)).toEqual(['b', 'c', 'd', 'e'])
  })

  it('a shift-click with no anchor is an ordinary click', () => {
    // Nothing describes a range yet, and measuring one from the top of the list
    // would select files the person never went near.
    const after = selectWithRange(EMPTY_SELECTION, 'd', true, ORDER)
    expect(ids(after)).toEqual(['d'])
  })

  it('a shift-click whose anchor has been filtered away is an ordinary click', () => {
    // The anchor was on a file the current search no longer shows. A range
    // measured from it would be an arbitrary run of whatever took its place.
    const after = selectWithRange(state(['z'], 'z'), 'c', true, ['a', 'b', 'c'])
    expect(ids(after)).toEqual(['c', 'z'])
  })
})

// ── THE RANGE FOLLOWS WHAT IS ON SCREEN ─────────────────────────────────────
describe('the range is over the VISIBLE order, sorted and filtered', () => {
  it('a re-sorted list ranges over the new order, not the old one', () => {
    // The library holds a,b,c,d,e. Sorted largest-first the screen shows
    // e,d,c,b,a. Shift-clicking from e to c must take e,d,c — the three tiles
    // between them AS DRAWN — and never a,b,c.
    const sorted = ['e', 'd', 'c', 'b', 'a']
    const after = selectWithRange(state(['e'], 'e'), 'c', true, sorted)
    expect(ids(after)).toEqual(['c', 'd', 'e'])
  })

  it('a filtered list never selects a file that is not on screen', () => {
    const filtered = ['a', 'e']
    const after = selectWithRange(state(['a'], 'a'), 'e', true, filtered)
    expect(ids(after)).toEqual(['a', 'e'])
  })
})

describe('select all is scoped to what is on screen', () => {
  it('selects the visible ids and nothing else', () => {
    // A select-all that reached the whole library would, on a screen showing
    // eight search results, hand two hundred files to a bulk action.
    const after = selectAll(EMPTY_SELECTION, ['a', 'b'])
    expect(ids(after)).toEqual(['a', 'b'])
  })

  it('keeps a selection made outside the current filter', () => {
    const after = selectAll(state(['z']), ['a'])
    expect(ids(after)).toEqual(['a', 'z'])
  })

  it('allVisibleSelected is false for an empty screen', () => {
    // Otherwise the button reads "Select none" over a list with nothing in it.
    expect(allVisibleSelected(EMPTY_SELECTION, [])).toBe(false)
    expect(allVisibleSelected(state(['a', 'b']), ['a', 'b'])).toBe(true)
    expect(allVisibleSelected(state(['a']), ['a', 'b'])).toBe(false)
  })

  it('deselectVisible drops only what is on screen', () => {
    const after = deselectVisible(state(['a', 'b', 'z'], 'a'), ['a', 'b'])
    expect(ids(after)).toEqual(['z'])
    expect(after.anchor).toBeNull()
  })

  it('deselectVisible keeps an anchor that was not one of the cleared ids', () => {
    const after = deselectVisible(state(['a', 'z'], 'z'), ['a'])
    expect(after.anchor).toBe('z')
  })
})
