import 'server-only'

/**
 * A flat, opaque, rounded-corner rectangle, as PNG bytes ready to composite.
 *
 * ── WHY THIS IS ITS OWN FILE ─────────────────────────────────────────────────
 * `sharp({ create: … })` draws a flat rectangle but has no radius parameter, so
 * a rounded one has to come from somewhere else. An SVG string, rasterised by
 * sharp itself, is that somewhere: it is the one shape sharp can turn a corner
 * radius into without a second image library in the tree. Pulled out of
 * `stamp.ts` so that file stays about the pixels of ONE picture rather than
 * also owning a string of markup.
 *
 * ── WHY THE FILL IS ALWAYS FULLY OPAQUE ──────────────────────────────────────
 * `needsPlate` in `logo-placement.ts` is a 4.5:1 contrast guarantee against the
 * measured backdrop. That guarantee is computed assuming the plate is the only
 * colour between the backdrop and the mark; a translucent plate would let the
 * backdrop bleed back through and silently break the ratio the caller already
 * decided it needed. So there is no alpha parameter here, on purpose. `rgb` is
 * an integer triple, never a hex string: this module never generates a colour a
 * person reads, only a pixel value fed straight to a compositor.
 */

import sharp from 'sharp'

interface Rgb {
  r: number
  g: number
  b: number
}

/**
 * Renders an opaque rectangle `width` x `height`, corners rounded by `radius`,
 * filled with `rgb`, as PNG bytes at `(0, 0)`. The caller positions it by
 * compositing with its own `left`/`top`, same as any other overlay layer.
 *
 * `radius` is not re-clamped here. The caller (`stamp.ts`) already clamps it to
 * at most half the shorter side, because an SVG `rect` with a radius past that
 * silently clamps itself to a stadium shape rather than erroring, and doing the
 * clamp once at the call site is one place to read the rule instead of two.
 */
export async function roundedRectPng(
  width: number,
  height: number,
  radius: number,
  rgb: Rgb,
): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="rgb(${rgb.r},${rgb.g},${rgb.b})"/></svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}
