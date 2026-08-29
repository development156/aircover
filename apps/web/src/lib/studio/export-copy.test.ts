import { describe, expect, test } from 'vitest'

import {
  EXPORT_REFUSALS,
  EXPORT_STORED,
  describeBatchExport,
  planExport,
  titleForPage,
  type PageExport,
} from './export-copy'

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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SENTENCE AFTER EXPORTING A WHOLE CAROUSEL.
 *
 * Every assertion here is about a CLAIM, checked through a lowercase substring
 * or a slide number, never through wording. What must hold: a slide that failed
 * is never described as added, a slide already in the library is never
 * described as newly stored, and a person can always tell WHICH slides are
 * where. "Some slides could not be added" is the sentence this exists to
 * prevent.
 */
const stored = (pageIndex: number): PageExport => ({
  pageIndex,
  ok: true,
  outcome: 'stored',
  assetId: `a${pageIndex}`,
})
const already = (pageIndex: number): PageExport => ({
  pageIndex,
  ok: true,
  outcome: 'already',
  assetId: `a${pageIndex}`,
})
const trashed = (pageIndex: number): PageExport => ({
  pageIndex,
  ok: true,
  outcome: 'in-trash',
  assetId: `a${pageIndex}`,
})
const failed = (
  pageIndex: number,
  message = 'The headline is too long for its box.',
): PageExport => ({ pageIndex, ok: false, message })

describe('describeBatchExport', () => {
  test('one slide gets the single-file sentence, not a count of one', () => {
    expect(describeBatchExport([stored(0)])).toBe(EXPORT_STORED)
  })

  test('every slide stored says so once rather than listing them', () => {
    const message = describeBatchExport([stored(0), stored(1), stored(2)])
    expect(message).toMatch(/all 3 slides/i)
    expect(message).toMatch(/added to your library/i)
  })

  /** THE ONE THAT MATTERS: a failure must never be inside a sentence that claims success. */
  test('a failed slide is named, with its own reason, and never called added', () => {
    const message = describeBatchExport([stored(0), stored(1), failed(2)])
    // The two that worked are claimed, by number.
    expect(message).toMatch(/slides 1 and 2 were added/i)
    // The one that did not is claimed as NOT added, by number, with the reason.
    expect(message).toMatch(/slide 3 was not added/i)
    expect(message).toContain('The headline is too long for its box.')
  })

  test('slides counted from 1, because that is what the editor shows', () => {
    expect(describeBatchExport([stored(0), failed(1)])).toMatch(/slide 2 was not added/i)
  })

  test('two failures with different reasons do not present one reason as covering both', () => {
    const message = describeBatchExport([
      failed(0, 'The headline is too long for its box.'),
      failed(1, 'A picture could not be read.'),
    ])
    expect(message).toMatch(/slides 1 and 2 were not added/i)
    // Neither reason is attached, because attaching one would make it a claim
    // about the other slide as well.
    expect(message).not.toContain('The headline is too long for its box.')
    expect(message).not.toContain('A picture could not be read.')
  })

  test('a slide already in the library is not reported as newly stored', () => {
    const message = describeBatchExport([stored(0), already(1)])
    expect(message).toMatch(/slide 1 was added/i)
    expect(message).toMatch(/slide 2 was already there/i)
    expect(message).toMatch(/nothing was stored twice/i)
  })

  test('a trashed slide points at the trash rather than claiming the library', () => {
    const message = describeBatchExport([trashed(0)])
    expect(message).toMatch(/trash/i)
    expect(message).toMatch(/restore/i)
    expect(message).not.toMatch(/added to your library/i)
  })

  test('all four outcomes at once each keep their own claim', () => {
    const message = describeBatchExport([stored(0), already(1), trashed(2), failed(3)])
    expect(message).toMatch(/slide 1 was added/i)
    expect(message).toMatch(/slide 2 was already there/i)
    expect(message).toMatch(/slide 3 is in your trash/i)
    expect(message).toMatch(/slide 4 was not added/i)
  })

  test('no slides at all is not reported as a success', () => {
    expect(describeBatchExport([])).not.toMatch(/added to your library/i)
  })
})

describe('titleForPage', () => {
  test('a single-page design keeps its own name', () => {
    expect(titleForPage('Diwali offer', 0, 1)).toBe('Diwali offer')
  })

  test('a carousel names each slide by the number the editor shows', () => {
    expect(titleForPage('Diwali offer', 0, 3)).toBe('Diwali offer (slide 1)')
    expect(titleForPage('Diwali offer', 2, 3)).toBe('Diwali offer (slide 3)')
  })

  test('the number survives a long name, because the number is what tells them apart', () => {
    const long = 'x'.repeat(200)
    const title = titleForPage(long, 4, 6)
    expect(title.length).toBeLessThanOrEqual(120)
    expect(title.endsWith('(slide 5)')).toBe(true)
  })

  test('a design with no name gets one rather than an empty title', () => {
    expect(titleForPage('   ', 0, 1)).toBe('Design')
  })
})
