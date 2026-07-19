import { describe, it, expect } from 'vitest'
import type { ThemeTokens } from '@sahoda/shared'
import type { DraftPage } from '../normalize/draft'
import { UNTITLED_SITE } from '../normalize/draft'
import type { NormalizedSection } from '../normalize/section-content'
import type { RenderContext } from './context'
import { renderDocument, renderStylesheet, safeFontName, stylesheetHref } from './document'

/**
 * A deliberately tiny stand-in for packages/shared/tokens.css. The real file already defines
 * `--pstrong`, which would make the "no theme block" assertion below meaningless. Written in
 * oklch, not hex, because this package forbids a raw hex literal anywhere — fixtures included.
 */
const TOKENS_CSS = ':root{--ink:oklch(0.2 0 0);--bg:oklch(1 0 0)}'

const XSS = '<script>alert(1)</script>'
/**
 * Matches a real QUOTED event-handler attribute (` onclick="`). The trailing quote is
 * load-bearing: correctly escaped output still contains the literal text ` onerror=`,
 * because `x" onerror="alert(1)` escapes to `x&quot; onerror=&quot;alert(1)`. Without the
 * quote this pattern fails on output that is provably safe.
 */
const EVENT_HANDLER = /\son[a-z]+\s*=\s*["']/i

const THEME: ThemeTokens = {
  primary: 'oklch(0.62 0.18 250)',
  primaryFg: 'oklch(1 0 0)',
  secondary: 'oklch(0.5 0.05 250)',
  accent: 'oklch(0.7 0.15 60)',
  surface: ['oklch(1 0 0)', 'oklch(0.98 0 0)', 'oklch(0.95 0 0)', 'oklch(0.9 0 0)'],
  text: { hi: 'oklch(0.2 0 0)', mid: 'oklch(0.45 0 0)', low: 'oklch(0.6 0 0)' },
  border: 'oklch(0.9 0 0)',
  success: 'oklch(0.7 0.15 150)',
  warning: 'oklch(0.8 0.15 80)',
  danger: 'oklch(0.6 0.2 25)',
  radius: '12px',
  fontHeading: 'Outfit',
  fontBody: 'Outfit',
} as unknown as ThemeTokens

/**
 * `RenderContext.theme` is narrowed to `null` for this wave (see `context.ts`), so a populated
 * theme cannot be assigned without a cast. The cast is the point, exactly as in
 * `theme/css.test.ts`: it simulates the widening, so the font guard is exercised for real today
 * instead of being pinned only by a comment. `renderStylesheet` never calls `themeCss`, so this
 * does not smuggle a populated theme past the Task 9 runtime guard — `renderDocument` still
 * throws on one, which is pinned below.
 */
const asNarrowedTheme = (theme: ThemeTokens): null => theme as unknown as null

const buildCtx = (overrides: Partial<RenderContext> = {}): RenderContext => ({
  siteName: 'Sharma Dental',
  tokensCss: TOKENS_CSS,
  theme: null,
  formAction: '/api/leads/sharma-dental',
  canonicalOrigin: null,
  ...overrides,
})

const heroSection = (headline: string, subhead: string): NormalizedSection => ({
  section: {
    kind: 'hero',
    content: { headline, subhead, ctaLabel: 'Book now', ctaHref: '/#contact' },
  },
  sort: 0,
  raw: { headline, subhead },
})

const buildPage = (overrides: Partial<DraftPage> = {}): DraftPage => ({
  path: '/',
  title: 'Home',
  seoDescription: 'Painless dentistry in Indiranagar.',
  sort: 0,
  sections: [heroSection('Smile brighter', 'Same-day appointments')],
  ...overrides,
})

describe('renderDocument — escaping gate (design §5: a prompt-injected script would run on the tenant origin)', () => {
  it('escapes a script payload in the site name so the <title> cannot execute it', () => {
    const html = renderDocument(buildPage({ title: '  ' }), buildCtx({ siteName: XSS }))

    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapes a script payload in the page title so the <title> cannot execute it', () => {
    const html = renderDocument(buildPage({ title: XSS }), buildCtx())

    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapes the site name in og:site_name and in the footer, not only in the title', () => {
    const html = renderDocument(buildPage(), buildCtx({ siteName: XSS }))

    expect(html).not.toContain('<script')
    expect(html).toContain(`<meta property="og:site_name" content="&lt;script&gt;`)
    expect(html).toContain('<p class="fine">&#169; &lt;script&gt;')
  })

  it('escapes the seo description in attribute context so it cannot break out of content="…"', () => {
    const payload = 'nice x"><script>alert(1)</script>'
    const html = renderDocument(buildPage({ seoDescription: payload }), buildCtx())

    expect(html).not.toContain('<script')
    // NOT `not.toContain('">' + '<')`, which the plan asked for: correct output contains that
    // pair at EVERY tag boundary (`content="…"><meta`), so the assertion could never hold and
    // said nothing about the payload. Pin the payload's own breakout instead.
    expect(html).not.toContain('x"><')
    expect(html).toContain('content="nice x&quot;&gt;&lt;script&gt;')
  })

  it('contains no <script tag anywhere even when every text field carries a payload', () => {
    const html = renderDocument(
      buildPage({ title: XSS, seoDescription: XSS, sections: [heroSection(XSS, XSS)] }),
      buildCtx({ siteName: XSS, canonicalOrigin: 'https://sharma.sahoda.site' }),
    )

    expect(html).not.toContain('<script')
  })

  it('contains no event-handler attribute anywhere — v0 ships zero inline JavaScript', () => {
    const payload = 'x" onerror="alert(1)'
    const html = renderDocument(
      buildPage({
        title: payload,
        seoDescription: payload,
        sections: [heroSection(payload, payload)],
      }),
      buildCtx({ siteName: payload }),
    )

    expect(html).not.toMatch(EVENT_HANDLER)
  })
})

describe('renderDocument — head shell', () => {
  it('inlines tokens.css verbatim so custom properties resolve before first paint', () => {
    const html = renderDocument(buildPage(), buildCtx())

    expect(html).toContain(`<style>${TOKENS_CSS}`)
  })

  it('refuses to emit a style block whose injected css would close the tag early', () => {
    const ctx = buildCtx({
      tokensCss: ':root{--ink:oklch(0 0 0)}</style><script>alert(1)</script>',
    })

    expect(() => renderDocument(buildPage(), ctx)).toThrow(/tokensCss/)
  })

  it('emits no theme override block when the workspace has no active theme (the default path — workspace_themes is never seeded)', () => {
    const html = renderDocument(buildPage(), buildCtx({ theme: null }))

    expect(html).not.toContain('--pstrong')
  })

  /**
   * UNSKIP WHEN TASKS 7-9 LAND. `themeCss` is a stub that throws on a populated theme and
   * `RenderContext.theme` is typed `null`, so this cannot pass today. It is skipped rather than
   * deleted: deleting it ships the brand-override behaviour unpinned forever once the real
   * derivation arrives. The `asNarrowedTheme` cast comes out at the same time.
   */
  it.skip('emits the derived brand override block when an active theme is present', () => {
    const html = renderDocument(buildPage(), buildCtx({ theme: asNarrowedTheme(THEME) }))

    expect(html).toContain('--pstrong')
    expect(html).toContain('--t300')
  })

  it('throws rather than rendering a page that silently drops a populated brand theme', () => {
    expect(() => renderDocument(buildPage(), buildCtx({ theme: asNarrowedTheme(THEME) }))).toThrow(
      /unimplemented/i,
    )
  })

  it('emits a viewport meta so generated sites are responsive always (docs/06 §4.6)', () => {
    const html = renderDocument(buildPage(), buildCtx())

    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">')
  })

  it('emits a lang attribute on <html> so screen readers pick the right voice', () => {
    const html = renderDocument(buildPage(), buildCtx())

    expect(html).toContain('<html lang="en">')
  })

  it('falls back to the site name when the page title is blank (invariant #6: title has no .min(1))', () => {
    const html = renderDocument(
      buildPage({ title: '   ' }),
      buildCtx({ siteName: 'Sharma Dental' }),
    )

    expect(html).toContain('<title>Sharma Dental</title>')
  })

  it('falls back to the untitled-site label when the page title AND the site name are both blank', () => {
    const html = renderDocument(buildPage({ title: '' }), buildCtx({ siteName: '  ' }))

    expect(html).toContain(`<title>${UNTITLED_SITE}</title>`)
  })

  it('omits the description meta entirely when mesh emitted no seo block, rather than an empty one', () => {
    const html = renderDocument(buildPage({ seoDescription: null }), buildCtx())

    expect(html).not.toContain('name="description"')
    expect(html).not.toContain('og:description')
  })

  it('omits the description meta when the seo block held only whitespace', () => {
    const html = renderDocument(buildPage({ seoDescription: '   ' }), buildCtx())

    expect(html).not.toContain('name="description"')
    expect(html).not.toContain('og:description')
  })

  it('synthesises og:title and og:description from the page because mesh only emits seo.description', () => {
    const html = renderDocument(
      buildPage({ title: 'Home', seoDescription: 'Painless dentistry.' }),
      buildCtx(),
    )

    expect(html).toContain('<meta property="og:title" content="Home">')
    expect(html).toContain('<meta property="og:description" content="Painless dentistry.">')
    expect(html).toContain('<meta property="og:type" content="website">')
  })

  it('omits canonical and og:url when no origin is injected, rather than inventing a plausible URL', () => {
    const html = renderDocument(buildPage(), buildCtx({ canonicalOrigin: null }))

    expect(html).not.toContain('rel="canonical"')
    expect(html).not.toContain('og:url')
  })

  it('builds canonical and og:url from the injected origin joined to the page path', () => {
    const html = renderDocument(
      buildPage({ path: '/about' }),
      buildCtx({ canonicalOrigin: 'https://sharma.sahoda.site/' }),
    )

    expect(html).toContain('<link rel="canonical" href="https://sharma.sahoda.site/about">')
    expect(html).toContain('<meta property="og:url" content="https://sharma.sahoda.site/about">')
  })

  it('builds the home canonical with a trailing slash rather than a bare origin', () => {
    const html = renderDocument(
      buildPage({ path: '/' }),
      buildCtx({ canonicalOrigin: 'https://sharma.sahoda.site' }),
    )

    expect(html).toContain('<link rel="canonical" href="https://sharma.sahoda.site/">')
  })

  it('drops canonical when the injected origin is not an http(s) URL, rather than emitting a dangerous href', () => {
    const html = renderDocument(buildPage(), buildCtx({ canonicalOrigin: 'javascript:alert(1)' }))

    expect(html).not.toContain('rel="canonical"')
    expect(html).not.toContain('javascript:')
  })

  it.each([
    ['mailto:hi@example.com', 'a scheme safeUrl allows but a page cannot live at'],
    ['tel:+91 98765 43210', 'ditto for tel:'],
    ['//sharma.sahoda.site', 'protocol-relative'],
    ['/sharma', 'site-relative, so it has no origin at all'],
    ['https:sharma.sahoda.site', 'an allowed scheme with no authority'],
    ['', 'blank'],
    ['   ', 'whitespace only'],
  ])('drops canonical for the origin %j (%s)', (origin) => {
    const html = renderDocument(
      buildPage({ path: '/about' }),
      buildCtx({ canonicalOrigin: origin }),
    )

    expect(html).not.toContain('rel="canonical"')
    expect(html).not.toContain('og:url')
  })

  it('escapes the canonical href, because safeUrl permits a double quote inside a URL', () => {
    const html = renderDocument(
      buildPage({ path: '/' }),
      buildCtx({ canonicalOrigin: 'https://x.site/"onmouseover=alert(1)' }),
    )

    expect(html).not.toContain('site/"onmouseover')
    expect(html).toContain('&quot;onmouseover=')
  })

  it.each([
    [`https://${'a'.repeat(2100)}.site`, 'past safeUrl’s 2048-character cap'],
    ['https://x.site/\u0001', 'carries a control character'],
    ['https://x.site/a\u200bb', 'carries a zero-width space'],
  ])('drops canonical when the joined url is %s (%s)', (origin) => {
    const html = renderDocument(
      buildPage({ path: '/about' }),
      buildCtx({ canonicalOrigin: origin }),
    )

    expect(html).not.toContain('rel="canonical"')
    expect(html).not.toContain('og:url')
  })

  it('renders each section into <main> in draft order', () => {
    const html = renderDocument(
      buildPage({
        sections: [heroSection('Smile brighter', 'Same-day'), heroSection('Second', 'Later')],
      }),
      buildCtx(),
    )

    expect(html).toContain('<main>')
    expect(html).toContain('<h1>Smile brighter</h1>')
    expect(html.indexOf('Smile brighter')).toBeLessThan(html.indexOf('Second'))
  })
})

/**
 * CORRECTION (A). The plan pinned a root-absolute `/styles.css` "so a nested page does not
 * resolve it under its own folder". That is HTTP-correct and file://-FATAL: the fixture deployer
 * hands the founder `file:///<outDir>/<slug>/index.html`, and a browser resolves `/styles.css`
 * from that document against the FILESYSTEM ROOT (`file:///styles.css`), so every layout rule in
 * the sheet is missing and the preview is unstyled full-bleed serif text. A depth-relative href
 * resolves correctly under BOTH file:// and http://, so it is strictly better, not a
 * fixture-only hack. The depth comes from `pathToFile` — the SAME normalized path the bundle
 * writes the file at — so the href and the file location cannot drift apart.
 */
describe('renderDocument — depth-relative stylesheet href', () => {
  it('links a sibling stylesheet from the home page, whose file is index.html', () => {
    const html = renderDocument(buildPage({ path: '/' }), buildCtx())

    expect(html).toContain('<link rel="stylesheet" href="styles.css">')
  })

  it('climbs one level from a nested page, whose file is about/index.html', () => {
    const html = renderDocument(buildPage({ path: '/about' }), buildCtx())

    expect(html).toContain('<link rel="stylesheet" href="../styles.css">')
    expect(html).not.toContain('href="/styles.css"')
  })

  it('climbs two levels from a twice-nested page, whose file is a/b/index.html', () => {
    const html = renderDocument(buildPage({ path: '/a/b' }), buildCtx())

    expect(html).toContain('<link rel="stylesheet" href="../../styles.css">')
  })

  it('never emits a root-absolute stylesheet href at any depth, because file:// cannot resolve it', () => {
    for (const path of ['/', '/about', '/a/b', '/a/b/c']) {
      expect(renderDocument(buildPage({ path }), buildCtx())).not.toContain('href="/styles.css"')
    }
  })

  it.each([
    ['/', 'styles.css'],
    ['/about', '../styles.css'],
    ['/a/b', '../../styles.css'],
    ['/a/b/c', '../../../styles.css'],
  ])('stylesheetHref(%j) is %j', (path, expected) => {
    expect(stylesheetHref(path)).toBe(expected)
  })

  it('throws on a path the bundle would not write, rather than guessing a depth', () => {
    expect(() => stylesheetHref('about')).toThrow(/normalized path/)
  })
})

describe('safeFontName — a CSS-injection guard on a model/theme-supplied family name', () => {
  it('keeps a plain multi-word family name', () => {
    expect(safeFontName('Playfair Display')).toBe('Playfair Display')
  })

  it('trims surrounding whitespace rather than rejecting the name over it', () => {
    expect(safeFontName('  Inter  ')).toBe('Inter')
  })

  it.each([
    ["x';}body{display:none}'", 'closes the declaration and injects a rule'],
    ['Inter;color:red', 'a bare semicolon'],
    ['Inter"', 'a double quote'],
    ["Inter'", 'a single quote'],
    ['Inter}', 'a closing brace'],
    ['Inter{', 'an opening brace'],
    ['Inter/*x*/', 'a comment'],
    ['Inter\\3c', 'a css escape'],
    ['9Inter', 'does not start with a letter'],
    ['', 'blank'],
    ['   ', 'whitespace only'],
    ['-Inter', 'starts with a hyphen'],
    ['A'.repeat(41), 'over the length cap'],
  ])('falls back to Outfit for %j (%s)', (raw) => {
    const name = safeFontName(raw)

    expect(name).toBe('Outfit')
  })

  it('falls back to Outfit for a non-string, because the theme column is untrusted at runtime', () => {
    for (const bogus of [null, undefined, 42, {}, ['Inter']]) {
      expect(safeFontName(bogus)).toBe('Outfit')
    }
  })
})

describe('renderStylesheet — layout sheet, font names allowlisted', () => {
  it('uses the theme font names when they are plain alphanumeric', () => {
    const css = renderStylesheet(
      buildCtx({
        theme: asNarrowedTheme({ ...THEME, fontHeading: 'Playfair Display', fontBody: 'Inter' }),
      }),
    )

    expect(css).toContain("--site-font-heading:'Playfair Display'")
    expect(css).toContain("--site-font-body:'Inter'")
  })

  it('falls back to Outfit when a font name carries CSS-breaking characters, so it cannot inject a rule', () => {
    const css = renderStylesheet(
      buildCtx({ theme: asNarrowedTheme({ ...THEME, fontBody: "x';}body{display:none}'" }) }),
    )

    expect(css).not.toContain('display:none')
    expect(css).toContain("--site-font-body:'Outfit'")
  })

  it('falls back to Outfit for both families when there is no active theme (docs/07 Brand Kit)', () => {
    const css = renderStylesheet(buildCtx({ theme: null }))

    expect(css).toContain("--site-font-heading:'Outfit'")
    expect(css).toContain("--site-font-body:'Outfit'")
  })

  it('names a real fallback stack after the family, because a fixture preview has no network', () => {
    const css = renderStylesheet(buildCtx())

    expect(css).toContain("--site-font-body:'Outfit',ui-sans-serif")
    expect(css).toContain("--site-font-heading:'Outfit',ui-sans-serif")
    expect(css).toContain('sans-serif}')
  })

  it('contains a responsive grid rule so section lists reflow on narrow screens', () => {
    const css = renderStylesheet(buildCtx())

    expect(css).toContain('grid-template-columns:repeat(auto-fit')
  })

  it('styles every class the section renderers actually emit', () => {
    const css = renderStylesheet(buildCtx())

    for (const selector of [
      '.wrap',
      '.section',
      '.grid',
      '.cta',
      '.lede',
      '.faq',
      '.price',
      '.role',
      '.field',
      '.lead-form',
      '.fine',
    ]) {
      expect(css).toContain(selector)
    }
  })

  it('injects no generated content, so a separator cannot reappear beside the renderer\'s', () => {
    // The attribution separator lived here as `.role::before{content:", "}` and printed a comma
    // for a role with no author in front of it — CSS cannot see the missing author. It now lives
    // in `renderTestimonials`, which can. Re-adding a `content:` here would not resurrect the
    // orphan comma but would DOUBLE the one the renderer emits, so the sheet stays content-free.
    // The assertion is on `content:`, not on `::before`: a pseudo-element selector is fine and
    // the box-sizing reset legitimately uses one. `content:` is the only way a stylesheet writes
    // TEXT into the page, which is the mechanism that produced the orphan comma.
    const css = renderStylesheet(buildCtx())

    expect(css).not.toContain('content:')
  })

  it('carries no raw hex colour — every colour is a design token', () => {
    expect(renderStylesheet(buildCtx())).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})
