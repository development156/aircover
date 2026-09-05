import {
  STAMP_ANCHORS,
  StampAnchorSchema,
  type StampAnchor,
  type StampAnchorMoveReason,
} from '@sahoda/shared'
import { describe, expect, test } from 'vitest'

import { anchorNote } from './anchor-note'

/**
 * FOUR CLAIMS, KEPT FOUR CLAIMS.
 *
 * ── WHAT THESE ASSERT, AND WHAT THEY DELIBERATELY DO NOT ────────────────────
 * The CLAIM, never the wording. `lib/inbox/emptiness.ts`'s tests are the
 * pattern: they check that a sentence does not say the wrong thing, and they
 * never pin the sentence itself. So every string in `anchor-note.ts` can be
 * rewritten and these guards still hold.
 *
 * The four inputs and their answers:
 *   anchor null                 -> silent, `unrecorded`
 *   anchor set, reason null     -> silent, `as_chosen`
 *   reason 'busy'               -> a sentence about a busy corner
 *   reason 'unreadable'         -> a sentence about legibility
 *
 * The two silent answers are DIFFERENT values, not one shared `null`, so a
 * mutation that makes the unrecorded branch answer like the as-chosen one has
 * something to go red on.
 */

describe('the two silent answers stay two answers', () => {
  test('a picture with no recorded anchor says nothing, and is not "as chosen"', () => {
    const note = anchorNote({ anchor: null, reason: null })
    expect(note).toEqual({ moved: false, reason: 'unrecorded' })
    // MUTATION: return `{ moved: false, reason: 'as_chosen' }` here and this goes
    // red. The two are different facts: one is "we never wrote it", the other is
    // "we wrote it and it matched", and a screen must not read the first as the
    // second and claim a placement nobody measured.
    expect(note.moved).toBe(false)
  })

  test('a mark stamped where it was asked says nothing', () => {
    for (const anchor of STAMP_ANCHORS) {
      const note = anchorNote({ anchor, reason: null })
      expect(note).toEqual({ moved: false, reason: 'as_chosen' })
    }
  })

  test('neither silent answer carries a sentence to render', () => {
    expect(anchorNote({ anchor: null, reason: null })).not.toHaveProperty('body')
    expect(anchorNote({ anchor: 'bottom-right', reason: null })).not.toHaveProperty('body')
  })
})

describe('a move is stated, and the two reasons never share a sentence', () => {
  test('busy names the corner it moved to and blames the busy corner, not legibility', () => {
    const note = anchorNote({ anchor: 'top-left', reason: 'busy' })
    expect(note.moved).toBe(true)
    if (!note.moved) throw new Error('expected a moved note')
    expect(note.reason).toBe('busy')
    expect(note.corner).toBe('top-left')
    // The claim: the chosen corner was busy. NOT a legibility claim.
    expect(note.body).toMatch(/busy/i)
    expect(note.body).not.toMatch(/legible|hard to read|contrast/i)
    // The destination corner is named in the sentence, in words.
    expect(note.body).toMatch(/top-left/i)
  })

  test('unreadable names the corner it moved to and blames legibility, not busyness', () => {
    const note = anchorNote({ anchor: 'bottom-left', reason: 'unreadable' })
    expect(note.moved).toBe(true)
    if (!note.moved) throw new Error('expected a moved note')
    expect(note.reason).toBe('unreadable')
    expect(note.corner).toBe('bottom-left')
    // The claim: the mark would not have read there. NOT a busyness claim.
    expect(note.body).toMatch(/legible|hard to read/i)
    expect(note.body).not.toMatch(/busy/i)
    expect(note.body).toMatch(/bottom-left/i)
  })

  test('the two moved sentences are not the same sentence', () => {
    // MUTATION: swap the two bodies and both claim tests above go red. This one
    // catches the swap even if a future edit made the claim substrings collide.
    const busy = anchorNote({ anchor: 'top-right', reason: 'busy' })
    const unreadable = anchorNote({ anchor: 'top-right', reason: 'unreadable' })
    if (!busy.moved || !unreadable.moved) throw new Error('expected moved notes')
    expect(busy.body).not.toBe(unreadable.body)
  })
})

describe('every corner is named in words, never as its stored key form', () => {
  test('a moved note reads a corner a person recognises', () => {
    for (const anchor of STAMP_ANCHORS) {
      const note = anchorNote({ anchor, reason: 'busy' })
      if (!note.moved) throw new Error('expected a moved note')
      // The stored key is a valid anchor, and the words for it appear in the body.
      expect(StampAnchorSchema.parse(anchor)).toBe(anchor)
      expect(note.body.toLowerCase()).toContain(anchor)
    }
  })
})

describe('a batch where the pictures landed differently', () => {
  /**
   * Each picture in a batch is measured on its own, so one press can produce a
   * mark that moved for busyness, one that moved for legibility, and one that
   * stayed. The notes must be independent: a shared `null` or a shared sentence
   * would tell a shop owner the same thing about three different pictures.
   */
  test('two moves to different corners and one that did not are three distinct answers', () => {
    const batch: { anchor: StampAnchor | null; reason: StampAnchorMoveReason | null }[] = [
      { anchor: 'top-left', reason: 'busy' },
      { anchor: 'bottom-left', reason: 'unreadable' },
      { anchor: 'bottom-right', reason: null },
    ]
    const notes = batch.map(anchorNote)

    // The two that moved each announce their own corner and reason.
    expect(notes[0]).toMatchObject({ moved: true, reason: 'busy', corner: 'top-left' })
    expect(notes[1]).toMatchObject({ moved: true, reason: 'unreadable', corner: 'bottom-left' })
    // The one that stayed says nothing, and is not lumped in with "unrecorded".
    expect(notes[2]).toEqual({ moved: false, reason: 'as_chosen' })

    // No two of the three are the same object shape end to end.
    const shapes = notes.map((n) => JSON.stringify(n))
    expect(new Set(shapes).size).toBe(3)
  })
})
