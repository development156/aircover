import { StampOutcomeSchema, type StampOutcome } from '@sahoda/shared'
import { describe, expect, test } from 'vitest'

import { stampNote } from './stamp-copy'

/**
 * The five answers stay five answers.
 *
 * ── WHAT THESE ASSERT, AND WHAT THEY DELIBERATELY DO NOT ────────────────────
 * The CLAIM, never the wording. `lib/inbox/emptiness.ts`'s tests are the
 * pattern: they check that a sentence does not say "no reviews" when the truth
 * is "we never asked", and they never pin the sentence itself. So every string
 * below can be rewritten freely and these guards still hold.
 *
 * The one thing that is pinned is the SHAPE of the remedy, because a remedy is
 * a promise that pressing something changes the situation.
 */

const ANSWERS: (StampOutcome | null)[] = [...StampOutcomeSchema.options, null]

describe('every outcome gets its own answer', () => {
  test('the enum and this module cannot drift apart', () => {
    // A value added to `StampOutcomeSchema` with no branch here would fall out
    // of the switch as undefined rather than failing to compile, because the
    // database is the other producer and TypeScript never sees its rows.
    for (const outcome of ANSWERS) {
      const note = stampNote(outcome)
      expect(note.title, `no title for ${String(outcome)}`).toBeTruthy()
      expect(note.body, `no body for ${String(outcome)}`).toBeTruthy()
    }
  })

  test('no two answers share a sentence', () => {
    const bodies = ANSWERS.map((outcome) => stampNote(outcome).body)
    expect(new Set(bodies).size).toBe(ANSWERS.length)
    const titles = ANSWERS.map((outcome) => stampNote(outcome).title)
    expect(new Set(titles).size).toBe(ANSWERS.length)
  })
})

describe('the remedy is offered only where one exists', () => {
  test('no logo yet points at adding one, and never at replacing one', () => {
    const note = stampNote('no_logo')
    expect(note.remedy).not.toBeNull()
    expect(note.remedy!.label).toMatch(/add/i)
    expect(note.remedy!.label).not.toMatch(/replace/i)
    // It must not describe this as something going wrong. Nothing did.
    expect(`${note.title} ${note.body}`).not.toMatch(/could not|failed|wrong|error/i)
  })

  test('an unreadable logo points at replacing it, and never at adding one', () => {
    const note = stampNote('logo_unreadable')
    expect(note.remedy).not.toBeNull()
    expect(note.remedy!.label).toMatch(/replace/i)
    // THE DEAD END THIS EXISTS FOR: telling somebody to add a logo they have
    // already added. They uploaded a file; it is the file that cannot be read.
    expect(note.remedy!.label).not.toMatch(/\badd\b/i)
    // And the money question is answered without being asked.
    expect(note.body).toMatch(/charged once/i)
  })

  test('a failure offers nothing, because nothing they do changes it', () => {
    const note = stampNote('failed')
    expect(note.remedy).toBeNull()
    expect(note.body).toMatch(/charged once/i)
  })

  test('a stamped picture and one made before stamping both offer nothing', () => {
    expect(stampNote('stamped').remedy).toBeNull()
    expect(stampNote(null).remedy).toBeNull()
  })
})

describe('never attempted is not a failure', () => {
  /**
   * NULL is the answer for every row written before this shipped, and for any
   * deploy where the column is not yet applied. Rendering it as a failure would
   * tell somebody something went wrong with a picture that predates the feature
   * -- and rendering it as "no logo yet" would be a claim about a workspace that
   * may well have had one at the time.
   */
  test('it says nothing went wrong, and does not claim the workspace has no logo', () => {
    const note = stampNote(null)
    expect(note.body).toMatch(/nothing went wrong/i)
    expect(`${note.title} ${note.body}`).not.toMatch(/could not|failed|error/i)
    expect(`${note.title} ${note.body}`).not.toMatch(/no logo yet/i)
  })

  test('it is a different answer from every recorded one', () => {
    const never = stampNote(null)
    for (const outcome of StampOutcomeSchema.options) {
      expect(stampNote(outcome).body, outcome).not.toBe(never.body)
    }
  })
})

describe('two versions exist for exactly one answer', () => {
  test('only a stamped picture has both', () => {
    expect(stampNote('stamped').hasBothVersions).toBe(true)
    for (const outcome of [...StampOutcomeSchema.options, null].filter((o) => o !== 'stamped')) {
      // A toggle over one picture is a control that does nothing, which is the
      // same defect class as a remedy that leads nowhere.
      expect(stampNote(outcome).hasBothVersions, String(outcome)).toBe(false)
    }
  })
})

describe('a deploy where the column is not there yet', () => {
  /**
   * The situation `case null` was written for, arriving in the shape it actually
   * arrives in.
   *
   * `read.ts` builds `stampOutcome` out of a `select('*')` row. Where
   * `20260831150000_studio_stamped_asset.sql` has not been applied — which
   * `docs/db/MIGRATION_DIVERGENCE_2026-09-02.md` lists as one of four files
   * production has never recorded — the column is ABSENT, so the value is
   * `undefined` and not `null`.
   *
   * MEASURED 2026-09-04: a `switch` on `undefined` matched no case, the switch
   * is exhaustive with no `default`, and `stampNote` returned `undefined`. The
   * one message that is about US rather than the customer could not be shown in
   * the one situation it describes, and the screen got nothing instead.
   *
   * The cast is the point: TypeScript says this cannot happen, and the row this
   * value comes from is not typed by TypeScript.
   */
  const absent = undefined as unknown as null

  test('still returns a note, rather than nothing at all', () => {
    expect(stampNote(absent)).toBeDefined()
  })

  test('gives the same answer as an explicit null, because it is the same fact', () => {
    expect(stampNote(absent)).toEqual(stampNote(null))
  })

  test('does not blame the customer for a migration we have not applied', () => {
    const note = stampNote(absent)
    expect(`${note.title} ${note.body}`).not.toMatch(/could not|failed|error|no logo yet/i)
    expect(note.remedy).toBeNull()
  })
})
