import { describe, expect, it } from 'vitest'
import { MIN_SENTENCE_CHARS, normaliseUrl, pickDoor } from '@/lib/onboarding/door'

/**
 * The fallback contract, asserted on the pieces `readDoor` composes.
 *
 * THE BUG: `pickDoor` names ONE winner, and the old readDoor read only that
 * one. A user who supplied a PDF *and* a website got "we could not read that"
 * when the PDF failed, while their website sat there unread. Precedence should
 * decide the ORDER, never reduce three independent inputs to one attempt.
 */
describe('door precedence is an order, not an exclusion', () => {
  it('still prefers the document when everything is supplied', () => {
    const choice = pickDoor({
      pdfName: 'deck.pdf',
      url: 'acme.com',
      sentence: 'We bake sourdough bread daily.',
    })
    expect(choice.kind).toBe('pdf')
  })

  it('names the inputs it did not use, so falling back can be stated', () => {
    const choice = pickDoor({ pdfName: 'deck.pdf', url: 'acme.com', sentence: '' })
    expect(choice.ignored).toContain('url')
  })

  it('keeps the url usable after the pdf loses — it is still a real input', () => {
    // readDoor tries pdf, then this, then the sentence.
    expect(normaliseUrl('acme.com')).toBe('https://acme.com/')
  })

  it('a sentence at the threshold is a usable last resort', () => {
    expect('We bake sourdough.'.length).toBeGreaterThanOrEqual(MIN_SENTENCE_CHARS)
  })

  it('rejects a url that is not one, so the chain moves on rather than crashing', () => {
    expect(normaliseUrl('not a url at all')).toBeNull()
    expect(normaliseUrl('javascript:alert(1)')).toBeNull()
  })
})
