import { describe, expect, test } from 'vitest'

import type { DesignDocument } from '@sahoda/shared'

import {
  AUTOSAVE_DELAY_MS,
  describeDraftBlock,
  describeSaveState,
  draftIsDirty,
  type DesignDraft,
} from './autosave'

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

  /**
   * The title is trimmed because `TitleSchema` trims it server-side, so a draft
   * ending in a space could never equal the row that comes back and the editor
   * would write it forever.
   */
  test('a title the server will trim is not dirty', () => {
    const saved = draft('Open Sunday')
    expect(draftIsDirty({ ...saved, title: `${saved.title} ` }, saved)).toBe(false)
  })

  /**
   * AND THE TRIM STOPS AT THE TITLE. Slot text is stored exactly as typed, so a
   * trailing space inside a headline is a real change somebody made and a save
   * they are owed. Trimming every string in the document would silently drop
   * it, and the loop guard above would still pass.
   */
  test('a trailing space inside a slot is dirty, because the server keeps it', () => {
    expect(draftIsDirty(draft('Open Sunday '), draft('Open Sunday'))).toBe(true)
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

/**
 * THE RETRY STORM THE AUTOSAVE WOULD OTHERWISE HAVE CREATED.
 *
 * MEASURED against `TitleSchema` (`z.string().trim().min(1).max(80)`): an empty
 * name is refused and so is one made only of spaces. The server answers with
 * "part of it was not readable", which names nothing the person can act on, and
 * with an autosave that answer would arrive every 1.2 seconds for as long as
 * the box stayed empty.
 */
describe('describeDraftBlock', () => {
  test('an empty name blocks the save and says which box', () => {
    const said = describeDraftBlock({ ...draft('Open Sunday'), title: '' })
    expect(said).not.toBeNull()
    expect(said).toMatch(/name/i)
  })

  test('a name of only spaces blocks it too, because the schema trims first', () => {
    expect(describeDraftBlock({ ...draft('Open Sunday'), title: '   ' })).not.toBeNull()
  })

  test('it promises the typing survives, because that is the fear', () => {
    const said = describeDraftBlock({ ...draft('Open Sunday'), title: '' })
    expect(said).toMatch(/still on this screen/i)
  })

  /**
   * It never claims something failed. Nothing was sent and nothing was refused:
   * saying "could not be saved" would describe an event that did not happen.
   */
  test('it does not report a failure, because no write was attempted', () => {
    const said = describeDraftBlock({ ...draft('Open Sunday'), title: '' })
    expect(said).not.toMatch(/could not|failed|error/i)
  })

  test('a name that is only a name blocks nothing', () => {
    expect(describeDraftBlock(draft('Open Sunday'))).toBeNull()
    expect(describeDraftBlock({ ...draft('Open Sunday'), title: 'x' })).toBeNull()
  })

  test('a full-length name is fine, because the schema allows eighty', () => {
    expect(describeDraftBlock({ ...draft('Open Sunday'), title: 'x'.repeat(80) })).toBeNull()
  })

  test('the block outranks every other status, because it is the actionable one', () => {
    const blocked = 'Give this design a name.'
    expect(
      describeSaveState({ kind: 'failed', message: 'Sahoda could not save.' }, true, blocked),
    ).toBe(blocked)
    expect(describeSaveState({ kind: 'saving' }, true, blocked)).toBe(blocked)
    expect(describeSaveState({ kind: 'saved' }, false, blocked)).toBe(blocked)
  })

  test('the copy carries no em dash, which is the standing ruling for prose', () => {
    expect(describeDraftBlock({ ...draft('Open Sunday'), title: '' })).not.toMatch(/[—–]/)
  })
})
