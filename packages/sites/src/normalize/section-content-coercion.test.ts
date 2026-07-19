import { describe, it, expect } from 'vitest'
import { normalizeSection } from './section-content'

const SORT = 0

describe('normalizeSection — junk values and coercion', () => {
  it('drops a deeply nested object where a string belongs and names both keys', () => {
    const result = normalizeSection(
      'hero',
      { headline: 'Real', subhead: { deep: { deeper: ['x'] } }, cta: { nested: true } },
      SORT,
    )

    expect(result?.section.section).toEqual({ kind: 'hero', content: { headline: 'Real' } })
    expect(result?.dropped).toEqual(['cta', 'subhead'])
  })

  it('coerces a number into the string a price note is meant to be', () => {
    const result = normalizeSection('offer', { headline: 'Launch plan', priceNote: 1499 }, SORT)

    expect(result?.section.section).toEqual({
      kind: 'offer',
      content: { headline: 'Launch plan', priceNote: '1499' },
    })
    expect(result?.dropped).toEqual([])
  })

  it('treats an empty-string headline as absent on a section that does not require one', () => {
    const result = normalizeSection('features', { headline: '   ', items: [{ title: 'A' }] }, SORT)

    expect(result?.section.section).toEqual({
      kind: 'features',
      content: { items: [{ title: 'A' }] },
    })
    expect(result?.dropped).toEqual(['headline'])
  })

  it('strips control characters out of copy before it can reach the renderer', () => {
    const result = normalizeSection('hero', { headline: 'Clean\u0000copy' }, SORT)

    expect(result?.section.section).toEqual({ kind: 'hero', content: { headline: 'Cleancopy' } })
  })

  it('refuses a non-finite number, because NaN would render the literal word on a live page', () => {
    const result = normalizeSection('hero', { headline: 'Real', subhead: Number.NaN }, SORT)

    expect(result?.section.section).toEqual({ kind: 'hero', content: { headline: 'Real' } })
    expect(result?.dropped).toEqual(['subhead'])
  })

  it('refuses Infinity in a price note for the same reason', () => {
    const result = normalizeSection(
      'offer',
      { headline: 'Launch plan', priceNote: Number.POSITIVE_INFINITY },
      SORT,
    )

    expect(result?.section.section).toEqual({ kind: 'offer', content: { headline: 'Launch plan' } })
    expect(result?.dropped).toEqual(['priceNote'])
  })

  it('coerces a bigint, which is what a large price arrives as from a json parser', () => {
    const result = normalizeSection('offer', { headline: 'Launch plan', priceNote: 1499n }, SORT)

    expect(result?.section.section).toEqual({
      kind: 'offer',
      content: { headline: 'Launch plan', priceNote: '1499' },
    })
    expect(result?.dropped).toEqual([])
  })

  it('names every unknown key in dropped so the caller can report what was discarded', () => {
    const result = normalizeSection(
      'hero',
      { headline: 'H', tagline: 'junk', bgImage: 'https://x.test/a.png', items: [] },
      SORT,
    )

    expect(result?.section.section).toEqual({ kind: 'hero', content: { headline: 'H' } })
    expect(result?.dropped).toEqual(['tagline', 'bgImage', 'items'])
  })
})

/**
 * The contract says unknown keys first, then known keys "in field order as declared". Every
 * other test produces at most ONE unusable known key, so the second half of that sentence was
 * unpinned: swapping two reads in the switch changed the output and nothing went red.
 */
describe('normalizeSection — declared field order of unusable known keys', () => {
  it('reports an unusable hero subhead before an unusable ctaHref, whatever order they arrived in', () => {
    const result = normalizeSection('hero', { headline: 'H', ctaHref: {}, subhead: {} }, SORT)

    expect(result?.dropped).toEqual(['subhead', 'ctaHref'])
  })

  it('reports every unusable hero key in declared order, not insertion order', () => {
    const result = normalizeSection(
      'hero',
      { ctaLabel: {}, ctaHref: {}, subhead: {}, headline: 'H' },
      SORT,
    )

    expect(result?.dropped).toEqual(['subhead', 'ctaLabel', 'ctaHref'])
  })

  it('reports every unusable offer key in declared order', () => {
    const result = normalizeSection(
      'offer',
      { ctaHref: {}, priceNote: {}, body: {}, headline: 'H' },
      SORT,
    )

    expect(result?.dropped).toEqual(['body', 'priceNote', 'ctaHref'])
  })

  it('reports every unusable contact key in declared order', () => {
    const result = normalizeSection('contact', { submitLabel: {}, headline: {}, body: {} }, SORT)

    expect(result?.dropped).toEqual(['headline', 'body', 'submitLabel'])
  })

  it('reports an unusable testimonial author before an unusable role', () => {
    const result = normalizeSection(
      'testimonials',
      { items: [{ role: {}, author: {}, quote: 'Q' }] },
      SORT,
    )

    expect(result?.dropped).toEqual(['items[0].author', 'items[0].role'])
  })
})
