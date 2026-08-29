import { describe, expect, test } from 'vitest'

import { TITLE_MAX, copyTitle } from './copy-title'

/**
 * THE NAME A DUPLICATE GETS, AND THE LENGTH THAT WOULD MAKE IT UNSAVEABLE.
 *
 * The trap is that a title at the limit plus a suffix is over the limit, and
 * the server's refusal for that ("part of it was not readable") is about a
 * string the person never typed and cannot see. Every case below is checked
 * against `TITLE_MAX` rather than against the number 80, so moving the schema
 * moves the tests with it.
 */
describe('copyTitle', () => {
  test('a copy says it is one', () => {
    expect(copyTitle('Spring menu')).toBe('Spring menu (copy)')
  })

  test('a copy of a copy counts up rather than stacking suffixes', () => {
    expect(copyTitle('Spring menu (copy)')).toBe('Spring menu (copy 2)')
    expect(copyTitle('Spring menu (copy 2)')).toBe('Spring menu (copy 3)')
    expect(copyTitle('Spring menu (copy 9)')).toBe('Spring menu (copy 10)')
  })

  /**
   * THE ONE THAT MATTERS. A title exactly at the limit is reachable: the
   * editor's box holds 80 characters. Appending the suffix would produce 87,
   * which the schema refuses.
   */
  test('a title at the limit still produces a saveable name', () => {
    const atLimit = 'x'.repeat(TITLE_MAX)
    const copied = copyTitle(atLimit)
    expect(copied.length).toBeLessThanOrEqual(TITLE_MAX)
    expect(copied).toMatch(/\(copy\)$/)
  })

  test('no title of any length produces one over the limit', () => {
    for (const length of [1, 40, TITLE_MAX - 8, TITLE_MAX - 1, TITLE_MAX]) {
      const copied = copyTitle('x'.repeat(length))
      expect(copied.length, `length ${length}`).toBeLessThanOrEqual(TITLE_MAX)
    }
  })

  /**
   * The BASE is what gets shortened, never the suffix. A copy whose marker was
   * cut off is a card indistinguishable from its original, which is the whole
   * problem this function exists to solve.
   */
  test('the marker survives the shortening, because it is the point of the name', () => {
    expect(copyTitle('x'.repeat(TITLE_MAX))).toMatch(/\(copy\)$/)
    expect(copyTitle(`${'x'.repeat(TITLE_MAX - 8)} (copy)`)).toMatch(/\(copy 2\)$/)
  })

  /**
   * The cut is placed to land exactly ON a space: ' (copy)' is 7 characters, so
   * the base keeps 73, and a title whose 73rd character is a space would leave
   * "Spring menu  (copy)" with two spaces if the trim were dropped. An earlier
   * version of this test used a title whose cut happened to fall mid-word, so
   * it passed whether the trim was there or not.
   */
  test('shortening does not leave a space before the marker', () => {
    const room = TITLE_MAX - ' (copy)'.length
    const cutsOnASpace = `${'x'.repeat(room - 1)} ${'y'.repeat(10)}`
    expect(cutsOnASpace[room - 1]).toBe(' ')
    expect(copyTitle(cutsOnASpace)).not.toMatch(/ {2}/)
  })

  test('the original is never lengthened away from what it said', () => {
    expect(copyTitle('Spring menu')).toContain('Spring menu')
  })

  test('surrounding space is not carried into the copy', () => {
    expect(copyTitle('  Spring menu  ')).toBe('Spring menu (copy)')
  })

  /**
   * Not reachable from the editor, whose box refuses an empty name, but this is
   * a pure function and a title that is only " (copy)" tells nobody anything.
   */
  test('a name of nothing does not become a title that starts with a space', () => {
    expect(copyTitle('')).toBe('Copy')
    expect(copyTitle('   ')).toBe('Copy')
    expect(copyTitle('')).not.toMatch(/^\s/)
  })

  test('a title that merely mentions copy is not treated as one', () => {
    expect(copyTitle('How to copy a menu')).toBe('How to copy a menu (copy)')
    expect(copyTitle('(copy) Spring menu')).toBe('(copy) Spring menu (copy)')
  })

  test('the copy carries no em dash, which is the standing ruling for prose', () => {
    expect(copyTitle('Spring menu')).not.toMatch(/[—–]/)
  })
})
