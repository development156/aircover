import { describe, expect, test } from 'vitest'

import { DELETE_AT_REST, DELETE_CANCEL, describeDesignDelete } from './delete-copy'

/**
 * THE CLAIM A CONFIRMATION MAKES.
 *
 * Two things have to be true at once, and getting either wrong costs somebody
 * something: the design really is unrecoverable, so the sentence must say so;
 * and the pictures it exported really are NOT deleted, so the sentence must not
 * imply they are. A person who believes their exported posters go with it will
 * keep a design they wanted rid of, and that refusal would be caused by our own
 * vagueness rather than by their preference.
 *
 * Claims, not wording. Every sentence below can be rewritten freely.
 */
describe('describeDesignDelete', () => {
  const single = describeDesignDelete({ pageCount: 1, isTemplate: false })

  test('says the loss is permanent, because it is', () => {
    expect(single.detail).toMatch(/for good/i)
    expect(single.detail).toMatch(/no trash/i)
  })

  /** THE ONE THAT MATTERS. Exported pictures are rows in `assets` and survive. */
  test('never suggests the exported pictures go too, because they do not', () => {
    expect(single.detail).toMatch(/stays there|stay there/i)
    expect(single.detail).not.toMatch(/pictures? (are|is) (also )?deleted/i)
    expect(single.detail).not.toMatch(/everything (is|will be) (deleted|removed)/i)
  })

  test('a carousel says how many slides go with it', () => {
    const three = describeDesignDelete({ pageCount: 3, isTemplate: false })
    expect(three.detail).toMatch(/all 3 slides/i)
  })

  test('a single page does not count slides at somebody', () => {
    expect(single.detail).not.toMatch(/slide/i)
  })

  /**
   * Said only when true. A design that was never a starting point gaining this
   * sentence would be a claim about a shelf it was never on, which is the same
   * class of defect as inventing a consequence.
   */
  test('a starting point says it stops being one, and an ordinary design does not', () => {
    const template = describeDesignDelete({ pageCount: 1, isTemplate: true })
    expect(template.detail).toMatch(/starting point/i)
    expect(single.detail).not.toMatch(/starting point/i)
  })

  test('the armed button says pressing again is what deletes', () => {
    expect(single.confirm).toMatch(/again/i)
    expect(single.confirm).not.toBe(DELETE_AT_REST)
  })

  test('there is a way back that is not deleting', () => {
    expect(DELETE_CANCEL).not.toMatch(/delete/i)
  })

  test('the copy carries no em dash, which is the standing ruling for prose', () => {
    for (const message of [single.detail, single.confirm, DELETE_AT_REST, DELETE_CANCEL]) {
      expect(message, message).not.toMatch(/[—–]/)
    }
  })
})
