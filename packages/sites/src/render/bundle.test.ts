import { describe, it, expect } from 'vitest'
import type { DraftPage, SiteDraft } from '../normalize/draft'
import type { NormalizedSection } from '../normalize/section-content'
import type { BundleFile, SiteBundle } from '../deploy/port'
import type { RenderContext } from './context'
import { renderStylesheet } from './document'
import { renderBundle } from './bundle'

/**
 * The plan's `':root{--ink:#131313}'` fixture carries a raw hex literal, which this package
 * forbids, so it is restated in oklch. It is a STAND-IN and no end-to-end claim rests on it:
 * the real token set is `packages/shared/tokens.css`, which this package never reads and which
 * `src/deploy/bundle-deployable.test.ts` loads from disk for exactly that reason.
 */
const TOKENS_CSS = ':root{--ink:oklch(0.2 0 0)}'

const buildCtx = (overrides: Partial<RenderContext> = {}): RenderContext => ({
  siteName: 'Sharma Dental',
  tokensCss: TOKENS_CSS,
  theme: null,
  formAction: '/api/leads/sharma-dental',
  canonicalOrigin: null,
  ...overrides,
})

const hero = (headline: string): NormalizedSection => ({
  section: { kind: 'hero', content: { headline } },
  sort: 0,
  raw: { headline },
})

const buildPage = (overrides: Partial<DraftPage> = {}): DraftPage => ({
  path: '/',
  title: 'Home',
  seoDescription: 'Painless dentistry.',
  sort: 0,
  sections: [hero('Smile brighter')],
  ...overrides,
})

const aboutPage = (overrides: Partial<DraftPage> = {}): DraftPage =>
  buildPage({
    path: '/about',
    title: 'About',
    sort: 1,
    sections: [hero('Who we are')],
    ...overrides,
  })

const buildDraft = (overrides: Partial<SiteDraft> = {}): SiteDraft => ({
  name: 'Sharma Dental',
  goal: 'leads',
  pages: [buildPage(), aboutPage()],
  ...overrides,
})

const pathsOf = (draft: SiteDraft, ctx: RenderContext): string[] =>
  renderBundle(draft, ctx).files.map((file) => file.path)

/** Index by NAME, not by position: a mutation that reorders `files` must not slip through a
 *  `files[0]` that happens to still hold the right bytes. */
const fileAt = (bundle: SiteBundle, path: string): BundleFile => {
  const found = bundle.files.find((file) => file.path === path)
  if (found === undefined) {
    throw new Error(
      `expected a bundle file at ${path}, got ${bundle.files.map((file) => file.path).join(', ')}`,
    )
  }
  return found
}

describe('renderBundle -- file layout', () => {
  it('emits one html file per page at its pathToFile location, plus one stylesheet', () => {
    expect(pathsOf(buildDraft(), buildCtx())).toEqual([
      'index.html',
      'about/index.html',
      'styles.css',
    ])
  })

  it('maps the root page to index.html so the deploy target serves it at /', () => {
    expect(pathsOf(buildDraft({ pages: [buildPage()] }), buildCtx())).toEqual([
      'index.html',
      'styles.css',
    ])
  })

  it('nests a deep page under its own directories', () => {
    const draft = buildDraft({ pages: [buildPage(), aboutPage({ path: '/clinic/whitening' })] })

    expect(pathsOf(draft, buildCtx())).toContain('clinic/whitening/index.html')
  })

  it('labels html and css with charset-bearing content types so non-ASCII copy renders correctly', () => {
    const bundle = renderBundle(buildDraft(), buildCtx())

    expect(fileAt(bundle, 'index.html').contentType).toBe('text/html; charset=utf-8')
    expect(fileAt(bundle, 'about/index.html').contentType).toBe('text/html; charset=utf-8')
    expect(fileAt(bundle, 'styles.css').contentType).toBe('text/css; charset=utf-8')
  })

  it('puts each page its OWN rendered document, not a repeat of the first', () => {
    const bundle = renderBundle(buildDraft(), buildCtx())

    expect(fileAt(bundle, 'index.html').content).toContain('<h1>Smile brighter</h1>')
    expect(fileAt(bundle, 'index.html').content).toContain('<html lang="en">')
    expect(fileAt(bundle, 'about/index.html').content).toContain('<h1>Who we are</h1>')
    expect(fileAt(bundle, 'about/index.html').content).not.toContain('Smile brighter')
  })

  it('puts the layout stylesheet, not a document, in styles.css', () => {
    const ctx = buildCtx()
    const stylesheet = fileAt(renderBundle(buildDraft(), ctx), 'styles.css')

    expect(stylesheet.content).toBe(renderStylesheet(ctx))
    expect(stylesheet.content).toContain('--site-font-body')
    expect(stylesheet.content).toContain('.wrap{')
    expect(stylesheet.content).not.toContain('<!doctype html>')
  })
})

/**
 * The bundle is the only place both halves of the stylesheet contract are visible at once: the
 * href a page emits, and the file the bundle actually writes. A depth mismatch is invisible in
 * `document.test.ts` (which sees only the href) and invisible in a layout test (which sees only
 * the path) -- and it renders as an unstyled page rather than as an error, so nothing downstream
 * catches it either.
 */
describe('renderBundle -- every page can actually reach the stylesheet it links', () => {
  /** The document also links the Outfit webfont, so select the RELATIVE sheet rather than the
   *  first match, and require there to be exactly one -- two would mean the bundle's own sheet
   *  is being linked twice, or not at all with a lookalike passing for it. */
  const hrefOf = (content: string): string => {
    const local = [...content.matchAll(/<link rel="stylesheet" href="([^"]*)">/g)]
      .map((match) => match[1] ?? '')
      .filter((href) => !/^[a-z]+:/i.test(href))
    if (local.length !== 1 || local[0] === undefined) {
      throw new Error(`expected exactly one relative stylesheet link, got ${local.length}`)
    }
    return local[0]
  }

  /** Resolve the href against the page's own directory, the way a browser does. */
  const resolveFrom = (filePath: string, href: string): string => {
    const segments = filePath.split('/').slice(0, -1).concat(href.split('/'))
    const resolved: string[] = []
    for (const segment of segments) {
      if (segment === '..') resolved.pop()
      else resolved.push(segment)
    }
    return resolved.join('/')
  }

  it('resolves to the emitted styles.css from the root, a nested and a deep page alike', () => {
    const draft = buildDraft({
      pages: [
        buildPage(),
        aboutPage(),
        aboutPage({ path: '/clinic/whitening' }),
        aboutPage({ path: '/a/b/c/d' }),
      ],
    })
    const bundle = renderBundle(draft, buildCtx())
    const emitted = new Set(bundle.files.map((file) => file.path))

    for (const file of bundle.files.filter((entry) => entry.path.endsWith('index.html'))) {
      expect(resolveFrom(file.path, hrefOf(file.content))).toBe('styles.css')
    }
    expect(emitted.has('styles.css')).toBe(true)
  })

  it('climbs exactly one level from a one-segment page', () => {
    const bundle = renderBundle(buildDraft(), buildCtx())

    expect(fileAt(bundle, 'about/index.html').content).toContain('href="../styles.css"')
    expect(fileAt(bundle, 'index.html').content).toContain('href="styles.css"')
    expect(fileAt(bundle, 'index.html').content).not.toContain('href="/styles.css"')
  })
})

/**
 * Each of these produces a bundle `fixtureDeployer` refuses IN FULL -- so the cost of emitting
 * one is not a broken page, it is a deploy in which every page's bytes are discarded, reported
 * at the deploy boundary and attributed to the deployer long after the real defect. Throwing
 * here names the actual defect. See the module docblock for why this deviates from the plan.
 */
describe('renderBundle -- refuses to build a bundle no deployer would accept', () => {
  it('throws rather than emitting a lone stylesheet for a draft with no pages', () => {
    expect(() => renderBundle(buildDraft({ pages: [] }), buildCtx())).toThrow(/no page at \//)
  })

  it('throws when no page maps to index.html, so the site would have no entry document', () => {
    const draft = buildDraft({ pages: [aboutPage()] })

    expect(() => renderBundle(draft, buildCtx())).toThrow(/no page at \//)
  })

  it('throws when two pages claim one path, rather than letting one page overwrite the other', () => {
    const draft = buildDraft({ pages: [buildPage(), aboutPage(), aboutPage({ title: 'Team' })] })

    expect(() => renderBundle(draft, buildCtx())).toThrow(/duplicate/)
  })

  it('reports the conflicting positions and does NOT echo the untrusted path', () => {
    const draft = buildDraft({ pages: [buildPage(), aboutPage(), aboutPage()] })

    expect(() => renderBundle(draft, buildCtx())).toThrow(/positions 1 and 2/)
    expect(() => renderBundle(draft, buildCtx())).not.toThrow(/about/)
  })

  /** `normalizePath` accepts `/styles.css` -- the segment is plainly `[a-z0-9._-]` and is not a
   *  reserved name -- so this arrives from ordinary model output, not from a hand-built draft.
   *  It asks the writer for a directory `styles.css` beside the file `styles.css`. */
  it('throws when a page would need a directory named like the emitted stylesheet', () => {
    const draft = buildDraft({ pages: [buildPage(), aboutPage({ path: '/styles.css' })] })

    expect(() => renderBundle(draft, buildCtx())).toThrow(/styles\.css/)
    expect(() => renderBundle(draft, buildCtx())).toThrow(/position 1/)
  })

  it('propagates pathToFile rather than guessing a filename for an unnormalized path', () => {
    for (const path of ['/About', 'about', '/about/', '', '/a//b']) {
      expect(() => renderBundle(buildDraft({ pages: [buildPage({ path })] }), buildCtx())).toThrow(
        /normalized path/,
      )
    }
  })
})

describe('renderBundle -- bundleId is a content hash (the deploy identity)', () => {
  const idOf = (draft: SiteDraft, ctx: RenderContext = buildCtx()): string =>
    renderBundle(draft, ctx).bundleId

  it('is a 64-character lowercase hex sha256 digest', () => {
    expect(idOf(buildDraft())).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is identical for two structurally identical drafts, so an unchanged redeploy is detectable', () => {
    expect(idOf(buildDraft())).toBe(idOf(buildDraft()))
  })

  it('is not a constant: two different drafts do not share an id', () => {
    expect(idOf(buildDraft())).not.toBe(idOf(buildDraft({ pages: [buildPage()] })))
  })

  it('changes when a single headline changes, so a real edit is never mistaken for a no-op', () => {
    const before = idOf(buildDraft({ pages: [buildPage()] }))
    const after = idOf(buildDraft({ pages: [buildPage({ sections: [hero('Smile wider')] })] }))

    expect(after).not.toBe(before)
  })

  it('changes when the injected tokens change, because the emitted CSS differs', () => {
    expect(idOf(buildDraft(), buildCtx({ tokensCss: ':root{--ink:oklch(0 0 0)}' }))).not.toBe(
      idOf(buildDraft()),
    )
  })

  it('changes when the site name changes, because it reaches the title and the footer', () => {
    expect(idOf(buildDraft(), buildCtx({ siteName: 'Sharma Dental Care' }))).not.toBe(
      idOf(buildDraft()),
    )
  })

  it('changes when a page is added, so a new route forces a fresh deploy', () => {
    expect(idOf(buildDraft())).not.toBe(idOf(buildDraft({ pages: [buildPage()] })))
  })

  /** The two documents here are byte-identical -- same title, same sections, same one-level
   *  stylesheet href -- so only the PATH distinguishes the bundles. A digest taken over content
   *  alone reports a route rename as a no-op and the old route keeps serving. */
  it('changes when only a page path changes, though every rendered byte is the same', () => {
    const under = (path: string): string =>
      idOf(buildDraft({ pages: [buildPage(), aboutPage({ path })] }))
    const bundle = renderBundle(
      buildDraft({ pages: [buildPage(), aboutPage({ path: '/team' })] }),
      buildCtx(),
    )

    expect(fileAt(bundle, 'team/index.html').content).toBe(
      fileAt(renderBundle(buildDraft(), buildCtx()), 'about/index.html').content,
    )
    expect(under('/team')).not.toBe(under('/about'))
  })

  it('is independent of page ordering, because the file SET is what gets served', () => {
    const forward = buildDraft()
    const reversed = buildDraft({ pages: [...forward.pages].reverse() })

    expect(idOf(reversed)).toBe(idOf(forward))
    expect(pathsOf(reversed, buildCtx())).not.toEqual(pathsOf(forward, buildCtx()))
  })
})
