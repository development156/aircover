import { describe, it, expect } from 'vitest'
import { renderCta } from './cta'

describe('renderCta — a rejected URL drops the link, never emits a dangerous href (design §5 rule 2)', () => {
  it('renders an anchor when both the label and an http(s) href are present', () => {
    expect(renderCta('Book now', 'https://example.com/book')).toBe(
      '<a class="cta" href="https://example.com/book">Book now</a>',
    )
  })

  it('renders the label as inert text when the href is a javascript: URL, so the copy is not lost', () => {
    const html = renderCta('Book now', 'javascript:alert(1)')

    expect(html).toBe('<span class="cta cta--inert">Book now</span>')
    expect(html).not.toContain('javascript:')
  })

  it('renders the label as inert text when the href is a data: URL', () => {
    expect(renderCta('Book now', 'data:text/html,<script>alert(1)</script>')).toBe(
      '<span class="cta cta--inert">Book now</span>',
    )
  })

  it('renders the label as inert text when the model emitted no href at all', () => {
    expect(renderCta('Book now', undefined)).toBe('<span class="cta cta--inert">Book now</span>')
  })

  it('renders nothing when there is no label, because a CTA with no words is not a CTA', () => {
    expect(renderCta(undefined, 'https://example.com')).toBe('')
    expect(renderCta('   ', 'https://example.com')).toBe('')
  })

  it('trims the label, so surrounding whitespace does not ship into the anchor text', () => {
    expect(renderCta('  Book now  ', 'https://example.com')).toBe(
      '<a class="cta" href="https://example.com">Book now</a>',
    )
  })

  it('escapes a script payload in the label', () => {
    const html = renderCta('<script>alert(1)</script>', 'https://example.com')

    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;script&gt;')
  })

  it('allows mailto: and tel: because a lead CTA is often a phone number', () => {
    expect(renderCta('Call us', 'tel:+919876543210')).toContain('href="tel:+919876543210"')
    expect(renderCta('Email us', 'mailto:hi@example.com')).toContain('href="mailto:hi@example.com"')
  })
})
