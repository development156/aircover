import { describe, it, expect } from 'vitest'
import { SiteInsertSchema } from '@sahoda/shared'
import { toRows } from './to-rows'
import { at, makeDraft, makePage, OPTIONS } from './to-rows.fixtures'

describe('toRows — ordering is owned by the mapper', () => {
  it('sets page sort to the array index, overriding a stale sort on the draft', () => {
    const rows = toRows(makeDraft(), OPTIONS)

    expect(rows.pages.map((entry) => entry.page.sort)).toEqual([0, 1])
  })

  it('sets section sort to the index within its own page, restarting at 0 per page', () => {
    const rows = toRows(makeDraft(), OPTIONS)

    expect(at(rows.pages, 0).sections.map((section) => section.sort)).toEqual([0, 1])
    expect(at(rows.pages, 1).sections.map((section) => section.sort)).toEqual([0])
  })

  it('assigns contiguous sorts to a long page list, since the DB has no tiebreaker of its own', () => {
    const pages = Array.from({ length: 6 }, (_, index) =>
      makePage({ path: index === 0 ? '/' : `/p${index}`, sort: 99 }),
    )

    const rows = toRows(makeDraft({ pages }), OPTIONS)

    expect(rows.pages.map((entry) => entry.page.sort)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('keeps draft order, so the row order IS the render order for pages and sections alike', () => {
    const draft = makeDraft()

    const rows = toRows(draft, OPTIONS)

    expect(rows.pages.map((entry) => entry.page.path)).toEqual(draft.pages.map((page) => page.path))
    expect(at(rows.pages, 0).sections.map((section) => section.kind)).toEqual(
      at(draft.pages, 0).sections.map((section) => section.section.kind),
    )
  })
})

describe('toRows — page fields', () => {
  it('passes the normalized path through unchanged, since normalization already guarded it', () => {
    const rows = toRows(makeDraft(), OPTIONS)

    expect(rows.pages.map((entry) => entry.page.path)).toEqual(['/', '/contact'])
  })

  it('passes the title through, so an empty <title> can only come from normalization', () => {
    const rows = toRows(makeDraft(), OPTIONS)

    expect(at(rows.pages, 0).page.title).toBe('Acme Coffee — fresh beans, delivered')
  })

  it('wraps seoDescription in the { description } jsonb shape the mesh output uses', () => {
    const rows = toRows(makeDraft(), OPTIONS)

    expect(at(rows.pages, 0).page.seo).toEqual({
      description: 'Small-batch coffee delivered fresh across India.',
    })
  })

  it('writes seo as null when there is no description, never as an empty object', () => {
    const rows = toRows(makeDraft(), OPTIONS)

    expect(at(rows.pages, 1).page.seo).toBeNull()
  })
})

describe('toRows — section fields', () => {
  it('preserves the nested page→sections structure rather than flattening it', () => {
    const rows = toRows(makeDraft(), OPTIONS)

    expect(rows.pages.map((entry) => entry.sections.map((section) => section.kind))).toEqual([
      ['hero', 'faq'],
      ['contact'],
    ])
  })

  it('passes section content through byte-for-byte, since site_sections.content is NOT NULL jsonb', () => {
    const draft = makeDraft()
    const rows = toRows(draft, OPTIONS)

    const source = at(at(draft.pages, 0).sections, 1).section.content
    const emitted = at(at(rows.pages, 0).sections, 1).content

    expect(JSON.stringify(emitted)).toBe(JSON.stringify(source))
    expect(emitted).toEqual({
      headline: 'Questions',
      items: [
        { q: 'Do you ship nationwide?', a: 'Yes, in 2-4 days.' },
        { q: 'Can I pause?', a: 'Any time, from your account.' },
      ],
    })
  })

  it('survives a JSON round-trip unchanged, which is what the jsonb column will do to it', () => {
    const rows = toRows(makeDraft(), OPTIONS)
    const emitted = at(at(rows.pages, 0).sections, 0).content

    expect(JSON.parse(JSON.stringify(emitted))).toEqual(emitted)
  })

  it('never emits the raw model output, only the narrowed content — junk keys stay dropped', () => {
    const rows = toRows(makeDraft(), OPTIONS)

    expect(at(at(rows.pages, 0).sections, 0).content).not.toHaveProperty('junkKey')
  })
})

describe('toRows — totality', () => {
  it('returns an empty page list rather than throwing, since emptiness is rejected upstream', () => {
    const rows = toRows(makeDraft({ pages: [] }), OPTIONS)

    expect(rows.pages).toEqual([])
    expect(SiteInsertSchema.safeParse(rows.site).success).toBe(true)
  })

  it('returns an empty section list for a page with no sections without throwing', () => {
    const rows = toRows(makeDraft({ pages: [makePage({ sections: [] })] }), OPTIONS)

    expect(at(rows.pages, 0).sections).toEqual([])
  })

  it('leaves the draft it was handed untouched, since projection is not ownership', () => {
    const draft = makeDraft()

    toRows(draft, OPTIONS)

    expect(draft).toEqual(makeDraft())
  })
})
