/**
 * EVERY SIZE OF THE SAHODA MARK, FROM ONE SOURCE FILE.
 *
 * The favicon was `public/brand/favicon-dark.png` and `favicon-white.png`, a pair
 * of 594x508 single-colour silhouettes chosen by `prefers-color-scheme`. Three
 * things were wrong with that and this script fixes all three at once:
 *
 *   1. **594x508 is not square.** A tab strip, a bookmark row, a pinned tab and
 *      a home-screen tile all draw into a square box, so every one of them was
 *      squashing the mark by 15%. Nothing resized it to the sizes browsers
 *      actually ask for (16, 32, 48), so each of those was a browser's own
 *      downscale of a 594px image: soft at the size it is read at most.
 *   2. **There was no Apple touch icon at all.** `layout.tsx` recorded that as a
 *      deliberate hold, because iOS composites a touch icon into a square and
 *      pointing it at a 594x508 file hands Apple the exact distortion. The hold
 *      was correct; the answer is to produce a real square, which is what this
 *      does.
 *   3. **The mark was not the brand mark.** It was black or white, never orange.
 *
 * ── THE SOURCE, AND HOW IT WAS ARRIVED AT ────────────────────────────────────
 * `apps/web/public/brand/icon-source.png` is the mark as the founder sent it:
 * BOTH leaves in the brand orange, on a transparent ground.
 *
 * The file he attached never reached the machine this was built on, so its bytes
 * could not be used. What was used instead is `favicon-dark.png`, which is the
 * SAME artwork already in this repository as one solid shape, and its alpha
 * channel is therefore the exact outline of both leaves. Filling that outline
 * with `#ff6600` gives the mark he sent. `#ff6600` is not a sample and not a
 * guess: it is `--acc` in `packages/shared/tokens.css` and the value he named
 * himself as the primary brand colour. **No outline was drawn and no curve was
 * traced.**
 *
 * If his orange turns out to be a different value, or the artwork differs in any
 * other way, the whole remedy is: overwrite `icon-source.png` with his file and
 * run this script. Nothing else in the repository names a colour or a shape.
 *
 * ── WHAT THE SCRIPT ITSELF DOES ──────────────────────────────────────────────
 * It pads to square and resizes. Nothing is redrawn, recoloured or cropped:
 * `contain` fits the whole mark inside the square with a margin, so no part of
 * it is ever cut off, and Lanczos3 does the downscale.
 *
 * The ground differs by output, and each is a requirement rather than a taste:
 *
 *   · TAB ICONS KEEP THE TRANSPARENT GROUND. A tab strip is light in one theme
 *     and dark in the other, and one orange mark is legible on both, so there is
 *     nothing for a ground to solve and a solid square would only be a box
 *     around the mark. This is why the icon had to become one colour before it
 *     could be transparent: while the right leaf was white it disappeared on a
 *     light tab strip.
 *   · APPLE AND THE MASKABLE TILES GET AN OPAQUE ONE. iOS composites a touch
 *     icon onto BLACK, and an Android launcher crops a maskable icon to its own
 *     shape; both need real pixels behind the mark. It is `--canvas` in dark,
 *     `#0d0d0d`, which is the product's own ground.
 *
 * Run `node scripts/gen-favicons.mjs` after replacing the source. It writes
 * every output listed in OUTPUTS and nothing else; `favicon-assets.test.ts`
 * fails if an output goes missing, stops being square, or loses its ground.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire('/home/user/sahodalabs/apps/web/package.json')
const sharp = require('sharp')

/** The artwork. Replace this file to change the icon; do not edit the outputs. */
const SOURCE = 'apps/web/public/brand/icon-source.png'

/** `--canvas` in dark, from packages/shared/tokens.css. See the header. */
const OPAQUE = { r: 0x0d, g: 0x0d, b: 0x0d, alpha: 1 }
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 }

/**
 * How much of the square the mark is allowed to fill.
 *
 * The tab sizes run tight (0.94) because at 16px every pixel of margin is 6% of
 * the icon and the mark stops being readable; with a transparent ground there is
 * no box for it to crowd, so the margin only has to keep the edges from touching.
 * iOS gets far more room (0.70) because it rounds the corners itself and a mark
 * that runs to the edge loses its shoulders to that mask.
 */
const TIGHT = 0.94
const APPLE = 0.7

async function square(size, fill, ground) {
  const inner = Math.round(size * fill)
  const mark = await sharp(SOURCE)
    .resize(inner, inner, { fit: 'contain', background: CLEAR, kernel: 'lanczos3' })
    .png()
    .toBuffer()
  return sharp({ create: { width: size, height: size, channels: 4, background: ground } })
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
  { path: 'apps/web/src/app/icon.png', size: 512, fill: TIGHT, ground: CLEAR },
  { path: 'apps/web/src/app/apple-icon.png', size: 180, fill: APPLE, ground: OPAQUE },
  { path: 'apps/web/public/brand/icon-192.png', size: 192, fill: APPLE, ground: OPAQUE },
  { path: 'apps/web/public/brand/icon-512.png', size: 512, fill: APPLE, ground: OPAQUE },
]

/** The sizes a browser actually requests for a tab, a bookmark and a pinned tab. */
const ICO_SIZES = [16, 32, 48]

for (const { path, size, fill, ground } of OUTPUTS) {
  mkdirSync(dirname(path), { recursive: true })
  const data = await square(size, fill, ground)
  writeFileSync(path, data)
  console.log(`${path}  ${size}x${size}  ${data.length} bytes`)
}

const members = []
for (const size of ICO_SIZES) members.push({ size, data: await square(size, TIGHT, CLEAR) })
const icoPath = 'apps/web/src/app/favicon.ico'
const icoBytes = ico(members)
writeFileSync(icoPath, icoBytes)
console.log(`${icoPath}  ${ICO_SIZES.join('/')}  ${icoBytes.length} bytes`)
