/**
 * What Sahoda can learn about a logo file from its pixels alone.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * Placing a logo well needs five answers the file itself does not state: does it
 * carry an alpha channel, is its background actually see-through, where inside
 * the frame does the ink sit, is that ink dark or light, and what shape is it.
 * Those decide whether the mark needs a plate behind it on a busy surface, how
 * it is padded, and which of a light or dark surface it stays legible on.
 * `asset_logo_facts` (20260831120000) is where the answers are stored so they
 * are computed once per file rather than on every render.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────
 * No decoding, no `sharp`, no filesystem, no network. It takes raw bytes that a
 * caller has already decoded and returns a plain object, so it is testable with
 * a handful of small in-memory images and safe to call from anywhere. It does
 * not persist anything and it does not judge the logo: "mixed" and "no trim box"
 * are answers, not failures.
 *
 * ── ONE MENTAL MODEL: THE BACKGROUND IS WHAT TOUCHES THE EDGES ──────────────
 * Two facts need to know what the background is. When the image has meaningful
 * alpha, transparency answers both: ink is what is not see-through. When it does
 * not (a JPEG, or a PNG whose every alpha byte is 255), the border ring of the
 * canvas is the background sample and ink is whatever differs from it. The ring,
 * not a single corner: one corner can land inside a mark that bleeds off an edge,
 * or on a stray pixel, and then every other fact is computed against a lie.
 *
 * ── WHAT AN IMAGE WITH NO INK ANSWERS ───────────────────────────────────────
 * A fully transparent image has no mark, so `trim` is null. The two enums still
 * have to say something, and the choice here is `inkPolarity: 'mixed'` and
 * `shapeClass: 'square'`, for these reasons:
 *
 *   `mixed` is the only one of the three that commits to nothing. `dark` and
 *   `light` each tell a caller to put the logo on the opposite surface, and both
 *   would be a claim about ink that is not there. `mixed` already means "this
 *   mark needs a surface that works either way", which is the safe placement for
 *   a mark we know nothing about.
 *
 *   `square` is the neutral slot. A layout given `wide` or `tall` reshapes its
 *   frame around a mark that does not exist; `square` leaves the default alone.
 *
 * Neither is a substitute for checking `trim === null`, which is the real signal
 * that there was nothing to measure, and is the one the database stores as four
 * null columns rather than zeros.
 */

import {
  isDarkLuma,
  isLightLuma,
  polarityOf,
  relativeLuminance,
  shapeOf,
  type InkPolarity,
  type ShapeClass,
  type TrimBox,
} from './logo-facts-classify'

export type { InkPolarity, ShapeClass, TrimBox } from './logo-facts-classify'

export interface LogoFacts {
  hasAlpha: boolean
  transparentBackground: boolean
  trim: TrimBox | null
  inkPolarity: InkPolarity
  shapeClass: ShapeClass
}

/** A byte of 255 is the only fully opaque alpha, so anything below it is alpha in use. */
const OPAQUE_ALPHA = 255

/**
 * A pixel is part of the mark once it is more than half covered. Below half, it
 * is a feathered anti-aliased edge that belongs to neither the mark nor the
 * background, and counting it would inflate the trim box by a pixel on every
 * side of every curve.
 */
const MIN_INK_ALPHA = 128

/**
 * How far a pixel's colour must sit from the border sample before it counts as
 * ink, measured as the largest single-channel difference. Flat backgrounds are
 * not perfectly flat once an image has been through JPEG: ringing and 8x8 block
 * artifacts around a mark commonly move a channel by up to about ten levels.
 * Twelve clears that noise and is still far below any deliberate colour, whose
 * nearest realistic case (a mid grey mark on a light grey plate) differs by
 * dozens.
 */
const INK_COLOR_TOLERANCE = 12

/**
 * Share of the border ring that must be see-through before the background is
 * called transparent. A majority, not a single pixel: a mark is allowed to bleed
 * off an edge or two and still sit on a knockout canvas, but an image whose ring
 * is mostly solid has a real background baked in, whatever its file extension
 * suggests.
 */
const MIN_TRANSPARENT_RING_SHARE = 0.5

/** The indices of the outermost one-pixel ring, the only pixels guaranteed to touch an edge. */
function* ringOffsets(width: number, height: number, channels: number): Generator<number> {
  for (let x = 0; x < width; x += 1) {
    yield (0 * width + x) * channels
    if (height > 1) yield ((height - 1) * width + x) * channels
  }
  for (let y = 1; y < height - 1; y += 1) {
    yield (y * width + 0) * channels
    if (width > 1) yield (y * width + (width - 1)) * channels
  }
}

/** Median per channel, so one bleeding mark along an edge cannot drag the sample with it. */
function medianChannel(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

interface Background {
  /** True when transparency is the thing that separates ink from background. */
  useAlpha: boolean
  transparentBackground: boolean
  sample: { r: number; g: number; b: number }
}

function readBackground(
  raw: Uint8Array,
  width: number,
  height: number,
  channels: 3 | 4,
  hasAlpha: boolean,
): Background {
  const reds: number[] = []
  const greens: number[] = []
  const blues: number[] = []
  let ringPixels = 0
  let seeThroughRingPixels = 0

  for (const offset of ringOffsets(width, height, channels)) {
    ringPixels += 1
    reds.push(raw[offset]!)
    greens.push(raw[offset + 1]!)
    blues.push(raw[offset + 2]!)
    if (channels === 4 && raw[offset + 3]! < MIN_INK_ALPHA) seeThroughRingPixels += 1
  }

  const transparentBackground =
    hasAlpha && ringPixels > 0 && seeThroughRingPixels / ringPixels >= MIN_TRANSPARENT_RING_SHARE

  return {
    useAlpha: hasAlpha,
    transparentBackground,
    sample: {
      r: medianChannel(reds),
      g: medianChannel(greens),
      b: medianChannel(blues),
    },
  }
}

/**
 * Reads the five facts from an already-decoded image. `raw` is a flat byte array
 * of `width * height * channels` bytes, r,g,b(,a) per pixel, top row first: the
 * layout `sharp(...).raw().toBuffer()` and `ImageData#data` both produce.
 *
 * Throws a `RangeError` on an image it cannot honestly read: a zero or negative
 * or non-integer dimension, or a `raw` whose length does not match the stated
 * size. Both are caller bugs rather than odd pictures, and every alternative is
 * worse. Reading a mismatched buffer walks off its end and returns facts about
 * whatever memory followed; returning a made-up answer would be written into
 * `asset_logo_facts` and trusted by the render code forever after.
 */
export function logoFactsFromRaw(
  raw: Uint8Array,
  width: number,
  height: number,
  channels: 3 | 4,
): LogoFacts {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError(
      `logoFactsFromRaw: width and height must be positive integers, got ${width}x${height}`,
    )
  }
  const expected = width * height * channels
  if (raw.length !== expected) {
    throw new RangeError(
      `logoFactsFromRaw: raw is ${raw.length} bytes, expected ${expected} for ${width}x${height}x${channels}`,
    )
  }

  let hasAlpha = false
  if (channels === 4) {
    for (let offset = 3; offset < raw.length; offset += 4) {
      if (raw[offset]! < OPAQUE_ALPHA) {
        hasAlpha = true
        break
      }
    }
  }

  const background = readBackground(raw, width, height, channels, hasAlpha)
  const { r: bgR, g: bgG, b: bgB } = background.sample

  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  let inkPixels = 0
  let darkPixels = 0
  let lightPixels = 0

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels
      const r = raw[offset]!
      const g = raw[offset + 1]!
      const b = raw[offset + 2]!

      const isInk = background.useAlpha
        ? raw[offset + 3]! >= MIN_INK_ALPHA
        : Math.max(Math.abs(r - bgR), Math.abs(g - bgG), Math.abs(b - bgB)) > INK_COLOR_TOLERANCE
      if (!isInk) continue

      inkPixels += 1
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y

      const luma = relativeLuminance(r, g, b)
      if (isDarkLuma(luma)) darkPixels += 1
      else if (isLightLuma(luma)) lightPixels += 1
    }
  }

  const trim: TrimBox | null =
    inkPixels === 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }

  return {
    hasAlpha,
    transparentBackground: background.transparentBackground,
    trim,
    inkPolarity: polarityOf(inkPixels, darkPixels, lightPixels),
    shapeClass: shapeOf(trim),
  }
}
