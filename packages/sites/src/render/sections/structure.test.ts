import { describe, it, expect } from 'vitest'
import type { NormalizedSection } from '../../normalize/section-content'
import type { RenderContext } from '../context'
import { renderHero } from './hero'
import { renderFeatures } from './features'
import { renderOffer } from './offer'
import { renderTestimonials } from './testimonials'
import { renderFaq } from './faq'
import { renderContact } from './contact'
import { renderSection } from './index'

const buildCtx = (overrides: Partial<RenderContext> = {}): RenderContext => ({
  siteName: 'Sharma Dental',
  tokensCss: ':root{--ink:#131313}',
  theme: null,
  formAction: '/api/leads/sharma-dental',
  canonicalOrigin: null,
  ...overrides,
})

const CTX = buildCtx()

describe('renderHero — the page lead, the only h1 on the page', () => {
  it('renders the headline as the single h1 so the document has exactly one top-level heading', () => {
    const html = renderHero({ headline: 'Smile brighter' }, CTX)

    expect(html).toContain('<h1>Smile brighter</h1>')
    expect(html.match(/<h1>/g)).toHaveLength(1)
  })

  it('renders the subhead as a lede paragraph when the model supplied one', () => {
    const html = renderHero({ headline: 'Smile brighter', subhead: 'Dentistry that fits.' }, CTX)

    expect(html).toContain('<p class="lede">Dentistry that fits.</p>')
  })

  it('renders without a subhead when the model omitted one, rather than an empty paragraph', () => {
    const html = renderHero({ headline: 'Smile brighter' }, CTX)

    expect(html).not.toContain('<p class="lede">')
  })

  it('drops the CTA link but keeps the label as text when the href is unsafe', () => {
    const html = renderHero(
      { headline: 'Smile brighter', ctaLabel: 'Book now', ctaHref: 'javascript:x' },
      CTX,
    )

    expect(html).not.toContain('<a')
    expect(html).toContain('Book now')
  })

  it('wraps content in a semantic <section> element', () => {
    expect(renderHero({ headline: 'Smile brighter' }, CTX)).toContain(
      '<section class="section section--hero">',
    )
  })
})

describe('renderFeatures — a list of benefits', () => {
  it('renders items as a ul/li list so assistive tech announces the count', () => {
    const html = renderFeatures({ items: [{ title: 'Painless' }, { title: 'Same-day' }] }, CTX)

    expect(html).toContain('<ul class="grid">')
    expect(html.match(/<li>/g)).toHaveLength(2)
  })

  it('renders each item title as an h3 under the section h2', () => {
    const html = renderFeatures(
      { headline: 'Why us', items: [{ title: 'Painless', body: 'Modern anaesthetic.' }] },
      CTX,
    )

    expect(html).toContain('<h2>Why us</h2>')
    expect(html).toContain('<h3>Painless</h3>')
    expect(html).toContain('<p>Modern anaesthetic.</p>')
  })

  it('omits the item paragraph when the item has no body', () => {
    expect(renderFeatures({ items: [{ title: 'Painless' }] }, CTX)).toBe(
      '<section class="section section--features"><div class="wrap">' +
        '<ul class="grid"><li><h3>Painless</h3></li></ul></div></section>',
    )
  })

  it('emits no <ul> at all for an empty items array, rather than an empty list element', () => {
    const html = renderFeatures({ headline: 'Why us', items: [] }, CTX)

    expect(html).not.toContain('<ul')
    expect(html).toContain('<h2>Why us</h2>')
  })

  it('skips an item with a blank title because a bullet with no label is noise', () => {
    const html = renderFeatures({ items: [{ title: '  ' }, { title: 'Same-day' }] }, CTX)

    expect(html.match(/<li>/g)).toHaveLength(1)
    expect(html).toContain('<h3>Same-day</h3>')
  })
})

describe('renderOffer — the pitch', () => {
  it('renders the headline as an h2 and the price note as its own paragraph', () => {
    const html = renderOffer({ headline: 'Cleaning package', priceNote: 'From ₹1,499' }, CTX)

    expect(html).toContain('<h2>Cleaning package</h2>')
    expect(html).toContain('<p class="price">From ₹1,499</p>')
  })

  it('renders the body as a plain paragraph, distinct from the price note', () => {
    const html = renderOffer(
      { headline: 'Cleaning package', body: 'Scale and polish.', priceNote: 'From ₹1,499' },
      CTX,
    )

    expect(html).toContain('<p>Scale and polish.</p>')
    expect(html).toContain('<p class="price">From ₹1,499</p>')
  })

  it('renders without a price note when the model omitted one', () => {
    expect(renderOffer({ headline: 'Cleaning package' }, CTX)).not.toContain('class="price"')
  })

  it('drops an unsafe CTA href while keeping the label readable', () => {
    const html = renderOffer(
      { headline: 'Cleaning package', ctaLabel: 'Claim it', ctaHref: 'javascript:x' },
      CTX,
    )

    expect(html).not.toContain('<a')
    expect(html).toContain('Claim it')
  })

  it('wraps content in a semantic <section> element of its own kind', () => {
    expect(renderOffer({ headline: 'Cleaning package' }, CTX)).toContain(
      '<section class="section section--offer">',
    )
  })
})

describe('renderTestimonials — social proof', () => {
  it('wraps each quote in a blockquote inside a figure so the attribution is associated', () => {
    const html = renderTestimonials(
      { items: [{ quote: 'Painless.', author: 'Priya', role: 'Patient' }] },
      CTX,
    )

    expect(html).toContain('<blockquote><p>Painless.</p></blockquote>')
    expect(html).toContain('<figcaption>Priya, <span class="role">Patient</span></figcaption>')
  })

  it('renders the author with no role span when only the author is present', () => {
    const html = renderTestimonials({ items: [{ quote: 'Painless.', author: 'Priya' }] }, CTX)

    expect(html).toContain('<figcaption>Priya</figcaption>')
    expect(html).not.toContain('class="role"')
    expect(html).not.toContain(',')
  })

  it('renders a role with no author WITHOUT the orphan leading comma', () => {
    // Reachable from ordinary model output: a model writing `name` instead of `author` has that
    // key dropped by normalization, leaving exactly this shape. The separator used to live in
    // `.role::before`, which cannot see the missing author, so this rendered as ', Cafe owner'.
    const html = renderTestimonials({ items: [{ quote: 'Warm.', role: 'Cafe owner' }] }, CTX)

    expect(html).toContain('<figcaption><span class="role">Cafe owner</span></figcaption>')
    expect(html).not.toContain(',')
  })

  it('omits the figcaption entirely when there is no author or role', () => {
    const html = renderTestimonials({ items: [{ quote: 'Painless.' }] }, CTX)

    expect(html).not.toContain('<figcaption>')
  })

  it('treats a whitespace-only author as absent, so no separator is emitted for it', () => {
    // `coerceText` already drops a blank author before the renderer sees it (pinned in
    // normalize/section-content-coercion.test.ts), so this shape only reaches here from a
    // hand-built draft. The renderer must still not print a comma with nothing in front of it.
    const html = renderTestimonials(
      { items: [{ quote: 'Warm.', author: '   ', role: 'Cafe owner' }] },
      CTX,
    )

    expect(html).toContain('<figcaption><span class="role">Cafe owner</span></figcaption>')
    expect(html).not.toContain(',')
  })

  it('emits no empty figcaption for a whitespace-only author with no role', () => {
    const html = renderTestimonials({ items: [{ quote: 'Warm.', author: '   ' }] }, CTX)

    expect(html).not.toContain('<figcaption>')
  })

  it('emits no <ul> for an empty items array', () => {
    expect(renderTestimonials({ headline: 'Reviews', items: [] }, CTX)).not.toContain('<ul')
  })

  it('skips an item with a blank quote because an attribution alone proves nothing', () => {
    const html = renderTestimonials(
      { items: [{ quote: '  ', author: 'Priya' }, { quote: 'Great.' }] },
      CTX,
    )

    expect(html.match(/<li>/g)).toHaveLength(1)
    expect(html).not.toContain('Priya')
  })
})

describe('renderFaq — question/answer pairs', () => {
  it('renders pairs as a dl/dt/dd so the association is semantic, not visual', () => {
    const html = renderFaq({ items: [{ q: 'Does it hurt?', a: 'No.' }] }, CTX)

    expect(html).toContain('<dl class="faq">')
    expect(html).toContain('<dt>Does it hurt?</dt><dd>No.</dd>')
  })

  it('emits no <dl> for an empty items array, rather than an empty definition list', () => {
    expect(renderFaq({ headline: 'FAQ', items: [] }, CTX)).not.toContain('<dl')
  })

  it('skips a pair missing its answer because a question with no answer is worse than nothing', () => {
    const html = renderFaq(
      {
        items: [
          { q: 'Does it hurt?', a: '  ' },
          { q: 'Parking?', a: 'Free.' },
        ],
      },
      CTX,
    )

    expect(html.match(/<dt>/g)).toHaveLength(1)
    expect(html).toContain('<dt>Parking?</dt>')
  })

  it('skips a pair missing its question, the mirror of the missing-answer case', () => {
    const html = renderFaq(
      {
        items: [
          { q: '  ', a: 'Free.' },
          { q: 'Parking?', a: 'Free.' },
        ],
      },
      CTX,
    )

    expect(html.match(/<dt>/g)).toHaveLength(1)
  })
})

describe('renderContact — the lead capture section', () => {
  it('includes the lead form when a form action is configured', () => {
    const html = renderContact(
      { headline: 'Get in touch' },
      buildCtx({ formAction: '/api/leads/x' }),
      true,
    )

    expect(html).toContain('<form class="lead-form"')
    expect(html).toContain('action="/api/leads/x"')
  })

  it('passes the submit label through to the form', () => {
    const html = renderContact(
      { headline: 'Get in touch', submitLabel: 'Request a callback' },
      buildCtx({ formAction: '/api/leads/x' }),
      true,
    )

    expect(html).toContain('>Request a callback</button>')
  })

  it('renders the copy but NO form when there is no endpoint, so no submission is silently discarded', () => {
    const html = renderContact(
      { headline: 'Get in touch', body: 'Call us.' },
      buildCtx({ formAction: null }),
      true,
    )

    expect(html).not.toContain('<form')
    expect(html).toContain('<h2>Get in touch</h2>')
    expect(html).toContain('<p>Call us.</p>')
  })

  it('renders the copy but NO form when the configured endpoint cannot receive a POST', () => {
    // `mailto:` is a valid href and a dead form action — renderLeadForm rejects it.
    const html = renderContact(
      { headline: 'Get in touch' },
      buildCtx({ formAction: 'mailto:hi@example.com' }),
      true,
    )

    expect(html).not.toContain('<form')
    expect(html).toContain('<h2>Get in touch</h2>')
  })

  it('carries the anchor id when it is the section awarded the document-wide #contact', () => {
    expect(renderContact({ headline: 'Get in touch' }, CTX, true)).toContain('id="contact"')
  })

  it('carries NO id when another section on the page already claimed #contact', () => {
    const html = renderContact({ headline: 'Or here' }, CTX, false)

    expect(html).not.toContain('id=')
    expect(html).toContain('<h2>Or here</h2>')
  })

  it('renders the form alone when there is an endpoint but no copy at all', () => {
    const html = renderContact({}, CTX, true)

    expect(html).toContain('<form class="lead-form"')
    expect(html).not.toContain('<h2>')
  })

  it('renders nothing when there is no copy and no endpoint', () => {
    expect(renderContact({}, buildCtx({ formAction: null }), true)).toBe('')
  })
})

describe('renderSection — the kind dispatcher', () => {
  const sectionOf = (section: NormalizedSection['section']): NormalizedSection => ({
    section,
    sort: 0,
    raw: {},
  })

  it('dispatches a hero to the hero renderer', () => {
    const html = renderSection(
      sectionOf({ kind: 'hero', content: { headline: 'Smile brighter' } }),
      CTX,
      true,
    )

    expect(html).toContain('<h1>Smile brighter</h1>')
  })

  it('dispatches features to the features renderer', () => {
    const html = renderSection(
      sectionOf({ kind: 'features', content: { items: [{ title: 'Painless' }] } }),
      CTX,
      true,
    )

    expect(html).toContain('<h3>Painless</h3>')
  })

  it('dispatches an offer to the offer renderer', () => {
    const html = renderSection(
      sectionOf({ kind: 'offer', content: { headline: 'Cleaning package' } }),
      CTX,
      true,
    )

    expect(html).toContain('section--offer')
  })

  it('dispatches testimonials to the testimonials renderer', () => {
    const html = renderSection(
      sectionOf({ kind: 'testimonials', content: { items: [{ quote: 'Painless.' }] } }),
      CTX,
      true,
    )

    expect(html).toContain('<blockquote><p>Painless.</p></blockquote>')
  })

  it('dispatches an faq to the faq renderer', () => {
    const html = renderSection(
      sectionOf({ kind: 'faq', content: { items: [{ q: 'Q?', a: 'A.' }] } }),
      CTX,
      true,
    )

    expect(html).toContain('<dt>Q?</dt>')
  })

  it('dispatches a contact section to the contact renderer', () => {
    const html = renderSection(
      sectionOf({ kind: 'contact', content: { headline: 'Get in touch' } }),
      CTX,
      true,
    )

    expect(html).toContain('id="contact"')
  })
})
