/**
 * The `mailto:`/`tel:` whitespace carve-out, pinned on BOTH axes at once.
 *
 * `escape.ts` states the relaxed class is "the same forbidden set as URL_FORBIDDEN, minus the
 * bare space (U+0020) -- every other C0 control (tab, newline, CR, ...), every C1 control, NBSP
 * and the full invisible-character set stay forbidden".
 *
 * The existing suite tests each half of that sentence separately and never together: the
 * control and invisible characters are exercised only against `https://`, which takes the
 * STRICT regex and so says nothing about the relaxed one, while `mailto:`/`tel:` are exercised
 * only with a bare space. Narrowing the relaxed class's C0 range left the whole suite green,
 * and under that mutation a `tel:` link carrying a newline was returned as valid.
 *
 * A newline inside a `tel:`/`mailto:` value is not inert -- it is the classic URI/header
 * injection primitive -- and this is the one path in the package that deliberately relaxes the
 * whitespace rule, so its exact boundary is the thing worth pinning.
 *
 * This file is pure ASCII on disk: every character under test is written as a `\uXXXX` escape
 * sequence, never as a raw byte. See the source-is-text pin in `escape.test.ts`.
 */
import { describe, it, expect } from 'vitest'
import { safeUrl } from './escape'

interface ForbiddenChar {
  name: string
  char: string
}

/**
 * Every character the relaxed class still forbids. The two entries marked "edge" pin the C0
 * range boundaries themselves, which is exactly what a widening mutation moves.
 */
const STILL_FORBIDDEN: ReadonlyArray<ForbiddenChar> = [
  { name: 'a null byte (low edge of the C0 range)', char: '\u0000' },
  { name: 'a tab', char: '\u0009' },
  { name: 'a newline', char: '\u000A' },
  { name: 'a carriage return', char: '\u000D' },
  { name: 'a unit separator (high edge of the C0 range)', char: '\u001F' },
  { name: 'a delete character', char: '\u007F' },
  { name: 'a C1 next-line control', char: '\u0085' },
  { name: 'a non-breaking space', char: '\u00A0' },
  { name: 'a zero-width space', char: '\u200B' },
  { name: 'a zero-width non-joiner', char: '\u200C' },
  { name: 'a zero-width joiner', char: '\u200D' },
  { name: 'a right-to-left override', char: '\u202E' },
  { name: 'a byte-order mark', char: '\uFEFF' },
  { name: 'a lone surrogate', char: '\uD800' },
  { name: 'a unicode tag character', char: '\u{E0041}' },
]

interface RelaxedScheme {
  name: string
  /** The character under test is placed BETWEEN these, so `trim()` can never remove it. */
  before: string
  after: string
}

/**
 * Both relaxed schemes, and both in a non-lowercase spelling: the branch is selected on
 * `scheme.toLowerCase()`, so a case-sensitive check would be a live bypass on the relaxed side.
 */
const RELAXED_SCHEMES: ReadonlyArray<RelaxedScheme> = [
  { name: 'tel:', before: 'tel:+91', after: '98765' },
  { name: 'mailto:', before: 'mailto:hi@sahoda.com?subject=Hello', after: 'there' },
  { name: 'TEL: (uppercase)', before: 'TEL:+91', after: '98765' },
  { name: 'MailTo: (mixed case)', before: 'MailTo:hi@sahoda.com?subject=Hello', after: 'there' },
]

describe('safeUrl - the mailto:/tel: carve-out admits the bare space and nothing else', () => {
  for (const scheme of RELAXED_SCHEMES) {
    for (const forbidden of STILL_FORBIDDEN) {
      it(`rejects ${scheme.name} carrying ${forbidden.name}`, () => {
        expect(safeUrl(`${scheme.before}${forbidden.char}${scheme.after}`)).toBeNull()
      })
    }
  }
})

/*
 * Positive controls. Without them the block above would still pass if the carve-out were
 * deleted outright, and "rejects everything" is not the contract: Indian phone formatting and
 * multi-word mail subjects are the whole reason the relaxed class exists.
 */
describe('safeUrl - the carve-out itself still works', () => {
  for (const scheme of RELAXED_SCHEMES) {
    it(`still accepts a bare space inside ${scheme.name}`, () => {
      const url = `${scheme.before} ${scheme.after}`

      expect(safeUrl(url)).toBe(url)
    })
  }

  /*
   * The two must not interact: an accepted space earlier in the string cannot license a
   * forbidden character later in it. The gate is one `.test()` over the whole URL, so these
   * pin against anyone rewriting it as a per-segment or stop-at-first-match scan.
   */
  it('rejects a tel: url that mixes a legitimate space with a newline', () => {
    expect(safeUrl('tel:+91 98765\u000A43210')).toBeNull()
  })

  it('rejects a mailto: url that mixes a legitimate space with a tab', () => {
    expect(safeUrl('mailto:hi@sahoda.com?subject=Hello there\u0009now')).toBeNull()
  })
})
