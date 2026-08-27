import { describe, expect, test } from 'vitest'

import { parseKeywordInput } from './keyword-input'

/**
 * THE BOX WHERE A KEYWORD MAY CONTAIN A SPACE.
 *
 * The hashtag box split on whitespace, which was correct for hashtags: a hashtag
 * cannot contain a space, so `#chai pune` IS two of them. A keyword can, and that
 * is the whole point of the brackets the founder asked for (REQUESTS §34).
 *
 * These pin the three ways a writer actually fills this box — typed as a list,
 * pasted back from what the box shows, and half-edited in between — plus the
 * ordering bug the first draft of the parser had.
 */

describe('parseKeywordInput', () => {
  test('splits a typed list on commas, NOT on spaces', () => {
    // The defining difference. Whitespace splitting would give five tokens here.
    expect(parseKeywordInput('chai in pune, monsoon specials')).toEqual([
      'chai in pune',
      'monsoon specials',
    ])
  })

  test('reads back what the box shows, so a round-trip is lossless', () => {
    expect(parseKeywordInput('[chai] [pune]')).toEqual(['chai', 'pune'])
  })

  test('a comma INSIDE brackets belongs to the keyword', () => {
    // Brackets are read whole and before the comma split, which is the only
    // reason this works. A naive split-then-unwrap turns it into two.
    expect(parseKeywordInput('[chai, hot], pune')).toEqual(['chai, hot', 'pune'])
  })

  test('KEEPS THE ORDER, mixing bracketed and plain', () => {
    // THE BUG THE FIRST DRAFT HAD. It collected every bracketed group and then
    // the plain text, so this came back as ['chai in pune', 'monsoon', 'samosa'].
    // `normalizeKeywords` preserves order on purpose — the writer chose it — and
    // a parser that scrambles it upstream makes that guarantee worthless.
    expect(parseKeywordInput('monsoon, [chai in pune], samosa')).toEqual([
      'monsoon',
      'chai in pune',
      'samosa',
    ])
  })

  test('handles newlines as separators, because people paste lists', () => {
    expect(parseKeywordInput('chai\npune\n\nmonsoon')).toEqual(['chai', 'pune', 'monsoon'])
  })

  test('drops empty brackets and stray separators rather than emitting blanks', () => {
    expect(parseKeywordInput('[], chai, , [  ]')).toEqual(['chai'])
  })

  test('an empty box is an empty list', () => {
    expect(parseKeywordInput('')).toEqual([])
    expect(parseKeywordInput('   ')).toEqual([])
  })

  test('leaves a legacy hash alone for the normaliser to strip', () => {
    // Deliberately NOT stripped here. `normalizeKeywords` in the Constraint
    // Engine owns the `#` strip, the wrap and the dedupe, and it is the same
    // function the character meter and the formatter call. Doing any of it twice
    // in two places is how the number on screen and the string that goes out
    // came to disagree once before.
    expect(parseKeywordInput('#chai, pune')).toEqual(['#chai', 'pune'])
  })
})
