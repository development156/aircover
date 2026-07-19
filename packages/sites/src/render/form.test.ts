import { describe, it, expect } from 'vitest'
import type { RenderContext } from './context'
import { LEAD_FORM_FIELDS, renderLeadForm } from './form'

const EVENT_HANDLER = /\son[a-z]+\s*=\s*["']/i

const buildCtx = (overrides: Partial<RenderContext> = {}): RenderContext => ({
  siteName: 'Sharma Dental',
  tokensCss: ':root{--ink:#131313}',
  theme: null,
  formAction: '/api/leads/sharma-dental',
  canonicalOrigin: null,
  ...overrides,
})

/** Every `name="…"` in the markup, in document order. */
const fieldNames = (html: string): string[] =>
  [...html.matchAll(/name="([^"]*)"/g)].map((match) => match[1] ?? '')

describe('renderLeadForm — a plain HTML POST, no inline JavaScript (design §5 rule 3)', () => {
  it('emits exactly the four LEAD_FORM_FIELDS, in order, and nothing else', () => {
    const html = renderLeadForm('Send enquiry', buildCtx())

    expect(fieldNames(html)).toEqual(['name', 'email', 'phone', 'message'])
    expect(LEAD_FORM_FIELDS).toEqual(['name', 'email', 'phone', 'message'])
  })

  it('posts to the injected endpoint with method="post"', () => {
    const html = renderLeadForm('Send enquiry', buildCtx({ formAction: '/api/leads/x' }))

    expect(html).toContain('<form class="lead-form" method="post" action="/api/leads/x">')
  })

  it('gives the email field type="email" so the browser validates it before the round trip', () => {
    const html = renderLeadForm('Send enquiry', buildCtx())

    expect(html).toContain('<input type="email" name="email"')
  })

  it('gives the phone field type="tel" so mobile keyboards switch to the numeric pad', () => {
    expect(renderLeadForm('Send enquiry', buildCtx())).toContain('<input type="tel" name="phone"')
  })

  it('marks name and email required, and leaves phone and message optional', () => {
    const html = renderLeadForm('Send enquiry', buildCtx())

    expect(html).toMatch(/<input type="text" name="name"[^>]*\srequired>/)
    expect(html).toMatch(/<input type="email" name="email"[^>]*\srequired>/)
    expect(html).not.toMatch(/name="phone"[^>]*\srequired/)
    expect(html).not.toMatch(/name="message"[^>]*\srequired/)
  })

  it('renders message as a textarea because a lead message is multi-line', () => {
    expect(renderLeadForm('Send enquiry', buildCtx())).toContain('<textarea name="message"')
  })

  it('gives the message textarea rows="4" so it reads as a paragraph box, not a one-liner', () => {
    expect(renderLeadForm('Send enquiry', buildCtx())).toContain(
      '<textarea name="message" rows="4"',
    )
  })

  // maxlength is a bound on visitor input: shrinking it truncates a real person's message in
  // the browser with nothing to notice. Pin the exact number on every control, not just its
  // presence, and pin the control COUNT so a field that loses the attribute cannot hide.
  it('caps every one of the four controls at maxlength="2000"', () => {
    const html = renderLeadForm('Send enquiry', buildCtx())

    expect([...html.matchAll(/maxlength="([^"]*)"/g)].map((m) => m[1])).toEqual([
      '2000',
      '2000',
      '2000',
      '2000',
    ])
  })

  // A `<span>` that merely exists SOMEWHERE proves nothing: swapping the Name and Email
  // labels leaves all four present while the email box is captioned "Name". Each label must
  // sit immediately before its own control, inside the same <label> element.
  it.each([
    ['Name', '<input type="text" name="name"'],
    ['Email', '<input type="email" name="email"'],
    ['Phone', '<input type="tel" name="phone"'],
    ['Message', '<textarea name="message"'],
  ])("captions the %s control with its own label, not another field's", (label, control) => {
    const html = renderLeadForm('Send enquiry', buildCtx())

    expect(html).toContain(`<label class="field"><span>${label}</span>${control}`)
  })

  it('contains no <script and no event-handler attribute', () => {
    const html = renderLeadForm('Send enquiry', buildCtx())

    expect(html).not.toContain('<script')
    expect(html).not.toMatch(EVENT_HANDLER)
  })

  it('escapes the form action in attribute context so it cannot break out of action="…"', () => {
    const html = renderLeadForm(
      'Send enquiry',
      buildCtx({ formAction: '/x"><script>alert(1)</script>' }),
    )

    expect(html).not.toContain('<script')
    // The payload must survive entirely INSIDE action="…" — no raw quote, `<` or `>` may
    // appear in the attribute value, which is the only way it could break out of the tag.
    // (A bare `"><` check would false-positive on the form tag's own `">` before `<label`.)
    const action = /action="([^"]*)"/.exec(html)?.[1]
    expect(action).toBe('/x&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;')
    // The first `>` in the document is the one that closes the <form> tag: nothing the
    // payload contained terminated the tag early.
    expect(html.slice(0, html.indexOf('>') + 1)).toBe(
      `<form class="lead-form" method="post" action="${action}">`,
    )
  })

  it('escapes the submit label', () => {
    const html = renderLeadForm('<script>alert(1)</script>', buildCtx())

    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;script&gt;')
  })

  it('renders NO <form> element at all when there is no endpoint, so nothing is silently discarded', () => {
    expect(renderLeadForm('Send enquiry', buildCtx({ formAction: null }))).toBe('')
  })

  it('never falls back to a placeholder action when the endpoint is missing', () => {
    const html = renderLeadForm('Send enquiry', buildCtx({ formAction: null }))

    expect(html).not.toContain('<form')
    expect(html).not.toContain('action=')
  })

  // Every value below produces a form that LOOKS like it works and destroys the lead, or one
  // that ships the lead somewhere it must never go. A visitor types their phone number, hits
  // send, sees a page reload — and the founder never learns the enquiry existed. Omitting the
  // form is the only honest outcome, so each of these must take the same exit as `null`.
  it.each([
    ['an empty string — posts to the page itself (a file:// asset under the fixture deployer)', ''],
    ['whitespace only — same as empty once the browser resolves it', '   '],
    ['a fragment on a path — still resolves to the current document', '#contact'],
    ['a bare fragment — posts to the current document, not to any endpoint', '#'],
    ['javascript: — runs code instead of submitting', 'javascript:alert(1)'],
    ['JavaScript: — the same, dodging a case-sensitive check', 'JavaScript:alert(1)'],
    ['data: — submits into an attacker-authored document', 'data:text/html,<h1>hi'],
    ['protocol-relative — ships every lead off-origin while reading like a path', '//evil.com/x'],
    ['backslash-authority — WHATWG resolves this off-origin too', '/\\evil.com/x'],
    ['a schemeless bare word — resolves against the current directory and 404s', 'api/leads'],
    ['a dot-relative path — resolves against the current directory too', './api/leads'],
    ['a parent-relative path — same, one directory up', '../api/leads'],
    // mailto:/tel: are valid HREFs and safeUrl allows them for that reason. As a form ACTION
    // they destroy the lead exactly like '#' does: method="post" to tel: delivers nothing at
    // all, and mailto: at best opens a mail client with an empty body. safeUrl is an href
    // validator; a form action needs its own scheme policy.
    ['mailto: — a POST cannot deliver to a mail client', 'mailto:leads@x.com'],
    ['MAILTO: — the same, dodging a case-sensitive check', 'MAILTO:leads@x.com'],
    ['MaIlTo: — mixed case, same scheme', 'MaIlTo:leads@x.com'],
    ['tel: — a POST to a phone number delivers nothing', 'tel:+91 98765 43210'],
    ['TEL: — the same, dodging a case-sensitive check', 'TEL:+919876543210'],
    ['a bare http: scheme with no authority — resolves to the current document', 'http:'],
    ['a bare https: scheme with no authority — same', 'https:'],
    [
      'https: with a relative tail — still resolves against the current document',
      'https:api/leads',
    ],
    ['http: with a single slash — not an authority, resolves relative', 'http:/api/leads'],
  ])('emits no form at all when the action is %s', (_reason, formAction) => {
    const html = renderLeadForm('Send enquiry', buildCtx({ formAction }))

    expect(html).toBe('')
  })

  it.each([
    ['a root-relative path — the real contract shape', '/api/leads/x', '/api/leads/x'],
    ['an absolute https endpoint', 'https://api.sahoda.com/leads', 'https://api.sahoda.com/leads'],
    ['a padded path, trimmed rather than rejected', '  /api/leads/x  ', '/api/leads/x'],
    [
      'an uppercase HTTPS scheme — case is not a reason to drop a working endpoint',
      'HTTPS://api.sahoda.com/leads',
      'HTTPS://api.sahoda.com/leads',
    ],
    ['a plain http endpoint', 'http://api.sahoda.com/leads', 'http://api.sahoda.com/leads'],
    ['a root-relative path carrying a query', '/api/leads?src=site', '/api/leads?src=site'],
  ])('still posts to %s', (_reason, formAction, expected) => {
    const html = renderLeadForm('Send enquiry', buildCtx({ formAction }))

    expect(html).toContain(`action="${expected}"`)
  })

  it('falls back to a default submit label when the model supplied a blank one', () => {
    expect(renderLeadForm('   ', buildCtx())).toContain('>Send enquiry</button>')
  })

  it('labels every field so the form is usable with a screen reader', () => {
    const html = renderLeadForm('Send enquiry', buildCtx())

    for (const label of ['Name', 'Email', 'Phone', 'Message']) {
      expect(html).toContain(`<span>${label}</span>`)
    }
  })
})
