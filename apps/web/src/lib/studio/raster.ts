import 'server-only'

import { createHash } from 'node:crypto'
import sharp from 'sharp'

/**
 * A DESIGN BECOMES BYTES.
 *
 * The browser draws the preview and this draws the export, from the SAME string:
 * `renderSvg` is a pure function in `@sahoda/shared` and both sides call it. So
 * the layout cannot drift between what a person approved and what they get.
 * TEXT can still drift, because the browser and this process resolve font
 * families against different sets and both substitute silently. That narrower
 * claim is the true one and `svg.ts`'s header carries it.
 *
 * ── THE SIZE IS CHECKED, NOT ASSUMED ────────────────────────────────────────
 * Sharp rasterises an SVG at a DENSITY, and the pixel size it lands on is a
 * function of that density and the document's own units rather than of the
 * width attribute alone. An export one pixel off the preset is not a cosmetic
 * problem: the Constraint Engine judges the bytes, so a 1079-wide "1080" export
 * is refused by a channel later, on a screen that cannot explain why. It is
 * cheaper to refuse here, where the reason is still in hand.
 *
 * ── AND NOTHING HERE TRUSTS SHARP'S ACCOUNT OF WHAT IT WROTE ────────────────
 * The dimensions asserted below are read back out of the finished PNG, not
 * taken from the pipeline that produced it. Everything downstream (the row, the
 * Constraint Engine, the library tile) is fed `sniffImage`'s reading of these
 * bytes, exactly as the upload path treats a browser's claims. `derive.ts` says
 * the same thing at greater length and for the same reason.
 */

/** Sharp's ceiling on decoded pixels. The defence against a small file that decodes to gigabytes. */
const MAX_PIXELS = 100_000_000

export type RasterResult =
  | { ok: true; bytes: Uint8Array; sha256: string; width: number; height: number }
  | { ok: false; reason: 'unrenderable' | 'wrong-size' }

/**
 * Rasterise a design's markup to PNG, and prove the result is the size asked for.
 *
 * PNG rather than JPEG, and that is a product decision rather than a default:
 * these are flat colour, hard edges and type, which is the exact case JPEG is
 * worst at. A JPEG export would put ringing around every letter of a price.
 *
 * The hash is taken here because the bytes are already in hand, and because
 * every caller needs it: `studio_exports` is keyed by it and the assets library
 * checks it before storing a second copy of the same picture.
 */
export async function rasterisePng(
  markup: string,
  expected: { width: number; height: number },
): Promise<RasterResult> {
  let png: Buffer
  try {
    png = await sharp(Buffer.from(markup), { limitInputPixels: MAX_PIXELS, failOn: 'error' })
      .png()
      .toBuffer()
  } catch {
    return { ok: false, reason: 'unrenderable' }
  }

  let width: number | undefined
  let height: number | undefined
  try {
    const meta = await sharp(png).metadata()
    width = meta.width
    height = meta.height
  } catch {
    return { ok: false, reason: 'unrenderable' }
  }

  if (width === undefined || height === undefined) return { ok: false, reason: 'unrenderable' }
  if (width !== expected.width || height !== expected.height) {
    return { ok: false, reason: 'wrong-size' }
  }

  return {
    ok: true,
    bytes: new Uint8Array(png),
    sha256: createHash('sha256').update(png).digest('hex'),
    width,
    height,
  }
}
