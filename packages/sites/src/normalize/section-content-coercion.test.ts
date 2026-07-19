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
