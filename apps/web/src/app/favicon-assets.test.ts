import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { describe, expect, test } from 'vitest'

/**
 * THE ICON BYTES, NOT THE TAGS THAT POINT AT THEM.
 *
 * `layout.test.tsx` checks that exactly one declaration exists and that the
 * three files are present. Present is not enough: the defect this whole change
 * fixes was a file that EXISTED and was the wrong shape. `favicon-dark.png` is
 * 594x508, so every tab strip, bookmark row, pinned tab and home-screen tile
 * squashed the mark by 15% while the file sat there passing an existence check.
 *
 * So these read the actual pixels. They are cheap, they run in the normal unit
 * leg, and they fail if somebody hand-edits an output instead of rerunning
 * `scripts/gen-favicons.mjs`.
 *
 * ── WHAT IT CANNOT SEE ──────────────────────────────────────────────────────
 *  · WHETHER THE ICON IS THE MARK. It reads dimensions, alpha and a colour
 *    histogram. A shapeless orange blob with the right proportions of clear and
 *    coloured pixels would pass every assertion here. Only a person looking at
 *    it can say the artwork is the Sahoda element, and only the founder can say
 *    it is the artwork he sent. The file he attached never reached the machine
 *    this was built on, so the source was reconstructed by filling the alpha
 *    channel of `favicon-dark.png` — the same artwork already committed here, as
 *    one solid shape — with `--acc`. Nothing in this file can tell that apart
 *    from his own bytes.
 *  · Whether Next actually emits the link tags. That is a build-time behaviour
 *    of the file conventions, not a property of the bytes; `layout.test.tsx`
 *    covers the half of it that lives in source, and the rendered `<head>` was
 *    checked by hand against a running server.
 *  · Any icon declared somewhere other than the root layout — a nested layout,
 *    a route's own `metadata`, or a raw `<link>` in a component. This reads four
 *    files by name and nothing enumerates the app for a second declaration.
 *  · `public/brand/favicon-dark.png` and `favicon-white.png`, which are still on
 *    disk and still used by `bottom-nav.tsx` as in-app images. They stopped
 *    being icons and nothing here would notice if they came back as one.
 */
const APP = dirname(fileURLToPath(import.meta.url))
const PUBLIC = join(APP, '..', '..', 'public', 'brand')

/** The outputs that get composited by an operating system, so must be opaque. */
const OPAQUE: ReadonlyArray<readonly [string]> = [
  [join(APP, 'apple-icon.png')],
  [join(PUBLIC, 'icon-192.png')],
  [join(PUBLIC, 'icon-512.png')],
]

/** How many pixels of a file are not fully opaque. */
async function seeThrough(path: string): Promise<number> {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let count = 0
  for (let i = 3; i < data.length; i += info.channels) if ((data[i] ?? 255) < 255) count++
  return count
}

/** Every square output, and the side it must have. */
const SQUARES: ReadonlyArray<readonly [string, number]> = [
  [join(APP, 'icon.png'), 512],
  [join(APP, 'apple-icon.png'), 180],
  [join(PUBLIC, 'icon-192.png'), 192],
  [join(PUBLIC, 'icon-512.png'), 512],
]

describe('the PNG icons', () => {
  test.each(SQUARES)('%s is exactly %ix that side, and square', async (path, side) => {
    const meta = await sharp(path).metadata()
    expect(meta.width).toBe(side)
    // Square is the whole point. A non-square icon is not a smaller mistake than
    // a missing one: it is the mistake that shipped, because it looks fine in a
    // file listing and wrong in every place a browser draws it.
    expect(meta.height).toBe(meta.width)
  })

  test.each(OPAQUE)('%s has no see-through pixel, because it gets composited', async (path) => {
    // Not cosmetic. iOS flattens a touch icon onto BLACK and an Android launcher
    // crops a maskable tile to its own shape; both need real pixels behind the
    // mark. `gen-favicons.mjs` composites these onto the dark canvas token for
    // exactly that reason, and this asserts it stayed done.
    expect(await seeThrough(path)).toBe(0)
  })

  test('the tab icon keeps its transparent ground, rather than a box', async () => {
    // THE REGRESSION THIS PINS, and it is the one that shipped once already.
    // A tab strip is light in one theme and dark in the other. An orange mark is
    // legible on both, so a solid ground here solves nothing and draws a square
    // around the mark on every tab. It became possible only once the mark was one
    // colour: while the right leaf was white, transparency hid half of it on a
    // light strip, and that is what a ground was covering up.
    const total = 512 * 512
    const clear = await seeThrough(join(APP, 'icon.png'))
    expect(clear / total).toBeGreaterThan(0.3)
  })

  test('is one colour, with no second leaf left white', async () => {
    // THE DEFECT THIS FILE WAS WRITTEN AFTER. The first version of this icon was
    // cut from `public/LOGOS/element.png`, which is the on-dark lockup: its left
    // leaf is orange and its RIGHT LEAF IS WHITE. On a light tab strip half the
    // mark simply was not there. Counting white pixels is what tells those two
    // artworks apart, and nothing else in this file would notice the difference.
    const { data, info } = await sharp(join(APP, 'icon.png'))
      .raw()
      .toBuffer({ resolveWithObject: true })
    let white = 0
    for (let i = 0; i < data.length; i += info.channels) {
      const a = info.channels === 4 ? (data[i + 3] ?? 255) : 255
      if (a > 200 && (data[i] ?? 0) > 230 && (data[i + 1] ?? 0) > 230 && (data[i + 2] ?? 0) > 230) {
        white++
      }
    }
    // A handful of pale anti-aliased pixels is fine; a whole leaf is 20% of the
    // square, so this bites long before it could be argued about.
    expect(white).toBeLessThan(512 * 512 * 0.01)
  })

  test('carries the brand orange, and it is the token rather than a sampled guess', async () => {
    // #ff6600 is `--acc` in packages/shared/tokens.css and the value the founder
    // named as the primary brand colour. The FIRST cut of this icon used #ff4b00,
    // the orange inside `public/LOGOS/element.png`, which is a different colour
    // and was the wrong artwork. If a future change repaints the icon again, this
    // fails and asks for that to be a decision rather than a side effect.
    const { data, info } = await sharp(join(APP, 'icon.png'))
      .raw()
      .toBuffer({ resolveWithObject: true })
    let orange = 0
    for (let i = 0; i < data.length; i += info.channels) {
      const a = info.channels === 4 ? (data[i + 3] ?? 255) : 255
      const r = data[i] ?? 0
      const g = data[i + 1] ?? 0
      const b = data[i + 2] ?? 0
      if (a > 200 && r > 250 && g > 92 && g < 112 && b < 12) orange++
    }
    expect(orange).toBeGreaterThan(512 * 512 * 0.3)
  })
})

/**
 * The ICO is hand-packed by `gen-favicons.mjs` because sharp cannot write one,
 * so it is the output most likely to be quietly malformed: a browser that
 * cannot parse it falls back silently and shows a blank page glyph. This reads
 * the container the way a browser does.
 */
describe('favicon.ico', () => {
  const bytes = readFileSync(join(APP, 'favicon.ico'))

  function entries() {
    expect(bytes.readUInt16LE(0), 'ICONDIR reserved word').toBe(0)
    expect(bytes.readUInt16LE(2), 'ICONDIR type, 1 = icon').toBe(1)
    const count = bytes.readUInt16LE(4)
    return Array.from({ length: count }, (_, i) => {
      const at = 6 + i * 16
      return {
        side: bytes.readUInt8(at) === 0 ? 256 : bytes.readUInt8(at),
        length: bytes.readUInt32LE(at + 8),
        offset: bytes.readUInt32LE(at + 12),
      }
    })
  }

  test('carries the three sizes a browser asks a tab, a bookmark and a pin for', () => {
    expect(entries().map((e) => e.side)).toEqual([16, 32, 48])
  })

  test('every member is a real image inside the file, at its declared size', async () => {
    for (const { side, offset, length } of entries()) {
      // Inside the file, not past its end. A directory entry pointing beyond the
      // buffer is the classic hand-packing bug and reads as a valid header.
      expect(offset + length).toBeLessThanOrEqual(bytes.length)
      const meta = await sharp(bytes.subarray(offset, offset + length)).metadata()
      expect(meta.width).toBe(side)
      expect(meta.height).toBe(side)
    }
  })
})

/**
 * The web manifest is the Android half, and its failure mode is silence: a
 * `src` that 404s or a `sizes` that lies is never reported anywhere. Chrome
 * simply picks something else and the home-screen tile is a scaled tab icon.
 * So every claim it makes is checked against the file it names.
 */
describe('site.webmanifest', () => {
  const manifest = JSON.parse(
    readFileSync(join(APP, '..', '..', 'public', 'site.webmanifest'), 'utf8'),
  ) as { icons: Array<{ src: string; sizes: string; purpose: string }> }

  test('names icons that exist, at the size each one claims', async () => {
    expect(manifest.icons.length).toBeGreaterThan(0)
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith('/'), `${icon.src} must be an absolute path`).toBe(true)
      const meta = await sharp(join(APP, '..', '..', 'public', icon.src)).metadata()
      expect(`${meta.width}x${meta.height}`, `${icon.src} is not ${icon.sizes}`).toBe(icon.sizes)
    }
  })

  test('offers both purposes, so a round launcher and a square one both work', () => {
    // `purpose: 'maskable'` alone means Chrome ALWAYS crops; `'any'` alone means
    // a round launcher crops an uncropped icon and clips the corners itself.
    // Both are declared per size. They would be one `'any maskable'` string if
    // Next's Manifest type allowed the pair, which it does not.
    const purposes = new Set(manifest.icons.map((i) => i.purpose))
    expect([...purposes].sort()).toEqual(['any', 'maskable'])
  })
})
