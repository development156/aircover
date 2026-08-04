/**
 * Bounds for `normalizeDraft`: the dimensions model output leaves unbounded.
 *
 * The plan's own suite lives in `draft.test.ts` and covers the six invariants; the labels the
 * section normalizer hands up are covered in `draft-labels.test.ts`.
 */
import { describe, it, expect } from 'vitest'
import type { SiteGenerateOutput } from '@sahoda/shared'
import {
  MAX_SECTIONS_PER_PAGE,
  MAX_SOURCE_PAGES,
  normalizeDraft,
  truncatedSections,
  unscannedPages,
} from './draft'
import type { NormalizeOptions } from './draft'

const TRACE_ID = 'trace-sites-bounds'
const SITE_NAME = 'Acme Yoga'

type OutputPage = SiteGenerateOutput['pages'][number]
type OutputSection = OutputPage['sections'][number]

const hero = (headline = 'Breathe better'): OutputSection => ({
  kind: 'hero',
  content: { headline },
})

const page = (overrides: Partial<OutputPage> = {}): OutputPage => ({
  path: '/',
  title: 'Home',
  sections: [hero()],
  ...overrides,
})

const output = (pages: OutputPage[]): SiteGenerateOutput => ({ pages })

const options = (overrides: Partial<NormalizeOptions> = {}): NormalizeOptions => ({
  name: SITE_NAME,
  maxPages: 5,
  traceId: TRACE_ID,
  ...overrides,
})

const unwrap = (result: ReturnType<typeof normalizeDraft>) => {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}: ${result.error.message}`)
  return result.data
}

/** A page at `/p<n>`, distinct from every other, so nothing dedupes by accident. */
const numbered = (index: number): OutputPage =>
  page({ path: `/p${index}`, title: `Page ${index}`, sections: [hero(`Headline ${index}`)] })

describe('normalizeDraft — caps are declared, not incidental', () => {
  it('pins the cap values, so a change to either is a deliberate edit to a test', () => {
    expect(MAX_SOURCE_PAGES).toBe(64)
    expect(MAX_SECTIONS_PER_PAGE).toBe(32)
  })
})

describe('normalizeDraft — the page list is bounded at the input, not the accumulator', () => {
  it('scans at most MAX_SOURCE_PAGES entries and reports the rest as a count', () => {
    const pages = Array.from({ length: MAX_SOURCE_PAGES + 6 }, (_unused, index) => numbered(index))

    const result = unwrap(normalizeDraft(output(pages), options({ maxPages: 500 })))

    expect(result.draft.pages).toHaveLength(MAX_SOURCE_PAGES)
    expect(result.dropped).toContain(unscannedPages(6))
  })

  it('never names an unscanned page individually, since it was never looked at', () => {
    const pages = Array.from({ length: MAX_SOURCE_PAGES + 3 }, (_unused, index) =>
      // Every page past the cap carries an unknown key that could have been named.
      page({
        path: `/p${index}`,
        title: `Page ${index}`,
        sections: [{ kind: 'hero', content: { headline: 'Hi', tagline: 'junk' } }],
      }),
    )

    const result = unwrap(normalizeDraft(output(pages), options({ maxPages: 500 })))

    expect(result.dropped).toContain(`/p${MAX_SOURCE_PAGES - 1}[0]:tagline`)
    expect(result.dropped).not.toContain(`/p${MAX_SOURCE_PAGES}[0]:tagline`)
  })

  it('says nothing about unscanned pages when the list fits inside the cap', () => {
    const pages = Array.from({ length: 3 }, (_unused, index) => numbered(index))

    const result = unwrap(normalizeDraft(output(pages), options({ maxPages: 500 })))

    expect(result.dropped).toEqual([])
  })
})

describe('normalizeDraft — sections per page are bounded', () => {
  it('scans at most MAX_SECTIONS_PER_PAGE sections and reports the rest as a count', () => {
    const sections = Array.from({ length: MAX_SECTIONS_PER_PAGE + 8 }, (_unused, index) =>
      hero(`Headline ${index}`),
    )

    const result = unwrap(normalizeDraft(output([page({ sections })]), options()))

    expect(result.draft.pages[0]?.sections).toHaveLength(MAX_SECTIONS_PER_PAGE)
    expect(result.dropped).toContain(truncatedSections('/', 8))
  })

  it('says nothing when the section list fits inside the cap', () => {
    const result = unwrap(
      normalizeDraft(output([page({ sections: [hero(), hero('Two')] })]), options()),
    )

    expect(result.dropped).toEqual([])
  })
})

describe('normalizeDraft — maxPages is untrusted arithmetic', () => {
  // Each row pins the EXACT surviving paths, not `length >= 1`: a row that only asserts
  // "at least one page" cannot fail for the +Infinity reading, and a test that cannot fail
  // reads as coverage it does not provide.
  it.each([
    ['NaN', Number.NaN, ['/']],
    ['-Infinity', Number.NEGATIVE_INFINITY, ['/']],
    ['Infinity', Number.POSITIVE_INFINITY, ['/', '/p1']],
  ])(
    'resolves a maxPages of %s to an exact page count, never zero',
    (_label, maxPages, expected) => {
      const result = unwrap(normalizeDraft(output([page(), numbered(1)]), options({ maxPages })))

      expect(result.draft.pages.map((p) => p.path)).toEqual(expected)
    },
  )

  it('reports the pages a non-finite maxPages cost, rather than losing them silently', () => {
    const result = unwrap(
      normalizeDraft(output([page(), numbered(1), numbered(2)]), options({ maxPages: Number.NaN })),
    )

    expect(result.draft.pages).toHaveLength(1)
    expect(result.dropped).toContain('truncated-pages:2')
  })

  it.each([
    ['NaN', Number.NaN],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ])('clamps a maxPages of %s to one page and reports what that cost', (_label, maxPages) => {
    const result = unwrap(
      normalizeDraft(output([page(), numbered(1), numbered(2)]), options({ maxPages })),
    )

    expect(result.draft.pages).toHaveLength(1)
    expect(result.dropped).toContain('truncated-pages:2')
  })

  it('reads +Infinity as no cap, rather than as the maximum possible truncation', () => {
    const result = unwrap(
      normalizeDraft(
        output([page(), numbered(1), numbered(2)]),
        options({ maxPages: Number.POSITIVE_INFINITY }),
      ),
    )

    expect(result.draft.pages.map((p) => p.path)).toEqual(['/', '/p1', '/p2'])
    expect(result.dropped).toEqual([])
  })

  it('still bounds an uncapped maxPages at MAX_SOURCE_PAGES, which is the memory bound', () => {
    const pages = Array.from({ length: MAX_SOURCE_PAGES + 4 }, (_unused, index) => numbered(index))

    const result = unwrap(
      normalizeDraft(output(pages), options({ maxPages: Number.POSITIVE_INFINITY })),
    )

    expect(result.draft.pages).toHaveLength(MAX_SOURCE_PAGES)
    expect(result.dropped).toEqual([unscannedPages(4)])
  })

  it('floors a fractional maxPages instead of slicing on a fraction', () => {
    const result = unwrap(
      normalizeDraft(output([page(), numbered(1), numbered(2)]), options({ maxPages: 2.9 })),
    )

    expect(result.draft.pages).toHaveLength(2)
  })
})

describe('normalizeDraft — a truncated page takes its own labels with it', () => {
  it('does not name keys lost inside a page that is not in the site', () => {
    const result = unwrap(
      normalizeDraft(
        output([
          page(),
          page({
            path: '/gone',
            title: 'Gone',
            sections: [{ kind: 'hero', content: { headline: 'Hi', tagline: 'junk' } }],
          }),
        ]),
        options({ maxPages: 1 }),
      ),
    )

    expect(result.draft.pages.map((p) => p.path)).toEqual(['/'])
    expect(result.dropped).toContain('truncated-pages:1')
    expect(result.dropped).not.toContain('/gone[0]:tagline')
  })

  it('still names keys lost inside a page that survives the cap', () => {
    const result = unwrap(
      normalizeDraft(
        output([
          page({ sections: [{ kind: 'hero', content: { headline: 'Hi', tagline: 'junk' } }] }),
          numbered(1),
        ]),
        options({ maxPages: 1 }),
      ),
    )

    expect(result.dropped).toContain('/[0]:tagline')
  })

  it('keeps the explanation for a page dropped as empty, since that is why it went', () => {
    const result = unwrap(
      normalizeDraft(
        output([
          page(),
          page({ path: '/about', title: 'About', sections: [{ kind: 'hero', content: {} }] }),
        ]),
        options(),
      ),
    )

    expect(result.dropped).toEqual(['dropped-section:/about[0]:hero', 'empty-page:/about'])
  })

  it('interleaves a surviving page\u2019s labels with a later page-level failure, in source order', () => {
    const result = unwrap(
      normalizeDraft(
        output([
          page({ sections: [{ kind: 'hero', content: { headline: 'Hi', tagline: 'junk' } }] }),
          page({ path: '../evil', title: 'Evil' }),
        ]),
        options(),
      ),
    )

    expect(result.dropped).toEqual(['/[0]:tagline', 'invalid-path:pages[1]'])
  })

  it('reports page-level failures in source order, ahead of later pages', () => {
    const result = unwrap(
      normalizeDraft(
        output([
          page({ path: '../evil', title: 'Evil' }),
          page({ sections: [{ kind: 'hero', content: { headline: 'Hi', tagline: 'junk' } }] }),
        ]),
        options(),
      ),
    )

    expect(result.dropped).toEqual(['invalid-path:pages[0]', '/[0]:tagline'])
  })
})
