/**
 * Turning counted pixels into the two words a layout acts on.
 *
 * ── WHY THIS IS ITS OWN FILE ────────────────────────────────────────────────
 * `logo-facts.ts` does one thing: walk the bytes once and count. What those
 * counts MEAN is a separate argument, made entirely of tuned thresholds, and it
 * is the half that will be re-tuned as real customer logos arrive. Keeping it
 * apart means a threshold can move without anyone reading the scan again, and
 * the scan can be optimised without touching a single judgement call.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────
 * It never sees a pixel and never sees the canvas. `shapeOf` is handed the trim
 * box and nothing else, precisely so that the canvas cannot leak into the answer
 * by accident: a wide wordmark centred on a square canvas is wide, and a
 * function that cannot see the canvas cannot get that wrong.
 */

export type InkPolarity = 'dark' | 'light' | 'mixed'
export type ShapeClass = 'square' | 'wide' | 'tall'

export interface TrimBox {
  x: number
  y: number
  width: number
  height: number
}

/** Rec. 709 relative luminance weights, the same ones the contrast guard uses. */
const LUMA_R = 0.2126
const LUMA_G = 0.7152
const LUMA_B = 0.0722

/**
 * Luminance bands, on the 0 to 255 scale, for calling one ink pixel dark or
 * light. The gap between them is deliberate: a mark sitting near mid grey is
 * legible on neither a white nor a black surface, so it votes for neither side
 * and pushes the answer toward `mixed` instead of tipping it on a rounding.
 */
const DARK_INK_MAX_LUMA = 0.35 * 255
const LIGHT_INK_MIN_LUMA = 0.65 * 255

/**
 * Share of the ink one polarity must hold to be the answer. Below it the mark is
 * `mixed`. Set well above a bare majority because a mark with more than a
 * quarter of its ink in the opposite polarity genuinely needs a surface that
 * works both ways: a small dark wordmark beside a large light glyph is not a
 * light logo, it is a logo that breaks on a dark plate.
 */
const DOMINANT_INK_SHARE = 0.75

/**
 * How far from square the trim box must be before the shape is called wide or
 * tall, as a ratio of the longer side to the shorter. Below it a slot sized
 * square clips nothing a reader would notice; above it, padding a wordmark into
 * a square slot wastes most of the space it was given.
 */
const SQUARE_ASPECT_BAND = 1.2

export function relativeLuminance(r: number, g: number, b: number): number {
  return LUMA_R * r + LUMA_G * g + LUMA_B * b
}

const MAX_CHANNEL = 255

/**
 * One sRGB byte to its linear-light value, the sRGB electro-optical transfer
 * function exactly as WCAG 2.1 defines it for relative luminance.
 *
 * This is a DIFFERENT quantity from `relativeLuminance` above: that one is a raw
 * 0-255 weighted sum with no gamma step, used only to band a pixel dark or light.
 * This one, composed with `LUMA_R/G/B` on its OUTPUT, is the 0-1 linearised WCAG
 * luminance that `needsPlate`'s contrast thresholds are solved from, and it is
 * exported from here rather than duplicated because `stamp.ts` needs the exact
 * same curve to measure a picture's backdrop: comparing a mark's luminance
 * against a backdrop's only means anything when both were measured the same way.
 */
export function linearise(byte: number): number {
  const c = byte / MAX_CHANNEL
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/**
 * The 0-1 linearised WCAG relative luminance of one sRGB pixel: `linearise`
 * per channel, then the same `LUMA_R/G/B` weights `relativeLuminance` uses.
 * Exported as one function, not three constants, so every caller (this file's
 * own scan, `stamp.ts`'s backdrop measurement) composes the transfer function
 * and the weights in the one order WCAG defines rather than each re-deriving
 * it from parts.
 */
export function linearLuminance(r: number, g: number, b: number): number {
  return LUMA_R * linearise(r) + LUMA_G * linearise(g) + LUMA_B * linearise(b)
}

/** Which side of the two bands one ink pixel falls on. Mid greys count for neither. */
export function isDarkLuma(luma: number): boolean {
  return luma <= DARK_INK_MAX_LUMA
}

export function isLightLuma(luma: number): boolean {
  return luma >= LIGHT_INK_MIN_LUMA
}

/**
 * With no ink at all the answer is `mixed`: it is the only one of the three that
 * commits to nothing, and `dark` or `light` would each tell a caller to place
 * the mark on the opposite surface, a claim about ink that is not there.
 */
export function polarityOf(
  inkPixels: number,
  darkPixels: number,
  lightPixels: number,
): InkPolarity {
  if (inkPixels === 0) return 'mixed'
  if (darkPixels / inkPixels >= DOMINANT_INK_SHARE) return 'dark'
  if (lightPixels / inkPixels >= DOMINANT_INK_SHARE) return 'light'
  return 'mixed'
}

/**
 * From the trim box only. With no trim box the answer is `square`, the neutral
 * slot: a layout given `wide` or `tall` reshapes its frame around a mark that
 * does not exist.
 */
export function shapeOf(trim: TrimBox | null): ShapeClass {
  if (trim === null) return 'square'
  if (trim.width >= trim.height * SQUARE_ASPECT_BAND) return 'wide'
  if (trim.height >= trim.width * SQUARE_ASPECT_BAND) return 'tall'
  return 'square'
}
