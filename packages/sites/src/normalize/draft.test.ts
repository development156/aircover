import { describe, it, expect } from 'vitest'
import type { SiteGenerateOutput } from '@sahoda/shared'
import { normalizeDraft } from './draft'
import type { NormalizeOptions } from './draft'

const TRACE_ID = 'trace-sites-draft'
const SITE_NAME = 'Acme Yoga'

type OutputPage = SiteGenerateOutput['pages'][number]
type OutputSection = OutputPage['sections'][number]

const hero = (headline = 'Breathe better'): OutputSection => ({
  kind: 'hero',
  content: { headline },
})

const faq = (): OutputSection => ({
  kind: 'faq',
  content: { items: [{ q: 'Do you offer trials?', a: 'Yes, the first class is free.' }] },
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

describe('normalizeDraft — happy path', () => {
  it('carries the site name and goal from options, since the model never supplies them', () => {
    const result = unwrap(normalizeDraft(output([page()]), options({ goal: 'Book more classes' })))

    expect(result.draft.name).toBe(SITE_NAME)
    expect(result.draft.goal).toBe('Book more classes')
    expect(result.dropped).toEqual([])
  })

  it('defaults goal to null when the caller omits it, matching sites.goal nullability', () => {
    const result = unwrap(normalizeDraft(output([page()]), options()))

    expect(result.draft.goal).toBeNull()
  })

  it('assigns sort as the array index for pages and for sections within a page', () => {
    const result = unwrap(
      normalizeDraft(
        output([
          page({ sections: [hero(), faq()] }),
          page({ path: '/about', title: 'About', sections: [hero('Our story')] }),
        ]),
        options(),
      ),
    )

    expect(result.draft.pages.map((p) => p.sort)).toEqual([0, 1])
    expect(result.draft.pages[0]?.sections.map((s) => s.sort)).toEqual([0, 1])
    expect(result.draft.pages[1]?.sections.map((s) => s.sort)).toEqual([0])
  })

  it('reads the seo description when present and null when absent', () => {
    const result = unwrap(
      normalizeDraft(
        output([
          page({ seo: { description: 'Yoga in Indiranagar' } }),
          page({ path: '/about', title: 'About' }),
        ]),
        options(),
      ),
    )

    expect(result.draft.pages[0]?.seoDescription).toBe('Yoga in Indiranagar')
    expect(result.draft.pages[1]?.seoDescription).toBeNull()
  })

  it('treats a blank seo description as absent rather than emitting an empty meta tag', () => {
    const result = unwrap(
      normalizeDraft(output([page({ seo: { description: '   ' } })]), options()),
    )

    expect(result.draft.pages[0]?.seoDescription).toBeNull()
  })
})

describe('normalizeDraft — invariant 1: unique path per site', () => {
  it('keeps the first of two identical paths, because the second insert is a hard 23505', () => {
    const result = unwrap(
      normalizeDraft(
        output([
          page({ path: '/about', title: 'About us', sections: [hero('First')] }),
          page({ path: '/about', title: 'About again', sections: [hero('Second')] }),
        ]),
        options(),
      ),
    )

    expect(result.draft.pages).toHaveLength(1)
    expect(result.draft.pages[0]?.title).toBe('About us')
    expect(result.dropped).toContain('duplicate-path:/about')
  })

  it('dedupes after normalization, so /About/ collides with /about', () => {
    const result = unwrap(
      normalizeDraft(
        output([
          page({ path: '/about', title: 'About us' }),
          page({ path: '/About/', title: 'About again' }),
        ]),
        options(),
      ),
    )

    expect(result.draft.pages.map((p) => p.path)).toEqual(['/about'])
    expect(result.dropped).toContain('duplicate-path:/about')
  })
})

describe('normalizeDraft — invariant 2: page count', () => {
  it('truncates to options.maxPages, because the schema puts no bound on the array', () => {
    const pages = ['/', '/about', '/pricing', '/faq', '/contact'].map((path) =>
      page({ path, title: path }),
    )

    const result = unwrap(normalizeDraft(output(pages), options({ maxPages: 2 })))

    expect(result.draft.pages.map((p) => p.path)).toEqual(['/', '/about'])
    expect(result.dropped).toContain('truncated-pages:3')
  })

  it('renumbers sort contiguously after truncation so the mapper stays the ordering authority', () => {
    const pages = ['/', '/about', '/pricing'].map((path) => page({ path, title: path }))

    const result = unwrap(normalizeDraft(output(pages), options({ maxPages: 2 })))

    expect(result.draft.pages.map((p) => p.sort)).toEqual([0, 1])
  })

  it('clamps a maxPages below 1 up to 1, because zero pages cannot deploy', () => {
    const result = unwrap(normalizeDraft(output([page()]), options({ maxPages: 0 })))

    expect(result.draft.pages).toHaveLength(1)
  })
})

describe('normalizeDraft — invariant 3: non-empty pages', () => {
  it('rejects an empty pages array, because {"pages":[]} parses clean and would deploy nothing', () => {
    const result = normalizeDraft(output([]), options())

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected a rejection')
    expect(result.error.code).toBe('VALIDATION_ERROR')
    expect(result.error.traceId).toBe(TRACE_ID)
    expect(result.error.message).toMatch(/no pages/i)
  })

  it('rejects when every page drops, because an empty site must never reach a deployer', () => {
    const result = normalizeDraft(output([page({ sections: [] })]), options())

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected a rejection')
    expect(result.error.code).toBe('VALIDATION_ERROR')
    expect(result.error.message).toMatch(/survived/i)
  })

  it('drops a page whose sections all drop, rather than emitting a blank page', () => {
    const result = unwrap(
      normalizeDraft(
        output([
          page(),
          page({ path: '/about', title: 'About', sections: [{ kind: 'hero', content: {} }] }),
        ]),
        options(),
      ),
    )

    expect(result.draft.pages.map((p) => p.path)).toEqual(['/'])
    expect(result.dropped).toContain('dropped-section:/about[0]:hero')
    expect(result.dropped).toContain('empty-page:/about')
  })

  it('keeps a page when only some sections drop, and renumbers the survivors from zero', () => {
    const result = unwrap(
      normalizeDraft(
        output([page({ sections: [hero(), { kind: 'features', content: {} }, faq()] })]),
        options(),
      ),
    )

    expect(result.draft.pages[0]?.sections.map((s) => s.section.kind)).toEqual(['hero', 'faq'])
    expect(result.draft.pages[0]?.sections.map((s) => s.sort)).toEqual([0, 1])
    expect(result.dropped).toContain('dropped-section:/[1]:features')
  })

  it('prefixes section-level dropped keys with the page path and the source section index', () => {
    const result = unwrap(
      normalizeDraft(
        output([
          page({ sections: [{ kind: 'hero', content: { headline: 'Hi', tagline: 'junk' } }] }),
        ]),
        options(),
      ),
    )

    expect(result.dropped).toContain('/[0]:tagline')
  })
})

describe('normalizeDraft — invariant 4: the home page leads with a hero', () => {
  it('records a / page that does not start with a hero without reordering it', () => {
    const result = unwrap(normalizeDraft(output([page({ sections: [faq(), hero()] })]), options()))

    expect(result.draft.pages[0]?.sections.map((s) => s.section.kind)).toEqual(['faq', 'hero'])
    expect(result.dropped).toContain('home-not-hero:/')
  })

  it('says nothing when / already leads with a hero', () => {
    const result = unwrap(normalizeDraft(output([page({ sections: [hero(), faq()] })]), options()))

    expect(result.dropped).toEqual([])
  })

  it('does not apply the hero rule to non-home pages', () => {
    const result = unwrap(
      normalizeDraft(
        output([page(), page({ path: '/faq', title: 'FAQ', sections: [faq()] })]),
        options(),
      ),
    )

    expect(result.dropped).toEqual([])
  })
})

describe('normalizeDraft — invariant 5: path is untrusted', () => {
  it('drops a traversal path rather than coercing it into something plausible', () => {
    const result = unwrap(
      normalizeDraft(
        output([
          page({ path: '../../etc/passwd', title: 'Evil', sections: [hero('Evil')] }),
          page({ path: '/about', title: 'About' }),
        ]),
        options(),
      ),
    )

    expect(result.draft.pages.map((p) => p.path)).toEqual(['/about'])
    expect(result.dropped).toContain('invalid-path:pages[0]')
  })
})

describe('normalizeDraft — invariant 6: title', () => {
  it('falls back to the site name for an empty title so <title> is never blank', () => {
    const result = unwrap(normalizeDraft(output([page({ title: '   ' })]), options()))

    expect(result.draft.pages[0]?.title).toBe(SITE_NAME)
  })

  it('trims a padded title instead of rejecting it', () => {
    const result = unwrap(normalizeDraft(output([page({ title: '  Home  ' })]), options()))

    expect(result.draft.pages[0]?.title).toBe('Home')
  })
})
