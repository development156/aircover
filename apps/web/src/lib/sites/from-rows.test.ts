import { describe, expect, test } from 'vitest'
import type { SitePage, SiteSection } from '@sahoda/shared'

import { siteTreeToOutput } from './from-rows'

const WS = '22222222-2222-4222-8222-222222222222'
const SITE = '33333333-3333-4333-8333-333333333333'

function page(id: string, overrides: Partial<SitePage> = {}): SitePage {
  return {
    id,
    workspace_id: WS,
    site_id: SITE,
    path: '/',
    title: 'Home',
    sort: 0,
    seo: null,
    created_at: '2026-07-20T00:00:00.000Z',
    updated_at: '2026-07-20T00:00:00.000Z',
    ...overrides,
  }
}

function section(pageId: string, overrides: Partial<SiteSection> = {}): SiteSection {
  return {
    id: crypto.randomUUID(),
    workspace_id: WS,
    page_id: pageId,
    kind: 'hero',
    sort: 0,
    content: { headline: 'Welcome' },
    created_at: '2026-07-20T00:00:00.000Z',
    updated_at: '2026-07-20T00:00:00.000Z',
    ...overrides,
  }
}

const P1 = '44444444-4444-4444-8444-444444444444'
const P2 = '55555555-5555-4555-8555-555555555555'

describe('siteTreeToOutput', () => {
  test('rebuilds the generator-output shape, pages and sections in sort order', () => {
    const pages = [page(P2, { path: '/about', sort: 1, title: 'About' }), page(P1)]
    const sections = [
      section(P1, { kind: 'features', sort: 1, content: { items: [] } }),
      section(P1, { kind: 'hero', sort: 0 }),
      section(P2, { kind: 'contact', content: { headline: 'Say hi' } }),
    ]

    const output = siteTreeToOutput(pages, sections)

    expect(output?.pages.map((p) => p.path)).toEqual(['/', '/about'])
    expect(output?.pages[0]?.sections.map((s) => s.kind)).toEqual(['hero', 'features'])
    expect(output?.pages[1]?.sections.map((s) => s.kind)).toEqual(['contact'])
  })

  test('a null title becomes empty string — normalizeDraft treats it as unusable and falls back', () => {
    const output = siteTreeToOutput([page(P1, { title: null })], [section(P1)])

    expect(output?.pages[0]?.title).toBe('')
  })

  test('a valid seo object rides through; junk seo is dropped, not fatal', () => {
    const good = siteTreeToOutput(
      [page(P1, { seo: { description: 'A dental clinic' } })],
      [section(P1)],
    )
    const junk = siteTreeToOutput([page(P1, { seo: { random: 1 } })], [section(P1)])

    expect(good?.pages[0]?.seo).toEqual({ description: 'A dental clinic' })
    expect(junk?.pages[0]?.seo).toBeUndefined()
  })

  test('a corrupted stored tree returns null — honest no-preview beats bypassing guards', () => {
    const corrupted = [
      section(P1, { content: 'not-an-object' as unknown as SiteSection['content'] }),
    ]

    expect(siteTreeToOutput([page(P1)], corrupted)).toBeNull()
  })
})
