/**
 * EVERY SIZE OF THE SAHODA MARK, FROM ONE SOURCE FILE.
 *
 * The favicon was `public/brand/favicon-dark.png` and `favicon-white.png`, a pair
 * of 594x508 single-colour silhouettes chosen by `prefers-color-scheme`. Three
 * things were wrong with that and this script fixes all three at once:
 *
 *   1. **594x508 is not square.** A tab strip, a bookmark row and a pinned tab
 *      all draw into a square box, so every one of them was squashing the mark
 *      by 15%. Nothing in the repo resized it to the sizes browsers actually
 *      ask for (16, 32, 48), so each of those was a browser's own downscale of
 *      a 594px image: soft at the size it is read at most.
 *   2. **There was no Apple touch icon at all.** `layout.tsx` recorded that as a
 *      deliberate hold, because iOS composites a touch icon into a square and
 *      pointing it at a 594x508 file hands Apple the exact distortion. The hold
 *      was correct; the answer is to produce a real square, which is what this
 *      does.
 *   3. **The mark was not the brand mark.** It was a black-or-white silhouette.
 *      `public/LOGOS/element.png` is the actual Sahoda Labs element, in the
 *      brand orange, and it is what the icon is now cut from.
 *
 * ── IT ONLY PADS AND RESIZES ────────────────────────────────────────────────
 * The artwork is never redrawn, recoloured or cropped. `contain` fits the whole
 * mark inside the square with a margin, so nothing is ever cut off, and Lanczos3
 * does the downscale. The one thing it adds is a GROUND, and that is measured:
 * the element is two-tone, `#ff4b00` on the left leaf and `#ffffff` on the right
 * one, so on a light tab strip half of it would be invisible. `public/LOGOS/` is
 * the on-dark set. `--canvas` in dark (`#0d0d0d`) is the ground it was drawn for,
 * and an opaque ground is required by iOS anyway, which composites transparency
 * to black.
 *
 * Run `node scripts/gen-favicons.mjs` after replacing the source file. It writes
 * every output listed in OUTPUTS and nothing else; `favicon-sources.test.ts`
 * fails if an output is missing or stops being square.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire('/home/user/sahodalabs/apps/web/package.json')
const sharp = require('sharp')

/** The artwork. Replace this file to change the icon; do not edit the outputs. */
const SOURCE = 'public/LOGOS/element.png'

/** `--canvas` in dark, from packages/shared/tokens.css. See the header. */
const GROUND = { r: 0x0d, g: 0x0d, b: 0x0d, alpha: 1 }

/**
 * How much of the square the mark is allowed to fill.
 *
 * The tab sizes run tight (0.86) because at 16px every pixel of margin is 6% of
 * the icon and the mark stops being readable. iOS gets more room (0.70) because
 * it rounds the corners itself and a mark that runs to the edge loses its
 * shoulders to that mask.
 */
const TIGHT = 0.86
const APPLE = 0.7

async function square(size, fill) {
  const inner = Math.round(size * fill)
  const mark = await sharp(SOURCE)
    .resize(inner, inner, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: 'lanczos3',
    })
    .png()
    .toBuffer()
  return sharp({ create: { width: size, height: size, channels: 4, background: GROUND } })
    .composite([{ input: mark, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toBuffer()
}

/**
 * ICO, hand-packed, because sharp cannot write one.
 *
 * A 6-byte ICONDIR, then one 16-byte ICONDIRENTRY per size, then the PNG bytes.
 * PNG-inside-ICO rather than BMP: every browser this product supports reads it,
 * and a BMP payload would need its own AND-mask and bottom-up rows for nothing.
 * A side of 256 is written as 0 by the format; nothing here is that large, but
 * the modulo is what the spec says and leaving it out is a trap for the next
 * person who adds a size.
 */
function ico(images) {
  const dir = Buffer.alloc(6 + images.length * 16)
  dir.writeUInt16LE(0, 0)
  dir.writeUInt16LE(1, 2)
  dir.writeUInt16LE(images.length, 4)
  let offset = dir.length
  images.forEach(({ size, data }, i) => {
    const at = 6 + i * 16
    dir.writeUInt8(size % 256, at)
    dir.writeUInt8(size % 256, at + 1)
    dir.writeUInt8(0, at + 2)
    dir.writeUInt8(0, at + 3)
    dir.writeUInt16LE(1, at + 4)
    dir.writeUInt16LE(32, at + 6)
    dir.writeUInt32LE(data.length, at + 8)
    dir.writeUInt32LE(offset, at + 12)
    offset += data.length
  })
  return Buffer.concat([dir, ...images.map((i) => i.data)])
}

/**
 * Where each output goes and why it exists.
 *
 * The three under `app/` are Next file conventions: Next emits the `<link>` tags
 * itself, reads the real pixel dimensions for `sizes`, and fingerprints the URL.
 * That is deliberately the ONLY declaration — `metadata.icons` was removed in the
 * same change, because two declarations of the same thing is how the dark variant
 * silently won over the light one for a year.
 *
 * The two under `public/brand/` are for the web manifest, which needs stable
 * paths that a fingerprinted route cannot give it.
 */
const OUTPUTS = [
  { path: 'apps/web/src/app/icon.png', size: 512, fill: TIGHT },
  { path: 'apps/web/src/app/apple-icon.png', size: 180, fill: APPLE },
  { path: 'apps/web/public/brand/icon-192.png', size: 192, fill: TIGHT },
  { path: 'apps/web/public/brand/icon-512.png', size: 512, fill: TIGHT },
]

/** The sizes a browser actually requests for a tab, a bookmark and a pinned tab. */
const ICO_SIZES = [16, 32, 48]

for (const { path, size, fill } of OUTPUTS) {
  mkdirSync(dirname(path), { recursive: true })
  const data = await square(size, fill)
  writeFileSync(path, data)
  console.log(`${path}  ${size}x${size}  ${data.length} bytes`)
}

const members = []
for (const size of ICO_SIZES) members.push({ size, data: await square(size, TIGHT) })
const icoPath = 'apps/web/src/app/favicon.ico'
const icoBytes = ico(members)
writeFileSync(icoPath, icoBytes)
console.log(`${icoPath}  ${ICO_SIZES.join('/')}  ${icoBytes.length} bytes`)
