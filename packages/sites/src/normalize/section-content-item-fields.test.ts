import { describe, it, expect } from 'vitest'
import { normalizeSection } from './section-content'

const SORT = 0

describe('normalizeSection — optional fields inside an item', () => {
  it('records a feature body that was present but unusable, instead of destroying it silently', () => {
    const result = normalizeSection(
      'features',
      { items: [{ title: 'Keep', body: { deep: 1 } }] },
      SORT,
    )

    expect(result?.section.section).toEqual({
      kind: 'features',
      content: { items: [{ title: 'Keep' }] },
    })
    expect(result?.dropped).toEqual(['items[0].body'])
  })

  it('records an unusable testimonial author and role on the item that carried them', () => {
    const result = normalizeSection(
      'testimonials',
      { items: [{ quote: 'Great', author: { deep: 1 }, role: [] }] },
      SORT,
    )

    expect(result?.section.section).toEqual({
      kind: 'testimonials',
      content: { items: [{ quote: 'Great' }] },
    })
    expect(result?.dropped).toEqual(['items[0].author', 'items[0].role'])
  })

  it('treats a blank optional item field as present-but-unusable, mirroring the top level', () => {
    const result = normalizeSection('features', { items: [{ title: 'Keep', body: '   ' }] }, SORT)

    expect(result?.dropped).toEqual(['items[0].body'])
  })

  it('says nothing about an optional item field that was simply absent', () => {
    const result = normalizeSection('features', { items: [{ title: 'Keep' }] }, SORT)

    expect(result?.dropped).toEqual([])
  })
})

describe('normalizeSection — unknown keys inside an item', () => {
  it('names every unknown key of a feature item so the caller can report the loss', () => {
    const result = normalizeSection(
      'features',
      { items: [{ title: 'A', icon: 'x', ctaHref: '/buy' }] },
      SORT,
    )

    expect(result?.section.section).toEqual({
      kind: 'features',
      content: { items: [{ title: 'A' }] },
    })
    expect(result?.dropped).toEqual(['items[0].icon', 'items[0].ctaHref'])
  })

  it('names unknown keys before unusable known keys, matching the top-level ordering', () => {
    const result = normalizeSection(
      'features',
      { items: [{ title: 'A', body: { deep: 1 }, icon: 'x' }] },
      SORT,
    )

    expect(result?.dropped).toEqual(['items[0].icon', 'items[0].body'])
  })

  it('names unknown keys on a testimonial item', () => {
    const result = normalizeSection(
      'testimonials',
      { items: [{ quote: 'Great', avatar: 'https://x.test/a.png' }] },
      SORT,
    )

    expect(result?.dropped).toEqual(['items[0].avatar'])
  })

  it('names unknown keys on a faq item', () => {
    const result = normalizeSection('faq', { items: [{ q: 'A?', a: 'B.', open: true }] }, SORT)

    expect(result?.dropped).toEqual(['items[0].open'])
  })

  it('reports a discarded item once by index and does not also enumerate its keys', () => {
    const result = normalizeSection(
      'features',
      { items: [{ title: 'Keep' }, { icon: 'x', body: 'no title' }] },
      SORT,
    )

    expect(result?.dropped).toEqual(['items[1]'])
  })

  it('carries the real index into item labels when an earlier entry was discarded', () => {
    const result = normalizeSection(
      'features',
      { items: [null, { title: 'Keep', icon: 'x' }] },
      SORT,
    )

    expect(result?.dropped).toEqual(['items[0]', 'items[1].icon'])
  })
})
