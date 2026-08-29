import { describe, expect, test } from 'vitest'

import { EXPORT_REFUSALS, EXPORT_STORED, planExport } from './export-copy'

/**
 * The three outcomes of pressing "add to library", and the CLAIM each makes.
 *
 * These assertions are about what is claimed, not about the wording: a sentence
 * may be rewritten freely, and the guarantee is that a trashed file is never
 * described as absent, that a second press is never described as a failure, and
 * that no sentence tells somebody to do something that cannot work.
 */
describe('planExport', () => {
  test('nothing holds these bytes, so they are stored', () => {
    expect(planExport(null)).toEqual({ kind: 'store' })
  })

  test('a live copy is named, and the design is not stored twice', () => {
    const plan = planExport({ assetId: 'a1', title: 'Sunday special', trashedAt: null })
    expect(plan.kind).toBe('linked')
    if (plan.kind === 'store') throw new Error('unreachable')
    expect(plan.assetId).toBe('a1')
    expect(plan.message).toMatch(/already in your library/i)
    expect(plan.message).toContain('Sunday special')
  })

  test('a live copy with no name says so without inventing one', () => {
    const plan = planExport({ assetId: 'a1', title: null, trashedAt: null })
    if (plan.kind !== 'linked') throw new Error('expected linked')
    expect(plan.message).toMatch(/already in your library/i)
    // "saved as untitled" would be a claim about a name that does not exist.
    expect(plan.message).not.toMatch(/untitled|saved as/i)
  })

  test('a title of only spaces is no title', () => {
    const plan = planExport({ assetId: 'a1', title: '   ', trashedAt: null })
    if (plan.kind !== 'linked') throw new Error('expected linked')
    expect(plan.message).not.toMatch(/saved as/i)
  })

  /**
   * THE ONE THAT MATTERS MOST.
   *
   * A trashed file is PRESENT. Answering "added to your library" would be false,
   * and answering "you already have this" without saying where sends a person
   * looking for a file that is not on the screen they are looking at.
   */
  test('a trashed copy is never reported as live, and the remedy is restoring it', () => {
    const plan = planExport({
      assetId: 'a1',
      title: 'Sunday special',
      trashedAt: '2026-08-29T00:00:00Z',
    })
    expect(plan.kind).toBe('in-trash')
    if (plan.kind === 'store') throw new Error('unreachable')
    expect(plan.message).toMatch(/trash/i)
    expect(plan.message).toMatch(/restore/i)
    // The forbidden claim: it is not in the library, and nothing was added.
    expect(plan.message).not.toMatch(/already in your library/i)
    expect(plan.message).not.toMatch(/\badded\b/i)
  })

  test('a trashed copy with no name still points at the trash', () => {
    const plan = planExport({ assetId: 'a1', title: null, trashedAt: '2026-08-29T00:00:00Z' })
    if (plan.kind !== 'in-trash') throw new Error('expected in-trash')
    expect(plan.message).toMatch(/trash/i)
    expect(plan.message).not.toMatch(/saved as/i)
  })

  test('every outcome carries the file it is talking about', () => {
    const live = planExport({ assetId: 'live-id', title: null, trashedAt: null })
    const trashed = planExport({
      assetId: 'trash-id',
      title: null,
      trashedAt: '2026-08-29T00:00:00Z',
    })
    if (live.kind === 'store' || trashed.kind === 'store') throw new Error('unreachable')
    expect(live.assetId).toBe('live-id')
    expect(trashed.assetId).toBe('trash-id')
  })
})

describe('the sentences the studio uses about an export', () => {
  test('the stored sentence claims the library and nothing more', () => {
    expect(EXPORT_STORED).toMatch(/library/i)
  })

  /**
   * A refusal must never say a picture was added, and must never blame the
   * person for our own failure. `unrenderable` is ours; it says so.
   */
  /**
   * A refusal may MENTION the library, and several must: "nothing was added to
   * your library" is the sentence that stops a person going to look for a file
   * that is not there. What it may never do is make the affirmative claim. So
   * the guard is not "the word library is absent" — that would have forced the
   * copy vaguer, which the copy rules forbid — it is that any refusal touching
   * the library carries the negation with it.
   */
  test('no refusal claims anything was stored', () => {
    for (const message of Object.values(EXPORT_REFUSALS)) {
      expect(message, message).not.toContain(EXPORT_STORED)
      if (/library/i.test(message)) {
        expect(message, message).toMatch(/nothing was|\bnot\b/i)
      }
    }
    expect(EXPORT_REFUSALS.unrenderable).toMatch(/our end/i)
  })

  test('the copy carries no em dash, which is the standing ruling for prose', () => {
    const prose = [EXPORT_STORED, ...Object.values(EXPORT_REFUSALS)]
    for (const message of prose) {
      expect(message, message).not.toMatch(/[—–]/)
    }
  })
})
