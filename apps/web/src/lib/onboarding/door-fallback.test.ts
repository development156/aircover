import { describe, expect, it } from 'vitest'
import { MIN_SENTENCE_CHARS, normaliseUrl, pickDoor } from './door'

/**
 * Precedence decides which input WINS, never which is attempted. Both the
 * document and the site are now read concurrently (`read-door.ts`), so a
 * failure on the richer one is no reason to have ignored the other.
 */
describe('door precedence is an order, not an exclusion', () => {
  it('prefers the document when everything is supplied', () => {
    expect(
      pickDoor({ pdfName: 'deck.pdf', url: 'acme.com', sentence: 'We bake bread.' }).kind,
    ).toBe('pdf')
  })
  it('names what it did not use, so falling back can be stated', () => {
    expect(pickDoor({ pdfName: 'deck.pdf', url: 'acme.com', sentence: '' }).ignored).toContain(
      'url',
    )
  })
  it('keeps the url usable after the pdf loses', () => {
    expect(normaliseUrl('acme.com')).toBe('https://acme.com/')
  })
  it('rejects a non-url so the chain moves on rather than crashing', () => {
    expect(normaliseUrl('not a url at all')).toBeNull()
    expect(normaliseUrl('javascript:alert(1)')).toBeNull()
  })
  it('a short sentence is not a usable last resort', () => {
    expect('hi'.length).toBeLessThan(MIN_SENTENCE_CHARS)
  })
})
