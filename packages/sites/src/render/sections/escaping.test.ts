import { describe, it, expect } from 'vitest'
import type { RenderContext } from '../context'
import { renderHero } from './hero'
import { renderFeatures } from './features'
import { renderOffer } from './offer'
import { renderTestimonials } from './testimonials'
import { renderFaq } from './faq'
import { renderContact } from './contact'

const XSS = '<script>alert(1)</script>'
const ATTR_BREAKOUT = 'x" onerror="alert(1)'
/**
 * Matches a real QUOTED event-handler attribute. The quote is load-bearing: correctly
 * escaped output still contains the literal text ` onerror=` — `x" onerror="alert(1)`
 * escapes to `x&quot; onerror=&quot;alert(1)` — so a pattern without the trailing quote
 * fails on output that is provably safe.
 */
const EVENT_HANDLER = /\son[a-z]+\s*=\s*["']/i

const CTX: RenderContext = {
  siteName: 'Sharma Dental',
  tokensCss: ':root{--ink:#131313}',
  theme: null,
  formAction: '/api/leads/sharma-dental',
  canonicalOrigin: null,
}

/** `renderContact` still emits the lead form whenever `ctx.formAction` is usable, so the
 *  all-fields-absent case needs a context in which nothing BUT the copy could produce output. */
const CTX_NO_FORM: RenderContext = { ...CTX, formAction: null }

interface EscapingCase {
  kind: string
  render: (payload: string) => string
  /** The all-fields-absent probe, so a kind that reads more than text off the ctx can
   *  supply its own context instead of being asserted against a false expectation. */
  renderAbsent: () => string
}

/** One row per SectionKind. The escaping invariant is pinned once, here, for all six. */
const CASES: EscapingCase[] = [
  {
    kind: 'hero',
    render: (p) => renderHero({ headline: p, subhead: p, ctaLabel: p, ctaHref: p }, CTX),
    renderAbsent: () => renderHero({ headline: '', subhead: '', ctaLabel: '', ctaHref: '' }, CTX),
  },
  {
    kind: 'features',
    render: (p) => renderFeatures({ headline: p, items: [{ title: p, body: p }] }, CTX),
    renderAbsent: () => renderFeatures({ headline: '', items: [] }, CTX),
  },
  {
    kind: 'offer',
    render: (p) =>
      renderOffer({ headline: p, body: p, priceNote: p, ctaLabel: p, ctaHref: p }, CTX),
    renderAbsent: () =>
      renderOffer({ headline: '', body: '', priceNote: '', ctaLabel: '', ctaHref: '' }, CTX),
  },
  {
    kind: 'testimonials',
    render: (p) =>
      renderTestimonials({ headline: p, items: [{ quote: p, author: p, role: p }] }, CTX),
    renderAbsent: () => renderTestimonials({ headline: '', items: [] }, CTX),
  },
  {
    kind: 'faq',
    render: (p) => renderFaq({ headline: p, items: [{ q: p, a: p }] }, CTX),
    renderAbsent: () => renderFaq({ headline: '', items: [] }, CTX),
  },
  {
    kind: 'contact',
    render: (p) => renderContact({ headline: p, body: p, submitLabel: p }, CTX, true),
    // formAction: null — with an endpoint configured the lead form alone is non-empty output,
    // and asserting '' against CTX would be asserting that the form is silently dropped.
    renderAbsent: () =>
      renderContact({ headline: '', body: '', submitLabel: '' }, CTX_NO_FORM, true),
  },
]

/**
 * Only hero and offer carry a link, so a `javascript:` payload is only meaningful there.
 * Fed into a plain TEXT field (headline, body, quote, q/a) it legitimately renders as
 * escaped copy — asserting its absence everywhere would be asserting that the renderer
 * silently deletes words the model wrote.
 */
const HREF_CASES: Array<{
  kind: string
  label: string
  render: (href: string) => string
}> = [
  {
    kind: 'hero',
    label: 'Book now',
    render: (href) =>
      renderHero({ headline: 'Smile brighter', ctaLabel: 'Book now', ctaHref: href }, CTX),
  },
  {
    kind: 'offer',
    label: 'Claim it',
    render: (href) =>
      renderOffer({ headline: 'Cleaning package', ctaLabel: 'Claim it', ctaHref: href }, CTX),
  },
]

/** The four kinds with no href-bearing field must never emit an anchor, whatever the copy
 *  looks like — that is what makes `renderLink` the single link-emitting path in practice. */
const LINKLESS_CASES: Array<{ kind: string; render: () => string }> = [
  {
    kind: 'features',
    render: () =>
      renderFeatures(
        { headline: 'Why us', items: [{ title: 'Fast', body: 'https://example.com' }] },
        CTX,
      ),
  },
  {
    kind: 'testimonials',
    render: () =>
      renderTestimonials({ items: [{ quote: 'https://example.com', author: 'Ria' }] }, CTX),
  },
  {
    kind: 'faq',
    render: () => renderFaq({ items: [{ q: 'Link?', a: 'https://example.com' }] }, CTX),
  },
  {
    kind: 'contact',
    render: () => renderContact({ headline: 'Talk to us', body: 'https://example.com' }, CTX, true),
  },
]

describe('section renderers — the escaping invariant across all six kinds', () => {
  for (const testCase of CASES) {
    it(`${testCase.kind}: a script payload in every text field is escaped, so injected copy cannot execute`, () => {
      const html = testCase.render(XSS)

      expect(html).not.toContain('<script')
      expect(html).toContain('&lt;script&gt;')
    })

    it(`${testCase.kind}: an attribute-breakout payload emits no event-handler attribute`, () => {
      const html = testCase.render(ATTR_BREAKOUT)

      expect(html).not.toMatch(EVENT_HANDLER)
    })

    it(`${testCase.kind}: renders nothing when every field is absent, rather than an empty shell`, () => {
      expect(testCase.renderAbsent()).toBe('')
    })
  }
})

describe('section renderers — a javascript: href never reaches an href attribute', () => {
  for (const testCase of HREF_CASES) {
    it(`${testCase.kind}: drops the link but keeps the label, so no dangerous href ships`, () => {
      const html = testCase.render('javascript:alert(1)')

      expect(html).not.toMatch(/href="javascript:/i)
      expect(html).not.toContain('<a ')
      expect(html).toContain(testCase.label)
    })

    it(`${testCase.kind}: still emits a real anchor for a safe href, so "no link" is not the only branch`, () => {
      const html = testCase.render('https://example.com/book')

      expect(html).toContain('<a class="cta" href="https://example.com/book">')
      expect(html).toContain(testCase.label)
    })
  }
})

describe('section renderers — only hero and offer emit anchors, and only through renderLink', () => {
  for (const testCase of LINKLESS_CASES) {
    it(`${testCase.kind}: renders a url in copy as text, never as an anchor`, () => {
      const html = testCase.render()

      expect(html).not.toContain('<a ')
      expect(html).toContain('https://example.com')
    })
  }
})
