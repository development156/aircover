/**
 * `dropped` is an ordered report, not a set: it is read top to bottom by a founder trying to work
 * out what happened to their site, so the sequence is part of the contract. Every assertion here
 * is `toEqual` on the whole array — `toContain` would let any of these orderings be reordered by
 * accident. The page-level merge order is pinned in `draft-bounds.test.ts`; this file pins the
 * three orderings inside a single push site, plus the one label that deliberately outlives its
 * page.
 */
import { describe, it, expect } from 'vitest'
import type { SiteGenerateOutput } from '@sahoda/shared'
import {
  MAX_SECTIONS_PER_PAGE,
  MAX_SOURCE_PAGES,
  normalizeDraft,
  truncatedPages,
  truncatedSections,
  unscannedPages,
  unusableSeoDescription,
  unusableTitle,
} from './draft'
import type { NormalizeOptions } from './draft'

const TRACE_ID = 'trace-sites-order'
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

const numbered = (index: number): OutputPage =>
  page({ path: `/p${index}`, title: `Page ${index}`, sections: [hero(`Headline ${index}`)] })

describe('normalizeDraft — the labels one page contributes are ordered', () => {
  it('reports title, then seo description, then the hero check', () => {
    const result = unwrap(
      normalizeDraft(
        output([
          page({
            title: String.fromCharCode(1),
            seo: { description: String.fromCharCode(2) },
            // A non-hero lead section, so `home-not-hero` also fires.
            sections: [{ kind: 'features', content: { items: ['Mats provided'] } }],
          }),
        ]),
        options(),
      ),
    )

    expect(result.dropped).toEqual([
      unusableTitle('/'),
      unusableSeoDescription('/'),
      'home-not-hero:/',
    ])
  })

  it('reports the sections it scanned before the count of the ones it never looked at', () => {
    const sections: OutputSection[] = [
      { kind: 'hero', content: { headline: 'Hi', tagline: 'junk' } },
      { kind: 'features', content: {} },
      ...Array.from({ length: MAX_SECTIONS_PER_PAGE }, (_unused, index) =>
        hero(`Headline ${index}`),
      ),
    ]

    const result = unwrap(normalizeDraft(output([page({ sections })]), options()))

    // Per-section labels in source order first; the never-scanned count last, because it is the
    // one fact that is not about a section anybody read.
    expect(result.dropped).toEqual([
      '/[0]:tagline',
      'dropped-section:/[1]:features',
      truncatedSections('/', 2),
    ])
  })
})

describe('normalizeDraft — the two page-count labels are ordered', () => {
  it('reports survivors lost to maxPages before pages it never scanned', () => {
    const pages = Array.from({ length: MAX_SOURCE_PAGES + 3 }, (_unused, index) => numbered(index))

    const result = unwrap(normalizeDraft(output(pages), options({ maxPages: 2 })))

    expect(result.draft.pages).toHaveLength(2)
    expect(result.dropped).toEqual([truncatedPages(MAX_SOURCE_PAGES - 2), unscannedPages(3)])
  })
})

describe('normalizeDraft — a page keeps the label that explains why it went', () => {
  it('keeps duplicate-path even when the survivor holding that path is later truncated away', () => {
    const result = unwrap(
      normalizeDraft(
        output([
          page(),
          page({ path: '/b', title: 'First b', sections: [hero('First b')] }),
          page({ path: '/b', title: 'Second b', sections: [hero('Second b')] }),
        ]),
        options({ maxPages: 1 }),
      ),
    )

    // `/b` is not in the finished site, yet `duplicate-path:/b` is still reported. Suppressing it
    // would erase the only record that a second `/b` was ever sent — silent loss is worse than a
    // label that names an absent path, and `truncated-pages:1` sits right beside it to explain.
    expect(result.draft.pages.map((p) => p.path)).toEqual(['/'])
    expect(result.dropped).toEqual(['duplicate-path:/b', truncatedPages(1)])
  })
})
