import { describe, expect, test } from 'vitest'

import {
  TEMPLATE_KEPT,
  TEMPLATE_REFUSALS,
  TEMPLATE_RELEASED,
  describeStartedFrom,
  templateShelf,
} from './template-copy'

/**
 * THE TWO ACTS, AND THE CLAIM EACH MAKES.
 *
 * Keeping a design as a starting point MOVES it and copies nothing. Starting
 * from one COPIES it and moves nothing. Those are opposite, a person cannot see
 * which happened from the result alone, and a sentence that blurs them turns
 * one of the two into what looks like data loss.
 *
 * Everything below asserts the CLAIM through lowercase substrings, never the
 * wording, so any sentence can be rewritten without touching this file.
 */
describe('keeping a design as a starting point', () => {
  /**
   * THE ONE THAT MATTERS. `readDesigns` splits on the boolean, so the design
   * leaves "your designs" the moment this is pressed. A person not told that
   * watches it disappear and concludes it was deleted.
   */
  test('says where the design went, and that nothing was copied', () => {
    expect(TEMPLATE_KEPT).toMatch(/starting point/i)
    expect(TEMPLATE_KEPT).toMatch(/moved out of your designs/i)
    // The forbidden claim: nothing was duplicated and nothing was removed.
    expect(TEMPLATE_KEPT).not.toMatch(/\bcopy|copied|duplicat/i)
    expect(TEMPLATE_KEPT).not.toMatch(/\bdeleted?\b/i)
  })

  test('and putting it back says the opposite, in the same terms', () => {
    expect(TEMPLATE_RELEASED).toMatch(/your designs/i)
    expect(TEMPLATE_RELEASED).toMatch(/no longer a starting point/i)
  })

  test('the two sentences are not interchangeable', () => {
    expect(TEMPLATE_KEPT).not.toBe(TEMPLATE_RELEASED)
  })
})

describe('starting a new design from a starting point', () => {
  test('names the original and promises it is untouched', () => {
    const message = describeStartedFrom('Diwali offer')
    expect(message).toContain('Diwali offer')
    expect(message).toMatch(/untouched/i)
    expect(message).toMatch(/new design/i)
  })

  test('a starting point with no name gets no invented one', () => {
    const message = describeStartedFrom('   ')
    expect(message).toMatch(/untouched/i)
    expect(message).not.toMatch(/untitled/i)
    // No dangling quotes around a name that does not exist.
    expect(message).not.toMatch(/[“”]/)
  })

  /** The claim that separates this from the toggle: nothing moved. */
  test('never says the original moved or changed', () => {
    const message = describeStartedFrom('Diwali offer')
    expect(message).not.toMatch(/moved|removed|deleted/i)
  })
})

describe('the starting-points shelf', () => {
  test('an empty shelf says so, and says how to fill it', () => {
    const shelf = templateShelf({ status: 'ok', designs: [], unreadable: 0 })
    expect(shelf.kind).toBe('empty')
    if (shelf.kind !== 'empty') return
    expect(shelf.body).toMatch(/keep it as a starting point/i)
  })

  /** THE ONE THAT MATTERS: a failed read is not an empty shelf. */
  test('a failed read never claims the shelf is empty', () => {
    const shelf = templateShelf({ status: 'unreadable' })
    expect(shelf.kind).toBe('unreadable')
    if (shelf.kind !== 'unreadable') return
    expect(shelf.message).toMatch(/could not be read/i)
    expect(shelf.message).not.toMatch(/you have none|no starting points/i)
    // And it says the count it shows is not a count.
    expect(shelf.message).toMatch(/not a reading/i)
  })

  test('no workspace is its own state, not an empty shelf', () => {
    expect(templateShelf({ status: 'no-workspace' }).kind).toBe('no-workspace')
  })

  test('rows that would not open are not an empty shelf either', () => {
    // Nothing parsed, but three rows EXIST. Saying "you have none" here is the
    // same lie as after a failed read, reached by a different route.
    const shelf = templateShelf({ status: 'ok', designs: [], unreadable: 3 })
    expect(shelf.kind).toBe('has-templates')
    if (shelf.kind !== 'has-templates') return
    expect(shelf.unreadable).toBe(3)
  })

  test('a shelf with rows is a shelf with rows', () => {
    expect(templateShelf({ status: 'ok', designs: [{}, {}], unreadable: 0 }).kind).toBe(
      'has-templates',
    )
  })
})

describe('the refusals', () => {
  test('every one says nothing was changed, and none claims success', () => {
    for (const message of Object.values(TEMPLATE_REFUSALS)) {
      expect(message, message).not.toMatch(/kept as a starting point|started a new design/i)
    }
    expect(TEMPLATE_REFUSALS.flagFailed).toMatch(/nothing was changed/i)
    expect(TEMPLATE_REFUSALS.copyFailed).toMatch(/nothing was changed/i)
  })

  test('the copy carries no em dash, which is the standing ruling for prose', () => {
    const prose = [
      TEMPLATE_KEPT,
      TEMPLATE_RELEASED,
      describeStartedFrom('X'),
      ...Object.values(TEMPLATE_REFUSALS),
    ]
    for (const message of prose) {
      expect(message, message).not.toMatch(/[—–]/)
    }
  })
})
