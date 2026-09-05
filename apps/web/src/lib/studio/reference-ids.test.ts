import { describe, expect, test } from 'vitest'

import { MAX_REFERENCES } from './modes'
import { ReferenceIdsSchema } from './reference-ids'

/**
 * HOW MANY PAID CALLS CARRY HOW MANY PICTURES.
 *
 * The screen cannot produce a duplicate. A hand-made request can, and this is
 * where that stops being a charge for a call carrying one picture described as
 * three.
 */

// Real v4 shapes: zod's uuid() checks the version and variant nibbles, so a
// convenient-looking all-zeros id is not a UUID and would test nothing.
const id = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`

describe('the pictures a request says to look at', () => {
  test('an absent list is an empty one, not a failure', () => {
    expect(ReferenceIdsSchema.parse(undefined)).toEqual([])
  })

  test('distinct pictures pass through untouched', () => {
    const ids = [id(1), id(2)]
    expect(ReferenceIdsSchema.parse(ids)).toEqual(ids)
  })

  /**
   * THE ONE THAT MATTERS. Three copies of one id would be stored on the row as
   * three references and sent to the provider three times, so the row claims a
   * provenance that is not true.
   */
  test('the same picture sent three times is one reference', () => {
    expect(ReferenceIdsSchema.parse([id(1), id(1), id(1)])).toEqual([id(1)])
  })

  /**
   * De-duplicated FIRST and bounded after. Five copies of one picture is one
   * reference rather than a refusal: somebody who sent that meant one.
   */
  test('five copies of one picture is accepted, because it is one picture', () => {
    const five = Array.from({ length: 5 }, () => id(1))
    expect(ReferenceIdsSchema.parse(five)).toEqual([id(1)])
  })

  test('more DISTINCT pictures than the model will look at is refused', () => {
    const tooMany = Array.from({ length: MAX_REFERENCES + 1 }, (_unused, i) => id(i))
    expect(ReferenceIdsSchema.safeParse(tooMany).success).toBe(false)
  })

  test('exactly the maximum is allowed, because the bound is inclusive', () => {
    const most = Array.from({ length: MAX_REFERENCES }, (_unused, i) => id(i))
    expect(ReferenceIdsSchema.parse(most)).toHaveLength(MAX_REFERENCES)
  })

  /**
   * References are not commutative: they are sent in pick order and the first
   * weighs most, which is why the picker shows a position rather than a tick.
   * De-duplication must not quietly reorder them.
   */
  test('de-duplication keeps the order somebody picked in', () => {
    expect(ReferenceIdsSchema.parse([id(3), id(1), id(3), id(2)])).toEqual([id(3), id(1), id(2)])
  })

  test('something that is not an id is refused rather than passed along', () => {
    expect(ReferenceIdsSchema.safeParse(['not-an-id']).success).toBe(false)
    expect(ReferenceIdsSchema.safeParse('one-string').success).toBe(false)
  })
})
