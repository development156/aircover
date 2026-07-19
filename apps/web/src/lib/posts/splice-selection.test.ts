import { CONSTRAINTS, charCountFor } from '@sahoda/shared'
import { describe, expect, test } from 'vitest'

import { normalizeSelection, selectedText, spliceSelection } from './splice-selection'

// 'hi 👋 there' — the waving hand is a surrogate pair occupying UTF-16 units 3
// and 4, so unit index 4 is a boundary *inside* one code point.
const EMOJI_TEXT = 'hi 👋 there'

/** True when the string contains a lone (unpaired) surrogate — i.e. mojibake. */
function hasLoneSurrogate(value: string): boolean {
  return Array.from(value).some((codePoint) => {
    const code = codePoint.codePointAt(0)
    return code !== undefined && code >= 0xd800 && code <= 0xdfff
  })
}

describe('spliceSelection', () => {
  test('replaces a middle selection with the rewritten fragment', () => {
    expect(spliceSelection('open at 9am daily', { start: 8, end: 11 }, '7am')).toBe(
      'open at 7am daily',
    )
  })

  test('treats an empty selection as an insertion at that point', () => {
    expect(spliceSelection('open daily', { start: 5, end: 5 }, 'every ')).toBe('open every daily')
  })

  test('replaces the entire body when the whole text is selected', () => {
    expect(spliceSelection('old body', { start: 0, end: 8 }, 'new body')).toBe('new body')
  })

  test('normalizes a reversed selection instead of producing garbage', () => {
    expect(spliceSelection('open at 9am daily', { start: 11, end: 8 }, '7am')).toBe(
      'open at 7am daily',
    )
  })

  test('clamps indices past the end of the string to the string bounds', () => {
    expect(spliceSelection('short', { start: 2, end: 999 }, 'X')).toBe('shX')
  })

  test('clamps negative indices to the start of the string', () => {
    expect(spliceSelection('short', { start: -50, end: 2 }, 'X')).toBe('Xort')
  })

  test('deletes the selection when the replacement is empty', () => {
    expect(spliceSelection('open at 9am daily', { start: 7, end: 11 }, '')).toBe('open at daily')
  })

  test('inserts into empty source text without throwing', () => {
    expect(spliceSelection('', { start: 0, end: 0 }, 'first draft')).toBe('first draft')
    expect(spliceSelection('', { start: 4, end: 9 }, 'first draft')).toBe('first draft')
  })

  test('expands a selection that starts inside an emoji so the emoji is replaced whole', () => {
    // start 4 lands between the surrogate halves of 👋 — it snaps back to 3, so
    // the whole emoji is consumed and the space after it survives.
    const result = spliceSelection(EMOJI_TEXT, { start: 4, end: 5 }, 'X')
    expect(result).toBe('hi X there')
    expect(hasLoneSurrogate(result)).toBe(false)
  })

  test('expands a selection that ends inside an emoji so the emoji is replaced whole', () => {
    // end 4 lands between the surrogate halves of 👋 — it snaps forward to 5.
    const result = spliceSelection(EMOJI_TEXT, { start: 0, end: 4 }, 'Yo')
    expect(result).toBe('Yo there')
    expect(hasLoneSurrogate(result)).toBe(false)
  })

  test('never emits a lone surrogate for any boundary pair across an emoji body', () => {
    for (let start = -2; start <= EMOJI_TEXT.length + 2; start += 1) {
      for (let end = -2; end <= EMOJI_TEXT.length + 2; end += 1) {
        const result = spliceSelection(EMOJI_TEXT, { start, end }, '·')
        expect(hasLoneSurrogate(result)).toBe(false)
      }
    }
  })

  test('emits only characters that came from the source or the replacement', () => {
    // The module is pure plumbing: it must never inject copy of its own
    // (no ellipses, no markers, no whitespace padding) into the body.
    const result = spliceSelection('open at 9am daily', { start: 8, end: 11 }, '7am')
    for (const character of result) {
      expect('open at 9am daily7am').toContain(character)
    }
  })

  test('keeps the code-point count the engine would measure', () => {
    // Asserted against the real Constraint Engine, not a restatement of it: if
    // charCountFor ever changed its counting basis, this must fail rather than
    // let the boundary policy above silently drift away from the meter.
    const result = spliceSelection(EMOJI_TEXT, { start: 0, end: 3 }, '')
    expect(result).toBe('👋 there')
    expect(charCountFor(CONSTRAINTS.x, { body: result })).toBe(7) // 👋 + ' there'
  })

  test('a boundary inside an emoji does not inflate the count the engine measures', () => {
    // This is the whole reason the outward expansion exists. Without it, end 4
    // would slice between the surrogate halves and leave the low half behind —
    // charCountFor counts that orphan as a full code point, so the meter would
    // read 7 for a body that renders as 6 characters.
    const result = spliceSelection(EMOJI_TEXT, { start: 0, end: 4 }, '')
    expect(result).toBe(' there')
    expect(charCountFor(CONSTRAINTS.x, { body: result })).toBe(6)
    expect(charCountFor(CONSTRAINTS.x, { body: EMOJI_TEXT.slice(4) })).toBe(7) // the bug, pinned
  })
})

describe('selectedText', () => {
  test('returns the fragment the rewrite task should receive', () => {
    expect(selectedText('open at 9am daily', { start: 8, end: 11 })).toBe('9am')
  })

  test('returns an empty string for an empty selection', () => {
    expect(selectedText('open daily', { start: 5, end: 5 })).toBe('')
  })

  test('returns the whole body when the selection spans everything', () => {
    expect(selectedText('open daily', { start: 0, end: 10 })).toBe('open daily')
  })

  test('reads the same range a reversed selection describes', () => {
    expect(selectedText('open at 9am daily', { start: 11, end: 8 })).toBe('9am')
  })

  test('clamps out-of-range and negative indices to the string bounds', () => {
    expect(selectedText('short', { start: -10, end: 999 })).toBe('short')
  })

  test('returns an empty string for empty source text', () => {
    expect(selectedText('', { start: 0, end: 5 })).toBe('')
  })

  test('widens to whole code points rather than returning half an emoji', () => {
    const fragment = selectedText(EMOJI_TEXT, { start: 4, end: 5 })
    expect(fragment).toBe('👋')
    expect(hasLoneSurrogate(fragment)).toBe(false)
  })

  test('round-trips: replacing a selection with its own text is a no-op', () => {
    const sel = { start: 4, end: 5 }
    expect(spliceSelection(EMOJI_TEXT, sel, selectedText(EMOJI_TEXT, sel))).toBe(EMOJI_TEXT)
  })
})

describe('normalizeSelection', () => {
  test('leaves an already-valid selection untouched', () => {
    expect(normalizeSelection('open daily', { start: 2, end: 6 })).toEqual({ start: 2, end: 6 })
  })

  test('orders a reversed selection so start is never after end', () => {
    expect(normalizeSelection('open daily', { start: 6, end: 2 })).toEqual({ start: 2, end: 6 })
  })

  test('clamps both bounds into the string', () => {
    expect(normalizeSelection('short', { start: -4, end: 900 })).toEqual({ start: 0, end: 5 })
  })

  test('collapses any selection on empty text to a caret at zero', () => {
    expect(normalizeSelection('', { start: 3, end: 8 })).toEqual({ start: 0, end: 0 })
  })

  test('expands a non-empty selection outward to whole code points', () => {
    expect(normalizeSelection(EMOJI_TEXT, { start: 4, end: 6 })).toEqual({ start: 3, end: 6 })
    expect(normalizeSelection(EMOJI_TEXT, { start: 1, end: 4 })).toEqual({ start: 1, end: 5 })
  })

  test('keeps a caret inside an emoji empty, snapping it before the code point', () => {
    // Policy: a caret must stay an insertion point. Expanding it outward would
    // silently delete the emoji on splice, so it snaps back instead.
    expect(normalizeSelection(EMOJI_TEXT, { start: 4, end: 4 })).toEqual({ start: 3, end: 3 })
    expect(spliceSelection(EMOJI_TEXT, { start: 4, end: 4 }, '!')).toBe('hi !👋 there')
  })

  test('pins the accepted limitation: fractional indices truncate, NaN reads as zero', () => {
    // Callers pass textarea offsets (always integers). Computed offsets that
    // drift are clamped rather than trusted — changing this must be deliberate.
    expect(normalizeSelection('open daily', { start: 2.9, end: 6.1 })).toEqual({ start: 2, end: 6 })
    expect(normalizeSelection('open daily', { start: Number.NaN, end: 4 })).toEqual({
      start: 0,
      end: 4,
    })
  })

  test('returns a new object and never mutates the caller selection', () => {
    const sel = { start: 6, end: 2 }
    const result = normalizeSelection('open daily', sel)
    expect(sel).toEqual({ start: 6, end: 2 })
    expect(result).not.toBe(sel)
  })
})
