import { describe, it, expect } from 'vitest'
import { renderLink } from './link'

/** Matches a real quoted event-handler attribute (` onclick="`), not escaped copy. */
const EVENT_HANDLER = /\son[a-z]+\s*=\s*["']/i

describe('renderLink — the single link-emitting path in the package (design §5 rule 2)', () => {
  it('renders an anchor for an http(s) url, carrying the class and the label', () => {
    expect(renderLink('https://example.com/book', 'Book now', 'cta')).toBe(
      '<a class="cta" href="https://example.com/book">Book now</a>',
    )
  })

  it('renders a span for a javascript: url, so no dangerous href ships but the copy survives', () => {
    const html = renderLink('javascript:alert(1)', 'Book now', 'cta cta--inert')

    expect(html).toBe('<span class="cta cta--inert">Book now</span>')
    expect(html).not.toMatch(/href=/i)
    expect(html).toContain('Book now')
  })

  it('renders a span when the href is absent, rather than an anchor with no destination', () => {
    expect(renderLink(undefined, 'Book now', 'cta cta--inert')).toBe(
      '<span class="cta cta--inert">Book now</span>',
    )
  })

  it('escapes the label on the anchor branch', () => {
    const html = renderLink('https://example.com', '<script>alert(1)</script>', 'cta')

    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapes the label on the span branch too, so the rejected path is not the unsafe one', () => {
    const html = renderLink('javascript:alert(1)', '<script>alert(1)</script>', 'cta')

    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;script&gt;')
  })

  it('runs an accepted url through escapeAttr, so a quote in it cannot close href=""', () => {
    // safeUrl accepts this — the scheme is https — and returns it unaltered. escapeAttr is
    // what stops the embedded quote from opening a second attribute. This is the exact
    // mistake that made a per-renderer `href="${safeUrl(x)}"` unsafe.
    const html = renderLink('https://example.com/?q="onmouseover="alert(1)', 'Book now', 'cta')

    expect(html).not.toMatch(EVENT_HANDLER)
    expect(html).toContain('&quot;')
  })

  it('escapes the class name, which is an interpolation like any other', () => {
    expect(renderLink('https://example.com', 'Book now', 'cta" onclick="x')).not.toMatch(
      EVENT_HANDLER,
    )
  })
})
