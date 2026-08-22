import { describe, expect, test } from 'vitest'

import { bodyAfterFirstLine, displayTitleOf, firstLineOf } from '@/lib/posts/display-title'

/**
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * QA opened a real workspace and found five drafts all called "Untitled post",
 * two of them byte-identical on screen. `title` is never required at any write
 * site, so the list had nothing left to identify a row by. This is the rule that
 * gives a row back its name, and the three cases it has to keep apart:
 * the author named it, we derived it from the body, or there is genuinely
 * nothing — three different sentences, never collapsed into one.
 *
 * ── THE MUTATION ─────────────────────────────────────────────────────────────
 * Delete the `firstLineOf` branch from `displayTitleOf` and the derived-title
 * tests go red. Swap the code-point cut for a plain `.slice()` and the emoji
 * test goes red with a replacement character.
 */

describe('displayTitleOf', () => {
  test('uses the title the author gave, trimmed', () => {
    // Arrange · Act
    const result = displayTitleOf({ title: '  Monsoon menu  ', body: 'Hot filter coffee is back.' })

    // Assert
    expect(result).toEqual({ text: 'Monsoon menu', source: 'given' })
  })

  test('falls back to the FIRST line of the body when there is no title', () => {
    // Arrange
    const body = 'Fresh chai every morning.\nFrom the new counter by the window.'

    // Act
    const result = displayTitleOf({ title: null, body })

    // Assert — the first line only. The second line is the excerpt's job.
    expect(result).toEqual({ text: 'Fresh chai every morning.', source: 'derived' })
  })

  test('treats a whitespace-only title as no title at all', () => {
    // Arrange · Act
    const result = displayTitleOf({ title: '   ', body: 'Fresh chai every morning.' })

    // Assert
    expect(result.source).toBe('derived')
    expect(result.text).toBe('Fresh chai every morning.')
  })

  test('says "none" — and only then — when the row has neither title nor body', () => {
    // Arrange · Act
    const result = displayTitleOf({ title: null, body: null })

    // Assert — the placeholder is the honest answer here, and nowhere else.
    expect(result).toEqual({ text: 'Untitled post', source: 'none' })
  })

  test('says "none" for a body that is only whitespace', () => {
    // Arrange · Act
    const result = displayTitleOf({ title: null, body: '\n  \n\t\n' })

    // Assert
    expect(result.source).toBe('none')
  })
})

describe('firstLineOf', () => {
  test('skips leading blank lines to the first line with words on it', () => {
    // Arrange
    const body = '\n\n   \nFresh chai every morning.\nSecond line.'

    // Act · Assert
    expect(firstLineOf(body)).toBe('Fresh chai every morning.')
  })

  test('returns null for a body with nothing in it', () => {
    expect(firstLineOf(null)).toBeNull()
    expect(firstLineOf('   \n  ')).toBeNull()
  })

  test('cuts a long line by CODE POINT, so an emoji on the boundary survives', () => {
    // Arrange — 59 plain chars then an emoji, so the emoji IS code point 60 and
    // straddles UTF-16 unit 60. A `.slice(0, 60)` would cut it between its
    // surrogates and render a replacement character.
    const line = `${'a'.repeat(59)}\u{1F327}${'b'.repeat(20)}`

    // Act
    const result = firstLineOf(line)

    // Assert
    expect(result).not.toBeNull()
    expect(result).toContain('\u{1F327}')
    expect(result).not.toContain('�')
    expect(result?.endsWith('…')).toBe(true)
    // 60 kept code points plus the ellipsis.
    expect(Array.from(result ?? '')).toHaveLength(61)
  })

  test('leaves a line at or under the cap exactly as written', () => {
    // Arrange
    const line = 'Fresh chai every morning at the new counter.'

    // Act · Assert
    expect(firstLineOf(line)).toBe(line)
  })
})

describe('bodyAfterFirstLine', () => {
  test('returns the empty string — NOT null — for a one-line body', () => {
    // The distinction is the whole point: `''` means "the body is entirely in
    // the heading", `null` means "there is no body". A caller that collapses
    // them prints "No content written yet." over a post that has content.
    expect(bodyAfterFirstLine('Fresh chai every morning at the new counter.')).toBe('')
  })

  test('returns everything after the promoted line', () => {
    // Arrange
    const body = 'Fresh chai every morning.\nFrom the new counter.\nOpens at six.'

    // Act · Assert
    expect(bodyAfterFirstLine(body)).toBe('From the new counter.\nOpens at six.')
  })

  test('drops the leading blanks along with the line it promoted', () => {
    expect(bodyAfterFirstLine('\n\nFresh chai.\nSecond.')).toBe('Second.')
  })

  test('returns null when there was no line to promote', () => {
    expect(bodyAfterFirstLine(null)).toBeNull()
    expect(bodyAfterFirstLine('   \n ')).toBeNull()
  })
})
