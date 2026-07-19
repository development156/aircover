import { describe, expect, test } from 'vitest'
import { normalizeDraft, renderBundle } from '@sahoda/sites'
import type { SiteGenerateOutput } from '@sahoda/shared'

import { toPreviewPages } from './preview'

/**
 * Runs against the REAL pipeline, not a fixture of its output — the inliner's
 * regex must match the exact tag `renderDocument` emits, and only a real
 * bundle can prove that stays true across package upgrades.
 */

const OUTPUT: SiteGenerateOutput = {
  pages: [
    {
      path: '/',
      title: 'Home',
      sections: [{ kind: 'hero', content: { headline: 'Bright smiles' } }],
    },
    {
      path: '/about',
      title: 'About us',
      sections: [{ kind: 'faq', content: { items: [{ q: 'Hours?', a: '9-6' }] } }],
    },
  ],
}

function realBundle() {
  const normalized = normalizeDraft(OUTPUT, {
    name: 'Sharma Dental',
    goal: 'More bookings',
    maxPages: 5,
    traceId: 'test-trace',
  })
  if (!normalized.ok) throw new Error('normalizeDraft failed on a known-good fixture')
  return renderBundle(normalized.data.draft, {
    siteName: 'Sharma Dental',
    tokensCss: ':root{--ink:oklch(0.2 0 0)}',
    theme: null,
    formAction: null,
    canonicalOrigin: null,
  })
}

describe('toPreviewPages', () => {
  test('every page gets its stylesheet inlined — no relative link survives', () => {
    const pages = toPreviewPages(realBundle())

    expect(pages.length).toBeGreaterThanOrEqual(1)
    for (const page of pages) {
      expect(page.html).not.toMatch(/href="(?:\.\.\/)*styles\.css"/)
      expect(page.html).toContain('<style>')
    }
  })

  test('inlined sheet is the bundle stylesheet, and tokens stay in the head', () => {
    const bundle = realBundle()
    const sheet = bundle.files.find((f) => f.path === 'styles.css')?.content ?? ''
    expect(sheet.length).toBeGreaterThan(0)

    const [home] = toPreviewPages(bundle)
    expect(home?.html).toContain(sheet.slice(0, 40))
    expect(home?.html).toContain('--ink:oklch(0.2 0 0)')
  })

  test('titles come from the rendered documents', () => {
    const titles = toPreviewPages(realBundle()).map((p) => p.title)
    expect(titles.join(' ')).toMatch(/Sharma Dental|Home/)
  })

  test('only html files become pages — the stylesheet itself is not a page', () => {
    const pages = toPreviewPages(realBundle())
    expect(pages.every((p) => !p.path.endsWith('.css'))).toBe(true)
  })
})
