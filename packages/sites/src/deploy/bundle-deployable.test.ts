import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import type { SiteGenerateOutput } from '@sahoda/shared'
import { normalizeDraft } from '../normalize/draft'
import { renderBundle } from '../render/bundle'
import type { RenderContext } from '../render/context'
import { createFixtureDeployer, type WriteBundleFile } from './fixture'
import { context, unwrapOk } from './fixture-harness'

/**
 * The one test in this package that runs the WHOLE chain with nothing hand-built between the
 * links: real model-shaped output -> `normalizeDraft` -> `renderBundle` -> the real
 * `fixtureDeployer`.
 *
 * Every other deploy suite feeds the deployer a bundle literal, which means they pin the
 * deployer's guards without ever pinning that this package can SATISFY them. Those guards
 * refuse a bundle in full -- no `index.html`, a duplicate path, a directory/file collision --
 * so a `renderBundle` that violated one would not degrade, it would make every deploy fail,
 * and a suite of hand-built bundles would stay green throughout.
 *
 * ## The tokens are read from disk on purpose
 *
 * `tokensCss` is caller-injected and this package never reads a file, so every other fixture
 * uses a one-declaration stand-in. A stand-in is fine for a unit test and worthless here: it
 * carries none of `--p`, `--bg`, `--s1` or `--t300`, so a page rendered against it is broken in
 * exactly the way an end-to-end check exists to detect, while passing. This reads the real
 * `packages/shared/tokens.css`.
 */
const TOKENS_CSS = readFileSync(
  fileURLToPath(new URL('../../../shared/tokens.css', import.meta.url)),
  'utf8',
)

const OUT_DIR = '/tmp/sahoda-preview'
const SLUG = 'acme-chai'

const generation: SiteGenerateOutput = {
  pages: [
    {
      path: '/',
      title: 'Acme Chai',
      seo: { description: 'Masala chai, brewed fresh in Indiranagar.' },
      sections: [
        { kind: 'hero', content: { headline: 'Chai worth the walk', ctaLabel: 'Order now' } },
        {
          kind: 'features',
          content: { items: [{ title: 'Fresh leaf', body: 'Nilgiri, weekly.' }] },
        },
      ],
    },
    {
      path: '/menu',
      title: 'Menu',
      sections: [{ kind: 'offer', content: { headline: 'Cutting chai', priceNote: '₹30' } }],
    },
    {
      path: '/visit/indiranagar',
      title: 'Visit us',
      sections: [{ kind: 'contact', content: { headline: 'Say hello' } }],
    },
  ],
}

const buildCtx = (overrides: Partial<RenderContext> = {}): RenderContext => ({
  siteName: 'Acme Chai',
  tokensCss: TOKENS_CSS,
  theme: null,
  formAction: `/api/leads/${SLUG}`,
  canonicalOrigin: 'https://acme-chai.sahoda.site',
  ...overrides,
})

const draftOf = (output: SiteGenerateOutput = generation) => {
  const result = normalizeDraft(output, {
    name: 'Acme Chai',
    goal: 'leads',
    maxPages: 8,
    traceId: 'trace-bundle-deployable',
  })
  if (!result.ok) throw new Error(`normalizeDraft refused the fixture: ${result.error.message}`)
  return result.data.draft
}

const capturingWriter = (): {
  writeFile: WriteBundleFile
  written: () => Map<string, string>
} => {
  const written = new Map<string, string>()
  return {
    writeFile: async (path, content) => {
      written.set(path, content)
    },
    written: () => written,
  }
}

describe('renderBundle output is deployable by the real fixtureDeployer', () => {
  it('deploys ok and writes every emitted file under the site directory', async () => {
    const writer = capturingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile: writer.writeFile })
    const bundle = renderBundle(draftOf(), buildCtx())

    const state = unwrapOk(await deploy(bundle, context('trace-bundle-deployable', { slug: SLUG })))

    expect(state.status).toBe('live')
    expect(state.preview).toBe(true)
    expect(state.url).toBe(`file://${OUT_DIR}/${SLUG}/index.html`)
    expect(state.bundleId).toBe(bundle.bundleId)
    expect([...writer.written().keys()].sort()).toEqual(
      [
        `${OUT_DIR}/${SLUG}/index.html`,
        `${OUT_DIR}/${SLUG}/menu/index.html`,
        `${OUT_DIR}/${SLUG}/styles.css`,
        `${OUT_DIR}/${SLUG}/visit/indiranagar/index.html`,
      ].sort(),
    )
  })

  /** The url the deployer hands back is a `file://` path, so the stylesheet href in the page it
   *  points at must resolve on the FILESYSTEM. A root-absolute href resolves to `/styles.css`
   *  at the filesystem root, which no bundle ever writes -- and the page renders as unstyled
   *  text rather than as an error, so nothing else in the chain would report it. */
  it('links a stylesheet that exists on disk from every deployed page', async () => {
    const writer = capturingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile: writer.writeFile })

    await deploy(
      renderBundle(draftOf(), buildCtx()),
      context('trace-bundle-deployable', { slug: SLUG }),
    )
    const written = writer.written()

    for (const [path, content] of written) {
      if (!path.endsWith('index.html')) continue
      const href = /<link rel="stylesheet" href="((?![a-z]+:)[^"]*)">/.exec(content)?.[1]
      expect(href).toBeDefined()
      const resolved = new URL(href ?? '', `file://${path}`).pathname

      expect(written.has(resolved)).toBe(true)
      expect(resolved).toBe(`${OUT_DIR}/${SLUG}/styles.css`)
    }
  })

  it('deploys the REAL tokens, so the page has the variables its layout rules reference', async () => {
    const writer = capturingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile: writer.writeFile })

    await deploy(
      renderBundle(draftOf(), buildCtx()),
      context('trace-bundle-deployable', { slug: SLUG }),
    )
    const home = writer.written().get(`${OUT_DIR}/${SLUG}/index.html`) ?? ''
    const sheet = writer.written().get(`${OUT_DIR}/${SLUG}/styles.css`) ?? ''

    // Each of these is referenced by a rule in styles.css; an inlined stand-in that omits one
    // renders a page whose layout silently falls back to an initial value.
    for (const token of ['--p:', '--pfg:', '--bg:', '--ink:', '--s1:', '--line:', '--muted:']) {
      expect(home).toContain(token)
    }
    expect(sheet).toContain('var(--bg)')
    expect(home).toContain('<h1>Chai worth the walk</h1>')
  })

  /** A section renderer that reached markup outside `renderBundle` would bypass the escaping
   *  gate. This pins that hostile model copy is still escaped at the far end of the chain. */
  it('escapes model copy all the way through to the bytes on disk', async () => {
    const writer = capturingWriter()
    const deploy = createFixtureDeployer({ outDir: OUT_DIR, writeFile: writer.writeFile })
    const hostile: SiteGenerateOutput = {
      pages: [
        {
          path: '/',
          title: 'Acme <script>alert(1)</script>',
          sections: [{ kind: 'hero', content: { headline: '<img src=x onerror=alert(1)>' } }],
        },
      ],
    }

    await deploy(
      renderBundle(draftOf(hostile), buildCtx()),
      context('trace-bundle-deployable', { slug: SLUG }),
    )
    const home = writer.written().get(`${OUT_DIR}/${SLUG}/index.html`) ?? ''

    expect(home).not.toContain('<script>alert(1)</script>')
    expect(home).not.toContain('<img src=x')
    expect(home).toContain('&lt;script&gt;')
    expect(home).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })
})
