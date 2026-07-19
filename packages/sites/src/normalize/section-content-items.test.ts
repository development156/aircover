import { describe, it, expect } from 'vitest'
import { normalizeSection, MAX_ITEMS } from './section-content'

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

  it('records the whole items key when the value is a type no list can be made from', () => {
    const result = normalizeSection('features', { headline: 'Why us', items: true }, SORT)

    expect(result).toBeNull()
  })

  it(`caps a list at MAX_ITEMS (${MAX_ITEMS}) so one bad generation cannot balloon a page`, () => {
    const items = Array.from({ length: MAX_ITEMS + 3 }, (_unused, index) => ({
      title: `Feature ${index}`,
    }))

    const result = normalizeSection('features', { items }, SORT)

    expect(result?.section.section.content).toEqual({ items: items.slice(0, MAX_ITEMS) })
    expect(result?.dropped).toEqual([
      `items[${MAX_ITEMS}]`,
      `items[${MAX_ITEMS + 1}]`,
      `items[${MAX_ITEMS + 2}]`,
    ])
  })
})
