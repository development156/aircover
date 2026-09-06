import { describe, expect, test } from 'vitest'

import { editKeepsBrand } from './brand-carry'

/**
 * WHAT COUNTS AS "STILL THE SAME SENTENCE", AND WHAT COUNTS AS A NEW ONE.
 *
 * Claims, not wording: a small edit inside a refined sentence must keep the
 * brand carried, and clearing or replacing it must drop it. See
 * `brand-carry.ts`'s own header for why the measure is shared prefix+suffix.
 */
describe('editKeepsBrand', () => {
  test("a small in-place edit keeps it: swapping 'morning' for 'evening'", () => {
    const previous =
      'A cosy neighbourhood coffee shop counter, warm and inviting, morning light, oat-milk latte art'
    const next =
      'A cosy neighbourhood coffee shop counter, warm and inviting, evening light, oat-milk latte art'
    expect(editKeepsBrand(previous, next)).toBe(true)
  })

  test('typing more onto the end keeps it: nothing already there was touched', () => {
    const previous = 'A warm, plain-spoken shopfront at dusk'
    const next = 'A warm, plain-spoken shopfront at dusk, with the lights just on'
    expect(editKeepsBrand(previous, next)).toBe(true)
  })

  test('deleting a little from the end keeps it', () => {
    const previous = 'A warm, plain-spoken shopfront at dusk, with the lights just on'
    const next = 'A warm, plain-spoken shopfront at dusk'
    expect(editKeepsBrand(previous, next)).toBe(true)
  })

  test('clearing the box entirely drops it', () => {
    expect(editKeepsBrand('A warm, plain-spoken shopfront at dusk', '')).toBe(false)
    expect(editKeepsBrand('A warm, plain-spoken shopfront at dusk', '   ')).toBe(false)
  })

  test('replacing the sentence wholesale (a starter chip, a paste over select-all) drops it', () => {
    const previous =
      'A warm, plain-spoken shopfront at dusk with the lights just on, oat-milk latte art'
    const next = 'A cup of chai beside a rain-streaked window'
    expect(editKeepsBrand(previous, next)).toBe(false)
  })

  test('an empty previous text never counts as carried forward', () => {
    expect(editKeepsBrand('', 'a shopfront')).toBe(false)
  })

  test('the exact same text trivially keeps it', () => {
    expect(editKeepsBrand('a shopfront at dusk', 'a shopfront at dusk')).toBe(true)
  })
})
