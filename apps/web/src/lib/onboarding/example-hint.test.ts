import { describe, expect, test } from 'vitest'

import { exampleHint } from './example-hint'
import { QUESTIONS } from './questions'

describe('a specimen answer is framed as a specimen', () => {
  test('names itself an example', () => {
    expect(exampleHint('We will not say homemade when we did not make the base.')).toBe(
      'Example: we will not say homemade when we did not make the base',
    )
  })

  test('drops the terminal full stop that made an empty box look finished', () => {
    expect(exampleHint('We bake sourdough on Prabhat Road.')).not.toMatch(/\.$/)
  })

  test('leaves a name capitalised', () => {
    expect(exampleHint('Sahoda writes it for you.')).toBe('Example: Sahoda writes it for you')
  })

  test('an apostrophe in the first word is not mangled', () => {
    expect(exampleHint("We will not run another brand's campaign line for line.")).toBe(
      "Example: we will not run another brand's campaign line for line",
    )
  })

  test('an empty specimen produces no hint rather than a bare label', () => {
    expect(exampleHint('   ')).toBe('')
  })

  /**
   * The claim, over the real catalogue rather than one fixture: no shipped
   * specimen still reads as a finished sentence.
   */
  test('no shipped question specimen ends in a full stop once framed', () => {
    const specimens = Object.values(QUESTIONS).map((q) => q.placeholder)
    // The floor is the guard: a catalogue read that returns nothing would make
    // every assertion below vacuously true.
    expect(specimens.length).toBeGreaterThanOrEqual(4)
    for (const s of specimens) {
      const hinted = exampleHint(s)
      if (hinted === '') continue
      expect(hinted.startsWith('Example: ')).toBe(true)
      expect(hinted.endsWith('.')).toBe(false)
    }
  })
})
