/**
 * Pins the EXACT public surface of `@sahoda/sites`.
 *
 * `src/index.ts` is what `package.json` names as the package entry, but every consumer inside
 * this package imports its collaborators directly -- so until this file existed, nothing in the
 * monorepo observed `index.ts` at all. Deleting a re-export and corrupting `SITES_PACKAGE` both
 * left the suite green and `tsc --noEmit` at exit 0.
 *
 * Three parts, and the last two are the ones that rot:
 *   POSITIVE  -- each name is present AND is the real implementation, not a re-pointed stub.
 *   EXACT     -- nothing else is exported. A key-set equality is the only form that fails when
 *                a name is ADDED, which is the direction a surface actually drifts.
 *   FORBIDDEN -- each internal named individually. The key-set pin already catches them, but it
 *                fails as an anonymous diff in a sorted array; these fail with the name and the
 *                reason, which is what a reviewer needs when someone re-exports a section
 *                renderer "just for one call site" and walks straight around the escape gate.
 */
import { describe, it, expect } from 'vitest'
import type { Result } from '@sahoda/shared'
import * as index from './index'
import * as escape from './render/escape'
import * as draftModule from './normalize/draft'
import * as toRowsModule from './map/to-rows'
import * as bundleModule from './render/bundle'
import * as formModule from './render/form'
import * as fixtureModule from './deploy/fixture'
import * as portModule from './deploy/port'
import * as themeModule from './theme/css'
import * as slugModule from './slug'
import { state, failedState, LOCAL_URL, FIXED_ISO } from './deploy/port-fixtures'

const expectOk = <T>(result: Result<T>): T => {
  if (!result.ok) {
    throw new Error(`expected ok, got ${result.error.code}: ${result.error.message}`)
  }
  return result.data
}

/**
 * The complete, intended VALUE export list. Adding a name here is a deliberate API decision.
 * Type-only exports are absent by construction -- they erase before `Object.keys` runs -- and
 * are checked by `tsc --noEmit` instead.
 */
const PUBLIC_SURFACE: ReadonlyArray<string> = [
  'SITES_PACKAGE',
  // render/escape -- the security gate
  'escapeHtml',
  'escapeAttr',
  'safeUrl',
  'stripControl',
  // normalize
  'normalizeDraft',
  // map
  'toRows',
  // render
  'renderBundle',
  'LEAD_FORM_FIELDS',
  // deploy
  'createFixtureDeployer',
  'SiteDeployStateSchema',
  'SiteDeployHistoryEntrySchema',
  // theme
  'themeCss',
  // slug
  'slugify',
  'resolveSlug',
  'RESERVED_SLUGS',
]

/** Deliberately internal, each with the reason it must stay internal. */
const FORBIDDEN_EXPORTS: ReadonlyArray<{ name: string; why: string }> = [
  {
    name: 'renderHero',
    why: 'section renderers are reachable only through renderBundle, which guarantees the escape pass',
  },
  {
    name: 'renderFeatures',
    why: 'section renderers are reachable only through renderBundle, which guarantees the escape pass',
  },
  {
    name: 'renderOffer',
    why: 'section renderers are reachable only through renderBundle, which guarantees the escape pass',
  },
  {
    name: 'renderTestimonials',
    why: 'section renderers are reachable only through renderBundle, which guarantees the escape pass',
  },
  {
    name: 'renderFaq',
    why: 'section renderers are reachable only through renderBundle, which guarantees the escape pass',
  },
  {
    name: 'renderContact',
    why: 'section renderers are reachable only through renderBundle, which guarantees the escape pass',
  },
  {
    name: 'renderSection',
    why: 'the kind dispatcher is bundle-internal; reaching it directly skips the document wrapper',
  },
  {
    name: 'renderDocument',
    why: 'a single page rendered outside the bundle would ship without the stylesheet',
  },
  {
    name: 'renderStylesheet',
    why: 'the stylesheet is bundle-internal and has no standalone consumer',
  },
  {
    name: 'renderLeadForm',
    why: 'form markup outside a rendered document would post to an unbound action',
  },
  {
    name: 'renderLink',
    why: 'the single link-emitting path is an internal invariant of the renderers, not a caller utility',
  },
  {
    name: 'renderCta',
    why: 'a CTA rendered outside a section carries no surrounding markup and no section class',
  },
  {
    name: 'normalizeSection',
    why: 'a section normalized outside normalizeDraft skips path dedupe and page bounds',
  },
  {
    name: 'normalizePath',
    why: 'raw normalizers let a caller build a draft that bypasses the traversal guard',
  },
  {
    name: 'pathToFile',
    why: 'raw normalizers let a caller build a draft that bypasses the traversal guard',
  },
  {
    name: 'isBundleFilePath',
    why: 'raw normalizers let a caller build a draft that bypasses the traversal guard',
  },
  {
    name: 'stylesheetHref',
    why: 'the depth-relative href is a property of the document renderer, not a caller-tunable knob',
  },
  {
    name: 'safeFontName',
    why: 'font sanitisation is document-internal; a caller reaching it is building markup by hand',
  },
  {
    name: 'appendHistory',
    why: 'history capping is the deployers job, and the schema cap is what a persisted value is checked against',
  },
  {
    name: 'DEPLOY_HISTORY_LIMIT',
    why: 'exposing the cap invites a caller to trim history itself instead of letting the schema reject',
  },
  {
    name: 'oklchToRgb',
    why: 'colour-space math is an implementation detail of the readability guard',
  },
  {
    name: 'rgbToOklch',
    why: 'colour-space math is an implementation detail of the readability guard',
  },
  {
    name: 'relativeLuminance',
    why: 'colour-space math is an implementation detail of the readability guard',
  },
  {
    name: 'contrastRatio',
    why: 'exposing it invites callers to reimplement the guard with a different threshold',
  },
]

describe('@sahoda/sites public surface', () => {
  it('exports exactly the intended names and nothing more', () => {
    expect(Object.keys(index).sort()).toEqual([...PUBLIC_SURFACE].sort())
  })

  it('uses explicit named re-exports only, because export * would leak internals silently', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const source = readFileSync(fileURLToPath(new URL('./index.ts', import.meta.url)), 'utf8')

    // Anchored to the start of a line so the prose in this file's own header -- which names
    // the forbidden form in backticks -- is not what makes the test pass.
    expect(source).not.toMatch(/^[ \t]*export[ \t]+\*/m)
  })

  it('does not leak the internal coerce helper, which would let a caller skip the escapers', () => {
    // Named separately from the key-set pin: this is the one the docblock argues for, so it
    // should fail by name rather than as an anonymous diff in a sorted array.
    expect(Object.hasOwn(index, 'coerce')).toBe(false)
    expect(Object.hasOwn(escape, 'coerce')).toBe(false)
  })

  it('does not leak the module-level limit or character-class constants', () => {
    const internals = [
      'MAX_URL_LENGTH',
      'URL_FORBIDDEN',
      'URL_FORBIDDEN_ALLOW_SPACE',
      'URL_SCHEME',
      'URL_AUTHORITY_SLASHES',
      'ALLOWED_SCHEMES',
      'CONTROL_CHARS',
      'INVISIBLE_CHARS',
      'LONE_SURROGATES',
      'HTML_CHARS',
      'HTML_ENTITIES',
      'ATTR_CHARS',
      'ATTR_ENTITIES',
      'MAX_TEXT_LENGTH',
      'MAX_ITEMS',
      'MAX_SOURCE_PAGES',
      'MAX_SECTIONS_PER_PAGE',
    ]

    expect(internals.filter((name) => Object.hasOwn(index, name))).toEqual([])
  })

  for (const forbidden of FORBIDDEN_EXPORTS) {
    it(`does not export ${forbidden.name} -- ${forbidden.why}`, () => {
      expect(Object.hasOwn(index, forbidden.name)).toBe(false)
    })
  }

  it('names the package identically to package.json, since callers key config off it', () => {
    expect(index.SITES_PACKAGE).toBe('@sahoda/sites')
  })

  /*
   * Identity, not just presence: a re-export rewired to a lookalike stub would satisfy the
   * key-set pin. These are the security gate, so the binding itself is the contract.
   */
  it('re-exports the real escapers, not lookalikes', () => {
    expect(index.escapeHtml).toBe(escape.escapeHtml)
    expect(index.escapeAttr).toBe(escape.escapeAttr)
    expect(index.safeUrl).toBe(escape.safeUrl)
    expect(index.stripControl).toBe(escape.stripControl)
  })

  it('re-exports the real pipeline bindings, not lookalikes', () => {
    expect(index.normalizeDraft).toBe(draftModule.normalizeDraft)
    expect(index.toRows).toBe(toRowsModule.toRows)
    expect(index.renderBundle).toBe(bundleModule.renderBundle)
    expect(index.LEAD_FORM_FIELDS).toBe(formModule.LEAD_FORM_FIELDS)
    expect(index.createFixtureDeployer).toBe(fixtureModule.createFixtureDeployer)
    expect(index.SiteDeployStateSchema).toBe(portModule.SiteDeployStateSchema)
    expect(index.SiteDeployHistoryEntrySchema).toBe(portModule.SiteDeployHistoryEntrySchema)
    expect(index.themeCss).toBe(themeModule.themeCss)
    expect(index.slugify).toBe(slugModule.slugify)
    expect(index.resolveSlug).toBe(slugModule.resolveSlug)
    expect(index.RESERVED_SLUGS).toBe(slugModule.RESERVED_SLUGS)
  })

  /*
   * One live assertion per escaper, reached through the package entry rather than through
   * `./render/escape`. If the entry point is ever rebuilt (a barrel, a bundler alias), these
   * fail on behaviour rather than on binding identity.
   */
  it('escapes html through the package entry', () => {
    expect(index.escapeHtml('<script>')).toBe('&lt;script&gt;')
  })

  it('escapes attributes through the package entry', () => {
    expect(index.escapeAttr('a"b')).toBe('a&quot;b')
  })

  it('rejects a dangerous url through the package entry', () => {
    expect(index.safeUrl('javascript:alert(1)')).toBeNull()
  })

  it('strips control characters through the package entry', () => {
    expect(index.stripControl('a\u200Bb')).toBe('ab')
  })

  /*
   * Behaviour through the entry for the rest of the surface. A `z.any()` or identity-function
   * stub satisfies both the key-set and the identity pins if someone also repoints the source
   * module, so each of these asserts a REJECTION as well as an accept -- a stub has to
   * reproduce the rule to stay green.
   */
  it('exposes a deploy state schema that still enforces the honesty rules', () => {
    expect(index.SiteDeployStateSchema.safeParse(state()).success).toBe(true)
    expect(index.SiteDeployStateSchema.safeParse(failedState()).success).toBe(true)
    // A live deploy with no url: "serving, with nothing to open".
    expect(index.SiteDeployStateSchema.safeParse(state({ url: null })).success).toBe(false)
    // A file:// path on one machine's disk, advertised as a public address.
    expect(index.SiteDeployStateSchema.safeParse(state({ preview: false })).success).toBe(false)
  })

  it('exposes a history entry schema that still refuses a public-labelled local url', () => {
    const honest = { bundleId: 'bundle-1', deployedAt: FIXED_ISO, url: LOCAL_URL }

    expect(index.SiteDeployHistoryEntrySchema.safeParse({ ...honest, preview: true }).success).toBe(
      true,
    )
    expect(
      index.SiteDeployHistoryEntrySchema.safeParse({ ...honest, preview: false }).success,
    ).toBe(false)
  })

  it('exposes the theme stub that throws rather than silently dropping a brand skin', () => {
    expect(index.themeCss(null)).toBe('')
    // The runtime guard is the half that survives a type widening, so it is what gets pinned.
    expect(() => index.themeCss({ primary: 'oklch(0.5 0.1 30)' } as unknown as null)).toThrow(
      /unimplemented/,
    )
  })

  it('exposes a slugify that folds and collapses rather than passing text through', () => {
    expect(index.slugify('  Café Süd & Co.  ')).toBe('cafe-sud-co')
  })

  it('exposes the reserved-slug set the collision walk consults', () => {
    expect(index.RESERVED_SLUGS.has('api')).toBe(true)
    expect(index.RESERVED_SLUGS.has('acme-chai')).toBe(false)
  })

  it('exposes a resolveSlug that actually walks past a taken root', async () => {
    const taken = new Set(['acme-chai'])
    const asked: string[] = []
    const isTaken = async (candidate: string): Promise<boolean> => {
      asked.push(candidate)
      return taken.has(candidate)
    }

    const result = await index.resolveSlug('Acme Chai', isTaken, 'trace-1')

    expect(expectOk(result)).toBe('acme-chai-2')
    expect(asked).toEqual(['acme-chai', 'acme-chai-2'])
  })

  it('exposes the lead form field contract the public route reads', () => {
    expect([...index.LEAD_FORM_FIELDS]).toEqual(['name', 'email', 'phone', 'message'])
  })
})
