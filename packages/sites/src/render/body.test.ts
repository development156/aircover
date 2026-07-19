/**
 * `id="contact"` is unique per DOCUMENT, so these cases are stated at the two scopes that own
 * that claim: `renderBody` for one page, `renderBundle` for pages that must not interfere.
 *
 * The counted assertion is deliberately on the emitted markup rather than on a return value —
 * the defect this file pins survived a full green suite precisely because nothing counted the
 * ids in the output.
 */
import { describe, it, expect } from 'vitest'
import type { NormalizedSection } from '../normalize/section-content'
import type { SiteDraft } from '../normalize/draft'
import { renderBody } from './body'
import { renderBundle } from './bundle'
import type { RenderContext } from './context'

const buildCtx = (overrides: Partial<RenderContext> = {}): RenderContext => ({
  siteName: 'Sharma Dental',
  tokensCss: ':root{--ink:oklch(0.2 0 0)}',
  theme: null,
  formAction: '/api/leads/sharma-dental',
  canonicalOrigin: null,
  ...overrides,
})

const CTX = buildCtx()

const sectionOf = (section: NormalizedSection['section'], sort = 0): NormalizedSection => ({
  section,
  sort,
  raw: {},
})

/** A hero carrying the in-page CTA every one of these cases has to keep resolvable. */
const hero = (headline: string): NormalizedSection =>
  sectionOf({
    kind: 'hero',
    content: { headline, ctaLabel: 'Book now', ctaHref: '#contact' },
  })

const contact = (headline: string): NormalizedSection =>
  sectionOf({ kind: 'contact', content: { headline } })

const anchorCount = (html: string): number => (html.match(/id="contact"/g) ?? []).length

describe('renderBody — the document-scoped #contact anchor', () => {
  it('emits no anchor for a page with zero contact sections', () => {
    const html = renderBody([hero('Smile brighter')], CTX)

    expect(anchorCount(html)).toBe(0)
    // Stated, not asserted away: the CTA on such a page points at a fragment that matches
    // nothing. That gap predates the anchor allocator and is unchanged by it — see body.ts.
    expect(html).toContain('href="#contact"')
  })

  it('emits exactly one anchor for a page with one contact section', () => {
    const html = renderBody([hero('Smile brighter'), contact('Get in touch')], CTX)

    expect(anchorCount(html)).toBe(1)
  })

  it('emits exactly one anchor for a page with two contact sections', () => {
    const html = renderBody(
      [hero('Smile brighter'), contact('Get in touch'), hero('Second'), contact('Or here')],
      CTX,
    )

    expect(anchorCount(html)).toBe(1)
    // Both sections still render — the second is not dropped, it just does not re-claim the id.
    expect(html).toContain('<h2>Get in touch</h2>')
    expect(html).toContain('<h2>Or here</h2>')
  })

  it('emits exactly one anchor for a page with three contact sections', () => {
    const html = renderBody([hero('Smile brighter'), contact('A'), contact('B'), contact('C')], CTX)

    expect(anchorCount(html)).toBe(1)
    expect(html.match(/section--contact/g)).toHaveLength(3)
  })

  it('gives the anchor to the FIRST contact section, so the first #contact target is the top one', () => {
    const html = renderBody([contact('First'), contact('Second')], CTX)
    const anchored = html.indexOf('id="contact"')

    expect(anchorCount(html)).toBe(1)
    expect(anchored).toBeLessThan(html.indexOf('Second'))
    expect(anchored).toBeGreaterThan(-1)
  })

  it('passes the anchor on to a later contact section when the earlier one renders nothing', () => {
    // A contact section with neither copy nor a usable endpoint returns ''. Awarding it the
    // anchor would leave the page with a '#contact' CTA and no element carrying the id — the
    // dangling-link failure, arrived at by way of fixing the duplicate-id one.
    const html = renderBody(
      [sectionOf({ kind: 'contact', content: {} }), contact('Get in touch')],
      buildCtx({ formAction: null }),
    )

    expect(anchorCount(html)).toBe(1)
    expect(html).toContain('<h2>Get in touch</h2>')
  })
})

describe('renderBundle — the anchor is per page, never per bundle', () => {
  const pageOf = (path: string, sections: NormalizedSection[], sort: number) => ({
    path,
    title: path,
    seoDescription: null,
    sections,
    sort,
  })

  it('gives every page with a contact section its own anchor', () => {
    const draft: SiteDraft = {
      name: 'Sharma Dental',
      goal: null,
      pages: [
        pageOf('/', [hero('Home'), contact('Get in touch'), contact('Or here')], 0),
        pageOf('/reach-us', [hero('Reach us'), contact('Talk to us')], 1),
        pageOf('/about', [hero('About')], 2),
      ],
    }

    const bundle = renderBundle(draft, CTX)
    const anchorsAt = (path: string): number =>
      anchorCount(bundle.files.find((file) => file.path === path)?.content ?? '')

    // One page's contact sections must not consume another page's anchor: '/' having two does
    // not cost '/reach-us' the one it needs.
    expect(anchorsAt('index.html')).toBe(1)
    expect(anchorsAt('reach-us/index.html')).toBe(1)
    expect(anchorsAt('about/index.html')).toBe(0)
  })
})
