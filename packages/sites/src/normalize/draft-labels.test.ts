/**
 * Label vocabulary for `normalizeDraft`: what it forwards from the section normalizer, and what
 * it reports for copy of its own (title, seo description, site name) that could not be used.
 *
 * The plan's own suite lives in `draft.test.ts`; the caps live in `draft-bounds.test.ts`.
 */
import { describe, it, expect } from 'vitest'
import type { SiteGenerateOutput } from '@sahoda/shared'
import {
  normalizeDraft,
  unusableSeoDescription,
  unusableTitle,
  UNTITLED_SITE,
  UNUSABLE_GOAL,
  UNUSABLE_NAME,
} from './draft'
import type { NormalizeOptions } from './draft'
import { MAX_TEXT_LENGTH, ROOT_DROPPED, itemsOverCap, unknownKeysOverCap } from './section-content'

const TRACE_ID = 'trace-sites-labels'
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

describe('normalizeDraft — section labels are forwarded verbatim', () => {
  it.each([
    [
      'the root sentinel for a content bag that can carry no keys',
      {
        kind: 'contact',
        content: 'garbage' as unknown as Record<string, unknown>,
      } as OutputSection,
      `/[1]:${ROOT_DROPPED}`,
    ],
    [
      'a key lost inside a list entry',
      {
        kind: 'features',
        content: { items: [{ title: 'Keep', body: {} }] },
      } as OutputSection,
      '/[1]:items[0].body',
    ],
    [
      'the over-cap item count',
      {
        kind: 'features',
        content: { items: Array.from({ length: 30 }, (_unused, index) => `Feature ${index}`) },
      } as OutputSection,
      `/[1]:${itemsOverCap(6)}`,
    ],
  ])('forwards %s under the page/index prefix', (_label, section, expected) => {
    const result = unwrap(
      normalizeDraft(output([page({ sections: [hero(), section] })]), options()),
    )

    expect(result.dropped).toContain(expected)
  })

  it('forwards the over-cap unknown-key count without re-counting it', () => {
    const content: Record<string, unknown> = { headline: 'Hi' }
    for (let index = 0; index < 40; index += 1) content[`junk${index}`] = index

    const result = unwrap(
      normalizeDraft(output([page({ sections: [{ kind: 'hero', content }] })]), options()),
    )

    expect(result.dropped).toContain(`/[0]:${unknownKeysOverCap(8)}`)
  })
})

describe('normalizeDraft — title and seo description run the same gate as section copy', () => {
  it('strips control characters from a title rather than shipping them into <title>', () => {
    const title = `Hello${String.fromCharCode(1)}there`

    const result = unwrap(normalizeDraft(output([page({ title })]), options()))

    expect(result.draft.pages[0]?.title).toBe('Hellothere')
  })

  it('reports a title that had content but could not be used, instead of a silent fallback', () => {
    const title = String.fromCharCode(1, 2, 3)

    const result = unwrap(normalizeDraft(output([page({ title })]), options()))

    expect(result.draft.pages[0]?.title).toBe(SITE_NAME)
    expect(result.dropped).toContain(unusableTitle('/'))
  })

  it('says nothing for a blank title, because whitespace lost nothing a founder wrote', () => {
    const result = unwrap(normalizeDraft(output([page({ title: '   ' })]), options()))

    expect(result.dropped).toEqual([])
  })

  it('rejects an over-cap title rather than shipping a truncated half-sentence', () => {
    const title = 'a'.repeat(MAX_TEXT_LENGTH + 1)

    const result = unwrap(normalizeDraft(output([page({ title })]), options()))

    expect(result.draft.pages[0]?.title).toBe(SITE_NAME)
    expect(result.dropped).toContain(unusableTitle('/'))
  })

  it('reports an seo description that had content but could not be used', () => {
    const description = String.fromCharCode(1, 2, 3)

    const result = unwrap(normalizeDraft(output([page({ seo: { description } })]), options()))

    expect(result.draft.pages[0]?.seoDescription).toBeNull()
    expect(result.dropped).toContain(unusableSeoDescription('/'))
  })

  it('says nothing for a blank seo description', () => {
    const result = unwrap(normalizeDraft(output([page({ seo: { description: '  ' } })]), options()))

    expect(result.dropped).toEqual([])
  })
})

describe('normalizeDraft — the site name is a fallback, so it must itself be usable', () => {
  it('falls back to a constant when the caller name is blank, so <title> is never empty', () => {
    const result = unwrap(normalizeDraft(output([page({ title: '  ' })]), options({ name: '   ' })))

    expect(result.draft.name).toBe(UNTITLED_SITE)
    expect(result.draft.pages[0]?.title).toBe(UNTITLED_SITE)
  })

  it('reports a name that had content but could not be used', () => {
    const result = unwrap(
      normalizeDraft(output([page()]), options({ name: String.fromCharCode(1) })),
    )

    expect(result.draft.name).toBe(UNTITLED_SITE)
    expect(result.dropped).toContain(UNUSABLE_NAME)
  })

  it('trims a padded name so the same string is not stored two ways', () => {
    const result = unwrap(normalizeDraft(output([page()]), options({ name: '  Acme Yoga  ' })))

    expect(result.draft.name).toBe(SITE_NAME)
  })

  it('treats a blank goal as absent rather than storing an empty string', () => {
    const result = unwrap(normalizeDraft(output([page()]), options({ goal: '   ' })))

    expect(result.draft.goal).toBeNull()
    expect(result.dropped).toEqual([])
  })

  it('reports a goal that had content but could not be used, like every other lost field', () => {
    const result = unwrap(
      normalizeDraft(output([page()]), options({ goal: String.fromCharCode(1, 2) })),
    )

    expect(result.draft.goal).toBeNull()
    expect(result.dropped).toContain(UNUSABLE_GOAL)
  })
})

describe('normalizeDraft — the hard failure still says what was eaten', () => {
  it('carries the dropped labels on the error, since the caller has no draft to read them from', () => {
    const result = normalizeDraft(
      output([page({ path: '../evil', title: 'Evil' }), page({ sections: [] })]),
      options(),
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected a rejection')
    expect(result.error.details).toEqual({
      dropped: ['invalid-path:pages[0]', 'empty-page:/'],
    })
  })

  it('reports an unusable name AND an unusable goal on the failure, not just the name', () => {
    const result = normalizeDraft(
      output([page({ sections: [] })]),
      options({ name: String.fromCharCode(1), goal: String.fromCharCode(1, 2) }),
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected a rejection')
    expect(result.error.details).toEqual({
      dropped: [UNUSABLE_NAME, UNUSABLE_GOAL, 'empty-page:/'],
    })
  })

  it('reports an unusable name AND goal on the no-pages failure, the sibling of the above', () => {
    const result = normalizeDraft(
      output([]),
      options({ name: String.fromCharCode(1), goal: String.fromCharCode(1, 2) }),
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected a rejection')
    expect(result.error.message).toMatch(/no pages/i)
    expect(result.error.details).toEqual({ dropped: [UNUSABLE_NAME, UNUSABLE_GOAL] })
  })

  it('says nothing extra on the no-pages failure when the caller fields were both usable', () => {
    const result = normalizeDraft(output([]), options({ goal: 'Book more classes' }))

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected a rejection')
    expect(result.error.details).toEqual({ dropped: [] })
  })

  it('gates the goal ahead of the page work, so both caller fields precede page labels', () => {
    const result = unwrap(
      normalizeDraft(
        output([
          page({ sections: [{ kind: 'hero', content: { headline: 'Hi', tagline: 'junk' } }] }),
        ]),
        options({ name: String.fromCharCode(1), goal: String.fromCharCode(2) }),
      ),
    )

    expect(result.dropped).toEqual([UNUSABLE_NAME, UNUSABLE_GOAL, '/[0]:tagline'])
  })
})

describe('normalizeDraft — a dropped page does not reserve its path', () => {
  it('lets a later page claim a path whose earlier claimant was dropped as empty', () => {
    const result = unwrap(
      normalizeDraft(
        output([
          page({ path: '/about', title: 'Empty', sections: [{ kind: 'hero', content: {} }] }),
          page({ path: '/about', title: 'Real', sections: [hero('Our story')] }),
        ]),
        options(),
      ),
    )

    expect(result.draft.pages.map((p) => p.title)).toEqual(['Real'])
    expect(result.dropped).not.toContain('duplicate-path:/about')
  })

  it('does not normalize the sections of a duplicate page, since the page is already lost', () => {
    const result = unwrap(
      normalizeDraft(
        output([
          page({ path: '/about', title: 'First', sections: [hero('First')] }),
          page({
            path: '/about',
            title: 'Second',
            sections: [{ kind: 'hero', content: { headline: 'Hi', tagline: 'junk' } }],
          }),
        ]),
        options(),
      ),
    )

    expect(result.dropped).toEqual(['duplicate-path:/about'])
  })
})
