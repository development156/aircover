import { describe, it, expect } from 'vitest'

import { splitIntoThread, describeThread, countCodePoints, threadLimitFor } from './thread-split'

describe('splitIntoThread', () => {
  it('leaves a body that already fits as one segment', () => {
    expect(splitIntoThread('short enough', 280)).toEqual(['short enough'])
  })

  it('returns nothing for empty or whitespace-only input', () => {
    // NOT [''] — Zernio refuses a segment with empty content by name
    // (MEASURED, docs/32 §4.1), so emitting one would build a known-invalid payload.
    expect(splitIntoThread('', 280)).toEqual([])
    expect(splitIntoThread('   \n\n  ', 280)).toEqual([])
  })

  it('every segment is within the limit, for every limit', () => {
    const body = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} about chai.`).join(' ')
    for (const limit of [20, 40, 80, 140, 280]) {
      const segments = splitIntoThread(body, limit)
      expect(segments.length).toBeGreaterThan(1)
      for (const s of segments) expect(countCodePoints(s)).toBeLessThanOrEqual(limit)
    }
  })

  /**
   * ── THE PROPERTY THE WHOLE THREAD DESIGN RESTS ON ──────────────────────────
   * docs/31 §6.2 refused to ship threads because "the refusal gate reads one body"
   * and a red line in segment three would publish unread. That is only true if a
   * segment can contain words the body does not. It cannot: a segment is a slice
   * of the body with whitespace trimmed.
   *
   * So this asserts the covering property directly — every non-whitespace
   * character of the body survives into the segments, in order. If this ever goes
   * red, the gate's guarantee is void and threads must stop being offered.
   */
  it('the segments together contain every non-whitespace character of the body, in order', () => {
    const bodies = [
      'One sentence. Another sentence! A third? Yes — and a fourth.',
      'Line one\nline two\n\nparagraph two continues here with more words to force a split',
      'नमस्ते और स्वागत है। यह एक लंबा वाक्य है जिसे कई भागों में बाँटा जाएगा।',
      'emoji 👍🏽 and a family 👨‍👩‍👧‍👦 and more text after them to push past the limit',
      'supercalifragilisticexpialidocious'.repeat(20),
    ]
    for (const body of bodies) {
      for (const limit of [12, 25, 60, 140]) {
        const joined = splitIntoThread(body, limit).join('')
        const strip = (s: string) => Array.from(s).filter((c) => !/\s/.test(c)).join('')
        expect(strip(joined)).toBe(strip(body))
      }
    }
  })

  it('prefers a paragraph break over a sentence break over a word break', () => {
    const body = 'Alpha beta. Gamma delta.\n\nEpsilon zeta theta iota kappa lambda mu nu.'
    // Wide enough to reach past the blank line, so the blank line must win.
    const [first] = splitIntoThread(body, 40)
    expect(first).toBe('Alpha beta. Gamma delta.')
  })

  it('ends a segment ON a sentence boundary, keeping the punctuation', () => {
    const body = 'First thing here. Second thing here. Third thing here.'
    const segments = splitIntoThread(body, 36)
    // It packs as much as fits — two sentences in 36 characters, not one — and the
    // full stop stays on the segment that ends with it. Dropping that full stop is
    // the defect this file found in the first draft of the splitter.
    expect(segments[0]).toBe('First thing here. Second thing here.')
    expect(segments[1]).toBe('Third thing here.')
  })

  it('never splits a word when a space is available', () => {
    const words = 'alpha bravo charlie delta echo foxtrot golf'
    const segments = splitIntoThread(words, 20)
    expect(segments.length).toBeGreaterThan(1)
    // No segment starts or ends mid-word: rejoining with single spaces reproduces
    // the original word sequence exactly.
    expect(segments.join(' ').split(/\s+/)).toEqual(words.split(' '))
  })

  it('hard-cuts a single unbreakable token rather than looping or losing it', () => {
    const token = 'z'.repeat(700)
    const segments = splitIntoThread(token, 280)
    expect(segments).toHaveLength(3)
    expect(segments.join('')).toBe(token)
    for (const s of segments) expect(countCodePoints(s)).toBeLessThanOrEqual(280)
  })

  /**
   * A string slice at a code-point index lands mid-surrogate-pair and emits a lone
   * surrogate — a segment that ends in U+FFFD on the platform. The splitter indexes
   * the code-point ARRAY for exactly this reason, and this is the case that tells
   * the two apart: 200 astral characters is 400 UTF-16 units.
   */
  it('hard-cuts astral characters without producing a lone surrogate', () => {
    const segments = splitIntoThread('😀'.repeat(200), 50)
    for (const s of segments) {
      expect(countCodePoints(s)).toBeLessThanOrEqual(50)
      expect(s).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/)
    }
    expect(segments.join('')).toBe('😀'.repeat(200))
  })

  it('terminates on a limit of 1', () => {
    expect(splitIntoThread('abc', 1)).toEqual(['a', 'b', 'c'])
  })

  it('returns nothing rather than looping on a limit below 1', () => {
    expect(splitIntoThread('anything', 0)).toEqual([])
  })
})

describe('threadLimitFor', () => {
  it('pays the channel link weight out of every segment', () => {
    expect(threadLimitFor(280, false, 23)).toBe(280)
    expect(threadLimitFor(280, true, 23)).toBe(257)
  })
})

describe('describeThread', () => {
  it('numbers segments from 1 and reports each one’s length', () => {
    const described = describeThread('alpha bravo charlie delta echo', 12)
    expect(described.map((s) => s.index)).toEqual([1, 2, 3])
    for (const s of described) {
      expect(s.chars).toBe(countCodePoints(s.text))
      expect(s.overLimit).toBe(false)
    }
  })
})
