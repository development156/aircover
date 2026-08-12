import { readFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

import { gateText, measureText, MAX_PDF_BYTES, MIN_WORDS, pdfText } from './pdf-text'

function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(`src/lib/onboarding/fixtures/${name}`))
}

/** N distinct prose-like tokens — enough to clear the volume floor. */
function words(count: number): string {
  return Array.from({ length: count }, (_, index) => `alpha${index}`).join(' ')
}

describe('pdfText - the ordinary case', () => {
  // Ground truth for these assertions came from `pdftotext`, not from this
  // module. See fixtures/README.md.
  it('reads prose out of a Ghostscript-produced PDF', () => {
    const result = pdfText(fixture('bakery-one-pager.pdf'))

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.text).toContain('Rolling Pin Bakehouse')
    expect(result.text).toContain('A neighbourhood bakery in Pune, open since 2014.')
    expect(result.text).toContain('We do not use palm oil, and we do not use improvers')
    expect(result.words).toBeGreaterThan(100)
  })

  it('yields text good enough to classify from', async () => {
    // The whole reason the PDF door exists: what comes out has to be able to
    // drive screen 1's picks. Extraction that "works" but yields text no
    // classifier can read is not working.
    const { classify } = await import('./classify')
    const result = pdfText(fixture('bakery-one-pager.pdf'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(classify(result.text).intake).toMatchObject({
      model: 'local_presence',
      regime: 'food',
      locale: 'IN',
    })
  })
})

describe('pdfText - the refusals', () => {
  // The case the gate exists for. This file renders IDENTICALLY to the one
  // above for a human, its streams are Flate-compressed just the same, and it
  // contains no text whatsoever. A parser that stops at "did it inflate?"
  // hands back scraped image bytes as if they were the company's own words.
  it('refuses an image-only PDF instead of guessing at it', () => {
    const result = pdfText(fixture('scanned-no-text.pdf'))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/scanned or image-only/)
  })

  it('refuses a file that is not a PDF', () => {
    const result = pdfText(new TextEncoder().encode('PK this is a zip'))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/not a PDF/)
  })

  it('refuses an empty file', () => {
    expect(pdfText(new Uint8Array()).ok).toBe(false)
  })

  it('refuses an oversized file without parsing it', () => {
    const oversized = new Uint8Array(MAX_PDF_BYTES + 1)
    oversized.set(new TextEncoder().encode('%PDF-1.7'))
    const result = pdfText(oversized)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/8MB/)
  })

  it('names encryption rather than blaming the fonts', () => {
    const encrypted = new TextEncoder().encode('%PDF-1.7\n/Encrypt 5 0 R\ntrailer')
    const result = pdfText(encrypted)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/password-protected/)
  })

  it('survives a stream that claims Flate and is not', () => {
    const broken = `%PDF-1.7\n<</Filter/FlateDecode>>stream\n${' '.repeat(64)}\nendstream`

    expect(() => pdfText(new TextEncoder().encode(broken))).not.toThrow()
    expect(pdfText(new TextEncoder().encode(broken)).ok).toBe(false)
  })
})

describe('gateText', () => {
  it('passes real prose', () => {
    expect(gateText(words(60), 'PDF').ok).toBe(true)
  })

  it('refuses text too short to resolve a brand from', () => {
    const result = gateText('a bakery in Pune', 'PDF')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/scanned or image-only/)
  })

  it('blames the fonts, not a scanner, for glyph soup', () => {
    // What a CID-keyed font yields: plenty of tokens, none of them language.
    // Built from private-use codepoints via fromCharCode rather than pasted,
    // so this source file stays plain ASCII.
    const soup = Array.from({ length: 200 }, (_, index) =>
      String.fromCharCode(0xe000 + (index % 90), 0xe100 + (index % 90)),
    ).join(' ')
    const result = gateText(soup, 'PDF')

    expect(result.ok).toBe(false)
    if (result.ok) return
    // Reporting this as "scanned or image-only" would send someone off to
    // re-scan a document that was never scanned. Checking word COUNT before
    // word QUALITY did exactly that, because glyph soup has zero real words.
    expect(result.reason).toMatch(/symbols rather than words/)
  })

  it('still calls an empty extraction empty', () => {
    const result = gateText('', 'PDF')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/scanned or image-only/)
  })

  it('names the source it was given', () => {
    const result = gateText('too short', 'page')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('page')
  })

  it('is exactly at the boundary it documents', () => {
    expect(gateText(words(MIN_WORDS), 'PDF').ok).toBe(true)
    expect(gateText(words(MIN_WORDS - 1), 'PDF').ok).toBe(false)
  })
})

describe('measureText', () => {
  it('is zero on empty input rather than NaN', () => {
    expect(measureText('')).toEqual({ tokens: 0, words: 0, wordlikeRatio: 0, legibleRatio: 0 })
  })

  it('does not count a very long token as a word', () => {
    expect(measureText('a'.repeat(40)).words).toBe(0)
  })
})

describe('literal and hex strings', () => {
  /** Wrap a content stream in the smallest PDF that reaches the extractor. */
  function pdfWith(content: string): Uint8Array {
    const body = deflateSync(Buffer.from(content, 'latin1'))
    const head = Buffer.from('%PDF-1.7\n<</Filter/FlateDecode>>stream\n', 'latin1')
    const tail = Buffer.from('\nendstream\n%%EOF', 'latin1')
    return new Uint8Array(Buffer.concat([head, body, tail]))
  }

  // A hand-built stream on purpose: these escapes are exactly the ones the
  // Ghostscript fixture happens NOT to contain, so they would go untested.
  it('decodes escapes, nesting and octal in literal strings', () => {
    const result = pdfText(pdfWith(`(${words(MIN_WORDS)} \\(aside\\) caf\\351 (inner) done) Tj`))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.text).toContain('(aside)')
    expect(result.text).toContain(`caf${String.fromCharCode(0xe9)}`)
    expect(result.text).toContain('(inner)')
  })

  it('decodes hex strings', () => {
    const hex = Buffer.from(' sourdough', 'latin1').toString('hex')
    const result = pdfText(pdfWith(`(${words(MIN_WORDS)}) Tj <${hex}> Tj`))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.text).toContain('sourdough')
  })

  it('reads a wide negative kern in a TJ array as a word gap', () => {
    const result = pdfText(pdfWith(`(${words(MIN_WORDS)}) Tj [(sour) -400 (dough)] TJ`))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.text).toContain('sour dough')
  })

  it('does not treat a narrow kern as a word gap', () => {
    const result = pdfText(pdfWith(`(${words(MIN_WORDS)}) Tj [(sour) -20 (dough)] TJ`))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.text).toContain('sourdough')
  })
})
