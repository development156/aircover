import { describe, expect, test } from 'vitest'

import { intakeDerivedPaths } from './intake-paths'

/**
 * Which Brand Brain fields a setup answer seeds. `toResolveInput` is the
 * authority on where each answer goes into the model's input; this is the
 * mirror on the way out, so the save can stamp those fields `source: 'intake'`
 * instead of `model:brand_guidelines`. Conservative on purpose: a blank answer
 * seeds nothing, and only the three fields with a one-to-one answer are named.
 */
describe('intakeDerivedPaths', () => {
  test('nothing typed, nothing seeded', () => {
    expect(intakeDerivedPaths({ neverSay: '', audience: '', what: '' })).toEqual([])
    expect(intakeDerivedPaths({ neverSay: '   ', audience: '\n', what: '' })).toEqual([])
  })

  test('the refusal seeds the red lines', () => {
    expect(
      intakeDerivedPaths({ neverSay: 'Never say guilt-free', audience: '', what: '' }),
    ).toEqual(['taboo.red_lines'])
  })

  test('the audience seeds the customer one-liner; the positioning seeds the brand one-liner', () => {
    expect(
      intakeDerivedPaths({ neverSay: '', audience: 'Families within 5 km', what: 'A bakery' }),
    ).toEqual(['brand_persona.one_liner', 'customer_persona.one_liner'])
  })
})
