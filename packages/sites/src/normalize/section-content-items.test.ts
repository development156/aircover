import { describe, it, expect } from 'vitest'
import { normalizeSection } from './section-content'

const SORT = 0

describe('normalizeSection — items arriving in the wrong shape', () => {
  it('turns a bare string of features into a one-item list rather than dropping it', () => {
    const result = normalizeSection('features', { items: 'Fast setup' }, SORT)

    expect(result?.section.section).toEqual({
      kind: 'features',
      content: { items: [{ title: 'Fast setup' }] },
    })
    expect(result?.dropped).toEqual([])
  })

  it('turns a bare string of testimonials into a one-item list', () => {
    const result = normalizeSection('testimonials', { items: 'Loved it' }, SORT)

    expect(result?.section.section).toEqual({
      kind: 'testimonials',
      content: { items: [{ quote: 'Loved it' }] },
    })
  })

  it('reads an array of plain strings as feature titles', () => {
    const result = normalizeSection('features', { items: ['Fast', 'Themed'] }, SORT)

    expect(result?.section.section).toEqual({
      kind: 'features',
      content: { items: [{ title: 'Fast' }, { title: 'Themed' }] },
    })
  })

  it('reads an array of plain strings as testimonial quotes', () => {
    const result = normalizeSection('testimonials', { items: ['Loved it', 'Superb'] }, SORT)

    expect(result?.section.section).toEqual({
      kind: 'testimonials',
      content: { items: [{ quote: 'Loved it' }, { quote: 'Superb' }] },
    })
  })

  it('drops every faq entry that is a string, because an answer cannot be invented', () => {
    const result = normalizeSection(
      'faq',
      { items: [{ q: 'Real?', a: 'Yes.' }, 'Dangling question'] },
      SORT,
    )

    expect(result?.section.section).toEqual({
      kind: 'faq',
      content: { items: [{ q: 'Real?', a: 'Yes.' }] },
    })
    expect(result?.dropped).toEqual(['items[1]'])
  })

  it('drops junk feature entries by index and keeps the usable ones', () => {
    const result = normalizeSection(
      'features',
      { headline: 'Why us', items: [{ title: 'Keep' }, null, { body: 'no title' }, 42, true] },
      SORT,
    )

    expect(result?.section.section).toEqual({
      kind: 'features',
      content: { headline: 'Why us', items: [{ title: 'Keep' }, { title: '42' }] },
    })
    expect(result?.dropped).toEqual(['items[1]', 'items[2]', 'items[4]'])
  })

  it('drops the whole section when items is a type no list can be made from', () => {
    // The old name promised `dropped: ['items']`, which no caller could ever observe: a
    // section with no items returns null and takes its `dropped` array with it. The unit
    // of loss here is the section, and the draft normalizer is what reports it.
    const result = normalizeSection('features', { headline: 'Why us', items: true }, SORT)

    expect(result).toBeNull()
  })

  // The cap now lives in section-content-caps.test.ts, which pins its value as well as its
  // role: the fixtures here derived their size from MAX_ITEMS, so the constant could be
  // changed to 2 or 2000 without a single assertion noticing.

  it('turns a bare number of features into a one-item list rather than dropping the section', () => {
    const result = normalizeSection('features', { items: 42 }, SORT)

    expect(result?.section.section).toEqual({
      kind: 'features',
      content: { items: [{ title: '42' }] },
    })
    expect(result?.dropped).toEqual([])
  })

  it('turns a bare bigint of features into a one-item list', () => {
    const result = normalizeSection('features', { items: 42n }, SORT)

    expect(result?.section.section).toEqual({
      kind: 'features',
      content: { items: [{ title: '42' }] },
    })
  })

  it('turns a lone item object into a one-item list, because a list of one is easy to mistype', () => {
    const result = normalizeSection('features', { items: { title: 'A', body: 'B' } }, SORT)

    expect(result?.section.section).toEqual({
      kind: 'features',
      content: { items: [{ title: 'A', body: 'B' }] },
    })
    expect(result?.dropped).toEqual([])
  })

  it('turns a lone testimonial object into a one-item list', () => {
    const result = normalizeSection('testimonials', { items: { quote: 'Great' } }, SORT)

    expect(result?.section.section).toEqual({
      kind: 'testimonials',
      content: { items: [{ quote: 'Great' }] },
    })
  })

  it('turns a lone faq object into a one-item list', () => {
    const result = normalizeSection('faq', { items: { q: 'A?', a: 'B.' } }, SORT)

    expect(result?.section.section).toEqual({
      kind: 'faq',
      content: { items: [{ q: 'A?', a: 'B.' }] },
    })
  })
})
