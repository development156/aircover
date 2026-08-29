import { describe, expect, test } from 'vitest'

import { studioEmptiness, describeUnreadableDesigns } from '@/lib/studio/emptiness'
import type { DesignListRead } from '@/lib/studio/read'

/**
 * STUDIO MUST NEVER TELL SOMEBODY THEIR WORK IS GONE.
 *
 * ── THIS GUARD WAS RETARGETED, NOT DELETED, AND HERE IS THE MOVE ────────────
 * It used to assert the sentence "no gallery behind these filters", because
 * /studio was a roadmap screen showing a filter row over a gallery that did not
 * exist, and the only denial sat in the footer three sections down. The claim it
 * protected was: THE SCREEN MUST NOT IMPLY A COLLECTION EXISTS WHEN IT DOES NOT.
 *
 * On 2026-08-28 the gallery became real, so that exact sentence is gone and the
 * old assertion would have been deleted as obsolete. CLAUDE.md's fifth copy rule
 * says retarget instead, and the claim survives the screen becoming real — it
 * just inverts. The screen must now not imply the collection is EMPTY when it is
 * merely unreadable, which is the same defect pointing the other way and a worse
 * one: a person told they have no designs concludes their work was lost.
 *
 * So the guard moved from the page's markup to `lib/studio/emptiness.ts`, where
 * the distinction actually lives. It asserts CLAIMS through lowercase
 * substrings, never wording, so every sentence below can be rewritten freely.
 */

const asRead = (over: Partial<Extract<DesignListRead, { status: 'ok' }>>): DesignListRead => ({
  status: 'ok',
  designs: [],
  unreadable: 0,
  ...over,
})

describe('/studio never confuses an empty gallery with a failed read', () => {
  test('a read that failed does NOT say the person has no designs', () => {
    const state = studioEmptiness({ status: 'unreadable' })
    expect(state.kind).toBe('unreadable')
    if (state.kind !== 'unreadable') return
    // The forbidden claim, in every form it could take.
    expect(state.message.toLowerCase()).not.toMatch(/\bno designs\b/)
    expect(state.message.toLowerCase()).not.toMatch(/\bnone yet\b/)
    expect(state.message.toLowerCase()).not.toMatch(/\bempty\b/)
    // And it says the thing a person most needs to hear.
    expect(state.message.toLowerCase()).toMatch(/nothing was lost/)
  })

  test('an empty gallery does NOT suggest a reload, because nothing failed', () => {
    const state = studioEmptiness(asRead({}))
    expect(state.kind).toBe('empty')
    if (state.kind !== 'empty') return
    expect(state.body.toLowerCase()).not.toMatch(/reload|try again|problem/)
  })

  /**
   * The one a `designs.length === 0` check gets wrong by accident: every row
   * failed to parse, so the list is empty and the workspace is NOT.
   */
  test('rows that would not open are not reported as having no designs', () => {
    const state = studioEmptiness(asRead({ unreadable: 3 }))
    expect(state.kind).toBe('has-designs')
    if (state.kind !== 'has-designs') return
    expect(state.unreadable).toBe(3)
  })

  test('no workspace is its own answer, not an empty gallery', () => {
    const state = studioEmptiness({ status: 'no-workspace' })
    expect(state.kind).toBe('no-workspace')
    if (state.kind !== 'no-workspace') return
    expect(state.body.toLowerCase()).toMatch(/workspace/)
    expect(state.body.toLowerCase()).not.toMatch(/\bno designs\b/)
  })

  test('all four states are distinguishable, so no two can share a sentence', () => {
    const kinds = [
      studioEmptiness({ status: 'no-workspace' }).kind,
      studioEmptiness({ status: 'unreadable' }).kind,
      studioEmptiness(asRead({})).kind,
      studioEmptiness(asRead({ unreadable: 1 })).kind,
    ]
    expect(new Set(kinds).size).toBe(4)
  })
})

describe('the note about designs that would not open', () => {
  test('says nothing was deleted, because that is what a person otherwise concludes', () => {
    expect(describeUnreadableDesigns(2)?.toLowerCase()).toMatch(/nothing was deleted/)
  })

  test('is silent when every design opened', () => {
    expect(describeUnreadableDesigns(0)).toBeNull()
    expect(describeUnreadableDesigns(-1)).toBeNull()
  })

  test('counts one design in the singular', () => {
    expect(describeUnreadableDesigns(1)).toMatch(/^1 design /)
    expect(describeUnreadableDesigns(2)).toMatch(/^2 designs /)
  })
})
