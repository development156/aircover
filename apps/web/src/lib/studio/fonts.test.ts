import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { beforeAll, describe, expect, test } from 'vitest'
import { paintOf, renderSvg, type SvgScene } from '@sahoda/shared'

import { BUNDLED_FAMILIES, registerStudioFonts, studioFontsDir } from './fonts'

/**
 * THE INK FINGERPRINT.
 *
 * ── THE GUARD THAT COULD NOT BE WRITTEN UNTIL NOW ───────────────────────────
 * `raster.test.ts` says in its own header that catching a substituted font
 * "needs a fingerprint: committed ink-width constants for known strings in the
 * font this product actually SHIPS, which cannot be written until a font is
 * chosen and bundled". The font is bundled. This is that guard.
 *
 * ── WHAT IT CATCHES, STATED EXACTLY ─────────────────────────────────────────
 * It catches the bundled fonts becoming unreachable: deleted, renamed, dropped
 * from the serverless bundle, or the registration silently failing. Any of
 * those makes the renderer fall back to whatever the machine has, and the ink
 * moves. Today that failure is INVISIBLE — fontconfig substitutes without a
 * word, which is the measurement `raster.test.ts` records.
 *
 * It does NOT pin one exact typeface for every character. The renderer does
 * per-character fallback across the whole font set, so a request for one family
 * legitimately draws another's glyphs for characters it lacks. The claim here is
 * narrower and is the one that matters: OUR FONTS ARE PRESENT AND IN USE.
 *
 * ── WHY A TOLERANCE AND NOT AN EQUALITY ─────────────────────────────────────
 * The numbers below were measured on this repository's sharp. A hinting or
 * libvips change can move them slightly without anything being wrong, and an
 * equality assertion would then fail for a reason nobody can act on. A
 * substitution moves them by far more than this window: the control at the
 * bottom MEASURES that distance rather than asserting it from memory.
 *
 * ── WHAT IT CANNOT SEE ──────────────────────────────────────────────────────
 * This file reads source (it scans `globals.css`), so it is a scanner and is
 * subject to `scripts/lib/scanner-registry.test.mjs`'s rule. What it misses:
 *
 *  · a `@font-face` reached any way its regex does not name — an `@import`ed
 *    stylesheet, a rule built by a Tailwind plugin, a `<style>` block in a
 *    component, or a font loaded through `next/font` in TypeScript. It reads
 *    ONE file and would certify a page whose real faces are declared elsewhere.
 *  · a `src:` with several `url()` entries. It checks that every URL it finds
 *    resolves to a file, so a rule listing a woff2 first and a ttf second would
 *    be caught by the format assertion but a rule with two ttfs would not tell
 *    you which one the browser picks.
 *  · whether the browser actually USES these faces. Everything here about the
 *    browser half is read off the CSS text; the ink measurements are the
 *    server's, through sharp. Nothing in this repository renders the preview in
 *    a real browser, so the two halves are proven to name the same files and
 *    are not proven to paint the same pixels. That needs Playwright.
 *  · a font file present, valid and WRONG — the right name over the wrong
 *    typeface. The fingerprints would shift and this would report a
 *    substitution, which is the correct alarm for the wrong reason.
 */

/** Greyscale ink means, MEASURED 2026-08-29 with the bundled Noto through sharp 0.35.3. */
const FINGERPRINT = {
  latin: 244.48836,
  latinBold: 238.52886,
  narrow: 249.25843,
  wide: 234.18421,
} as const

/** Wide enough to survive a hinting change, far narrower than a substitution. */
const TOLERANCE = 0.05

/**
 * Built through the REAL serialiser from integer colours, exactly as
 * `raster.test.ts` does, rather than from a hand-written string. Two reasons,
 * and only the first is the design lint: a fingerprint taken through a
 * different code path from the export is a fingerprint of the wrong thing.
 */
const PAPER = paintOf(255, 255, 255)!
const INK = paintOf(0, 0, 0)!

function markup(family: string, text: string, weight = 400): string {
  const scene: SvgScene = {
    width: 600,
    height: 120,
    background: PAPER,
    nodes: [
      {
        kind: 'text',
        x: 10,
        y: 70,
        text,
        fontFamily: family,
        fontSize: 40,
        fontWeight: weight,
        fill: INK,
      },
    ],
  }
  const svg = renderSvg(scene)
  if (svg === null) throw new Error('the probe scene should serialise')
  return svg
}

async function ink(family: string, text: string, weight = 400): Promise<number> {
  const png = await sharp(Buffer.from(markup(family, text, weight)))
    .png()
    .toBuffer()
  const stats = await sharp(png).greyscale().stats()
  return stats.channels[0]!.mean
}

describe('the bundled typefaces', () => {
  beforeAll(() => {
    // Before the first render in this process, which is the whole reason the
    // real app calls this from `instrumentation.ts`. A call after the first
    // rasterisation does nothing at all.
    registerStudioFonts()
  })

  test('the font files are really in the repository, not merely named', () => {
    const dir = studioFontsDir()
    expect(fs.existsSync(dir)).toBe(true)
    const files = fs.readdirSync(dir).filter((name) => name.endsWith('.ttf'))
    // `.ttf` specifically. A `.woff` here would be INDEXED by fontconfig and
    // render nothing, which is the trap this whole arrangement walked into once.
    expect(files.length).toBeGreaterThanOrEqual(4)
    for (const file of files) {
      expect(fs.statSync(path.join(dir, file)).size).toBeGreaterThan(50_000)
    }
  })

  test('registering is idempotent and points at a config that exists', () => {
    const first = registerStudioFonts()
    const second = registerStudioFonts()
    expect(first).toBe(second)
    if (first === null) throw new Error('the fonts should have registered')
    expect(fs.existsSync(first)).toBe(true)
    expect(process.env.FONTCONFIG_FILE).toBe(first)
  })

  test('the config adds our fonts without taking the system ones away', () => {
    const config = fs.readFileSync(process.env.FONTCONFIG_FILE as string, 'utf8')
    expect(config).toContain(studioFontsDir())
    expect(config).toContain('/usr/share/fonts')
  })

  test.each([
    ['latin', 'Noto Sans', 'Fresh samosas 1080', 400, FINGERPRINT.latin],
    ['latin bold', 'Noto Sans', 'Fresh samosas 1080', 700, FINGERPRINT.latinBold],
    ['narrow letters', 'Noto Sans', 'iiiiiiiiiiiiiiiiii', 400, FINGERPRINT.narrow],
    ['wide letters', 'Noto Sans', 'WWWWWWWWWWWWWWWWWW', 400, FINGERPRINT.wide],
  ])('%s draws the ink the bundled font draws', async (_label, family, text, weight, expected) => {
    expect(await ink(family, text, weight)).toBeCloseTo(expected, 1)
    expect(Math.abs((await ink(family, text, weight)) - expected)).toBeLessThan(TOLERANCE)
  })

  test('bold and regular are different files, so the weight is real', async () => {
    const regular = await ink('Noto Sans', 'Fresh samosas 1080', 400)
    const bold = await ink('Noto Sans', 'Fresh samosas 1080', 700)
    // Bold puts down more ink, so its mean is LOWER on a white ground.
    expect(bold).toBeLessThan(regular - 1)
  })

  /**
   * The control. Without it the fingerprints above pass for two reasons and
   * only one of them is the guard: they would look identical if the numbers had
   * been copied from a substituted render in the first place.
   */
  test('a substitution really does move the ink, by far more than the tolerance', async () => {
    const ours = await ink('Noto Sans', 'Fresh samosas 1080')
    const other = await ink('DejaVu Serif', 'Fresh samosas 1080')
    expect(Math.abs(ours - other)).toBeGreaterThan(TOLERANCE * 10)
  })

  test('every family the app names is one the bundle actually carries', () => {
    const files = fs.readdirSync(studioFontsDir()).join(' ').toLowerCase()
    for (const family of BUNDLED_FAMILIES) {
      expect(files, family).toContain(family.replace(/\s+/g, '').toLowerCase())
    }
  })

  test('Devanagari draws real glyphs rather than nothing', async () => {
    const blank = await ink('Noto Sans Devanagari', ' ')
    const hindi = await ink('Noto Sans Devanagari', 'ताज़ा समोसे')
    // A missing Indic font is the failure this catches: it renders as an empty
    // canvas or as boxes, and either way the ink is nowhere near the real one.
    expect(hindi).toBeLessThan(blank - 5)
  })
})

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE BROWSER HALF, AND THE DRIFT BETWEEN THE TWO.
 *
 * The server reads these files from disk and the browser downloads the same
 * ones over `/fonts/...`. Nothing links those two facts together at runtime, so
 * renaming a file fixes one side and silently breaks the other: the server
 * keeps rendering while the preview quietly falls back to whatever the reader's
 * machine has, and the person sees one typeface and exports another. That
 * failure is invisible by construction, which is why it gets a guard.
 */
describe('the CSS and the disk agree about the fonts', () => {
  const cssPath = path.join(studioFontsDir(), '..', '..', 'src/app/globals.css')
  const css = fs.readFileSync(cssPath, 'utf8')

  test('every file the CSS serves is really in the folder the server reads', () => {
    const urls = [...css.matchAll(/url\(['"]\/fonts\/([^'")]+)['"]\)/g)].map((m) => m[1] as string)
    // The rules exist at all. A zero-length list would make every assertion
    // below vacuously true, which is how this guard would rot into nothing.
    expect(urls.length).toBeGreaterThanOrEqual(4)
    for (const file of urls) {
      expect(fs.existsSync(path.join(studioFontsDir(), file)), `/fonts/${file}`).toBe(true)
    }
  })

  test('every family the templates ask for is declared to the browser', () => {
    for (const family of BUNDLED_FAMILIES) {
      expect(css, family).toContain(`font-family: '${family}'`)
    }
  })

  test('both weights are served, because the templates use 400 and 700', () => {
    const declared = [...css.matchAll(/@font-face\s*\{[^}]*\}/g)]
      .filter((match) => match[0].includes('/fonts/'))
      .map((match) => /font-weight:\s*(\d+)/.exec(match[0])?.[1])
    expect(new Set(declared)).toEqual(new Set(['400', '700']))
  })

  test('the browser is served the same FORMAT the server can read', () => {
    // woff2 would be lighter over the wire and unreadable by fontconfig, so the
    // two halves would stop being the same files. `fonts.ts` argues the trade.
    expect(css).not.toMatch(/url\(['"]\/fonts\/[^'")]+\.woff2?['"]\)/)
    expect(css).toMatch(/url\(['"]\/fonts\/[^'")]+\.ttf['"]\)/)
  })
})
