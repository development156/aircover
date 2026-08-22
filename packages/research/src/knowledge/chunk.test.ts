import { describe, expect, it } from 'vitest'

import {
  CHUNK_MAX_CHARS,
  CHUNK_TARGET_CHARS,
  MAX_CHUNKS_PER_DOCUMENT,
  chunkDocumentText,
  chunkForIngestion,
  normaliseDocumentText,
} from './chunk'

describe('normalising a parser’s output', () => {
  it('removes only what a parser added, never a word', () => {
    const raw = 'Masala dosa — ₹90.  \r\n\r\n\r\n   Idli — ₹40.   \n'
    expect(normaliseDocumentText(raw)).toBe('Masala dosa — ₹90.\n\nIdli — ₹40.')
  })

  it('strips a soft hyphen, which is invisible and breaks the word it splits', () => {
    // A PDF line-break hyphen: the word reads "vegetarian" and searches as
    // "vege" + "tarian" unless this is removed.
    expect(normaliseDocumentText('vege­tarian')).toBe('vegetarian')
  })

  it('leaves numbers, punctuation and case exactly as written', () => {
    const price = 'Thali: Rs. 249/- (incl. GST). Open 07:00–23:00.'
    expect(normaliseDocumentText(price)).toBe(price)
  })
})

describe('cutting a document into passages', () => {
  it('keeps a paragraph whole rather than cutting on a character count', () => {
    const a = 'The kitchen opens at seven in the morning, every day of the week.'
    const b = 'Delivery is free within three kilometres and costs forty rupees beyond it.'
    expect(chunkDocumentText(`${a}\n\n${b}`)).toEqual([`${a}\n\n${b}`])
  })

  it('starts a new passage rather than exceeding the target', () => {
    const para = `${'word '.repeat(150).trim()}.` // ~750 chars
    const chunks = chunkDocumentText([para, para, para].join('\n\n'))
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS)
  })

  it('divides a paragraph too long to keep, at sentence ends', () => {
    const sentence = `${'a'.repeat(200)}. `
    const chunks = chunkDocumentText(sentence.repeat(20))
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS)
    // Nothing lost: every 'a' that went in comes back out.
    expect(chunks.join('').replace(/[^a]/g, '').length).toBe(200 * 20)
  })

  it('cuts a price table that has no sentence punctuation at all', () => {
    // The shape a menu actually has, and the one a sentence splitter cannot help
    // with. It must still be bounded rather than stored as one enormous row.
    const table = Array.from({ length: 400 }, (_, i) => `Dish ${i} 120`).join(' | ')
    const chunks = chunkDocumentText(table)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS)
  })

  it('returns nothing for a document that is only whitespace', () => {
    // The same question `index_knowledge_document` asks, and for the same reason:
    // a passage of pure whitespace is a search hit containing nothing.
    expect(chunkDocumentText('   \n\n\t\r\n  ')).toEqual([])
  })

  /**
   * MERGED, NOT SPLIT, AND THAT IS THE DESIGN.
   *
   * The first version of this test asserted `['One.', 'Two.']` — two paragraphs,
   * two passages — which is the opposite of what the chunker is for. A menu of
   * two hundred single-line dishes must not become two hundred rows: each would
   * be too small to mean anything on its own, and a citation to "Idli 40" tells
   * an owner nothing about which section of which document it came from.
   *
   * The property worth asserting is not the split point. It is that no passage
   * is blank and none carries whitespace at its edges — the same question
   * `index_knowledge_document` asks before it stores one.
   */
  it('merges short paragraphs, and never returns a blank or untrimmed passage', () => {
    const chunks = chunkDocumentText('One.\n\n\n\n   \n\nTwo.\n\n\n')
    expect(chunks).toEqual(['One.\n\nTwo.'])
    for (const chunk of chunks) {
      expect(chunk).toMatch(/[^\s]/)
      expect(chunk).toBe(chunk.trim())
    }
  })

  it('keeps the passages in the order the document has them', () => {
    const chunks = chunkDocumentText(
      Array.from(
        { length: 12 },
        (_, i) => `${'x'.repeat(CHUNK_TARGET_CHARS - 20)} marker${i}`,
      ).join('\n\n'),
    )
    const markers = chunks.flatMap((c) => c.match(/marker\d+/g) ?? [])
    expect(markers).toEqual(Array.from({ length: 12 }, (_, i) => `marker${i}`))
  })
})

describe('the ingestion decision', () => {
  it('refuses an empty document with no_text rather than storing nothing', () => {
    expect(chunkForIngestion('\n\n  \n')).toEqual({ ok: false, code: 'no_text', chunks: 0 })
  })

  /**
   * A SILENT TRUNCATION IS THE THING THIS AVOIDS.
   *
   * `index_knowledge_document` writes every passage in one transaction, which is
   * what makes a half-written index impossible. Storing the first N and dropping
   * the rest would keep that guarantee and break a larger one — the library
   * would claim to hold a document it holds half of. So an oversized document is
   * REFUSED, with a code the screen has a sentence for.
   */
  it('refuses an oversized document instead of storing the first part of it', () => {
    const huge = Array.from(
      { length: MAX_CHUNKS_PER_DOCUMENT + 50 },
      (_, i) => `${'y'.repeat(CHUNK_TARGET_CHARS)} p${i}`,
    ).join('\n\n')
    const result = chunkForIngestion(huge)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.code).toBe('too_large')
    // The count is reported so the sentence on screen can name the size rather
    // than saying "too big" and leaving the owner to guess by how much.
    expect(result.chunks).toBeGreaterThan(MAX_CHUNKS_PER_DOCUMENT)
  })

  it('accepts an ordinary document and hands back every passage', () => {
    const result = chunkForIngestion('Masala dosa is ₹90.\n\nWe open at 7am on Sunday.')
    // ONE passage, because both paragraphs fit inside the target together. See
    // the note on merging above.
    expect(result).toEqual({
      ok: true,
      chunks: ['Masala dosa is ₹90.\n\nWe open at 7am on Sunday.'],
    })
  })
})
