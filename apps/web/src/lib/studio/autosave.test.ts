import { describe, expect, test } from 'vitest'

import type { DesignDocument } from '@sahoda/shared'

import { AUTOSAVE_DELAY_MS, describeSaveState, draftIsDirty, type DesignDraft } from './autosave'

/**
 * WHAT AUTOSAVE PROMISES, AND THE ONE WAY IT COULD QUIETLY BECOME A WRITE LOOP.
 *
 * Claims, not wording. Every sentence asserted below can be rewritten freely;
 * what may not change is which claim each state makes.
 */

const doc = (text: string): DesignDocument => ({
  v: 1,
  templateId: 'bold-statement',
  pages: [{ slots: { headline: { kind: 'text', text } } }],
})

const draft = (text: string, isTemplate = false): DesignDraft => ({
  title: 'A poster',
  doc: doc(text),
  isTemplate,
})

describe('draftIsDirty', () => {
  test('nothing typed is not dirty', () => {
    expect(draftIsDirty(draft('Open Sunday'), draft('Open Sunday'))).toBe(false)
  })

  test('a changed word is dirty', () => {
    expect(draftIsDirty(draft('Open Sunday'), draft('Open Monday'))).toBe(true)
  })

  test('a changed title is dirty, because the title is stored too', () => {
    const saved = draft('Open Sunday')
    expect(draftIsDirty({ ...saved, title: 'Something else' }, saved)).toBe(true)
  })

  /**
   * Ticking the starting-point box is a change the SAVE writes, so it has to
   * count as one. It is in the draft at all because `saveDesign` defaults the
   * column to false when the field is absent.
   */
  test('keeping it as a starting point is dirty', () => {
    expect(draftIsDirty(draft('Open Sunday', true), draft('Open Sunday', false))).toBe(true)
  })

  /**
   * THE ONE THAT MATTERS.
   *
   * The saved side comes back from a `jsonb` column, which stores keys sorted
   * and returns them sorted, while the browser's object carries them in the
   * order the editor wrote them. If key order counted, a document nobody
   * touched would read as dirty forever: a write every 1.2 seconds, for as long
   * as the tab is open, against a row that never changes.
   */
  test('the same document with its keys in a different order is not dirty', () => {
    const typed = {
      title: 'A poster',
      isTemplate: false,
      doc: {
        templateId: 'bold-statement',
        v: 1,
        pages: [{ slots: { headline: { kind: 'text', text: 'Hi' } } }],
      },
    } as DesignDraft
    const fromDatabase = {
      isTemplate: false,
      doc: {
        pages: [{ slots: { headline: { text: 'Hi', kind: 'text' } } }],
        templateId: 'bold-statement',
        v: 1,
      },
      title: 'A poster',
    } as DesignDraft
    expect(draftIsDirty(typed, fromDatabase)).toBe(false)
  })

  /** Slide ORDER is meaning, so arrays are compared in order and not sorted. */
  test('reordering slides is dirty', () => {
    const a: DesignDraft = {
      title: 'A poster',
      isTemplate: false,
      doc: {
        v: 1,
        templateId: 'bold-statement',
        pages: [...doc('One').pages, ...doc('Two').pages],
      },
    }
    const b: DesignDraft = {
      title: 'A poster',
      isTemplate: false,
      doc: {
        v: 1,
        templateId: 'bold-statement',
        pages: [...doc('Two').pages, ...doc('One').pages],
      },
    }
    expect(draftIsDirty(a, b)).toBe(true)
  })

  test('a key set to undefined is the same as a key that is absent', () => {
    const withUndefined = { ...draft('Hi'), doc: { ...doc('Hi'), extra: undefined } } as DesignDraft
    expect(draftIsDirty(withUndefined, draft('Hi'))).toBe(false)
  })
})

describe('describeSaveState', () => {
  /**
   * The words are on screen and nowhere else, and the remedy people reach for
   * by habit would destroy them. So the sentence has to keep the tab open and
   * must never send somebody to a reload.
   */
  test('a failure says the words survive and never offers a reload', () => {
    const said = describeSaveState({ kind: 'failed', message: 'Sahoda could not save.' }, true)
    expect(said).toMatch(/still on this screen/i)
    expect(said).toMatch(/keep this tab open/i)
    expect(said).not.toMatch(/reload|refresh the page/i)
  })

  test('a failure carries the server refusal rather than replacing it', () => {
    const said = describeSaveState(
      { kind: 'failed', message: 'This design no longer exists.' },
      true,
    )
    expect(said).toMatch(/no longer exists/)
  })

  test('typed and not written down yet says so, because silence reads as saved', () => {
    expect(describeSaveState({ kind: 'idle' }, true)).toMatch(/not saved/i)
    expect(describeSaveState({ kind: 'saved' }, true)).toMatch(/not saved/i)
  })

  test('written down says so', () => {
    expect(describeSaveState({ kind: 'saved' }, false)).toMatch(/saved/i)
  })

  test('nothing typed and nothing saved this visit says nothing at all', () => {
    expect(describeSaveState({ kind: 'idle' }, false)).toBeNull()
  })

  test('a failure outranks the dirty flag, because it is the actionable one', () => {
    expect(describeSaveState({ kind: 'failed', message: 'Sahoda could not save.' }, false)).toMatch(
      /still on this screen/i,
    )
  })

  test('the copy carries no em dash, which is the standing ruling for prose', () => {
    const all = [
      describeSaveState({ kind: 'failed', message: 'Sahoda could not save.' }, true),
      describeSaveState({ kind: 'saving' }, true),
      describeSaveState({ kind: 'idle' }, true),
      describeSaveState({ kind: 'saved' }, false),
    ]
    for (const message of all) expect(message, message ?? '').not.toMatch(/[—–]/)
  })

  test('the delay is a pause in typing, not a wait somebody notices', () => {
    expect(AUTOSAVE_DELAY_MS).toBeGreaterThan(0)
    expect(AUTOSAVE_DELAY_MS).toBeLessThanOrEqual(3000)
  })
})
