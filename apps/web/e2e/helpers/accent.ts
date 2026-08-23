import { readFileSync } from 'node:fs'

import { decodePng } from './png'

/**
 * HOW MUCH OF A FRAME IS ORANGE.
 *
 * ── WHY THIS EXISTS AS CODE AND NOT AS A NUMBER IN A DOC ─────────────────────
 * `docs/37` §2.3 states the accent budget as a measured fraction per screen —
 * the reference's /settings at 0.030% against Sahoda's 0.505%, "seventeen times
 * more orange on a screen whose entire job is configuration". It names the
 * method (HSV `s > 0.30`, `v > 0.25`, every second pixel) but the script that
 * produced those figures is NOT in this repository: `scripts/design/` holds a
 * contrast reporter, a dark-ladder solver and a glass-cost meter, and no
 * saturation sampler. Grepped 2026-08-23 across `scripts/` and `apps/web/e2e/`
 * for `saturat`, `hsv` and the threshold pair; zero hits.
 *
 * So the numbers in §2.3 cannot be re-derived, only re-measured. This file is
 * that measurement, written to the method §2.3 states, so a lane can quote a
 * before and an after that are comparable **to each other**. Whether they are
 * comparable to §2.3's own figures is unknown and is not claimed — a second
 * implementation of a stated method is not the same instrument.
 *
 * ── WHAT THE THRESHOLD ACTUALLY SELECTS ──────────────────────────────────────
 * `s > 0.30` with `v > 0.25` selects a pixel with real chroma that is not nearly
 * black. On this palette that is brand orange, its tints once they are strong
 * enough to read, the platform marks (§2.1 — Instagram, LinkedIn and the rest
 * keep their own colours and are NOT UI chrome), and nothing else: the neutrals
 * are achromatic by construction, so a grey of any lightness scores `s = 0`.
 *
 * That inclusion of platform marks is deliberate and it is a LIMIT of the
 * measure, stated here rather than discovered later. A screen showing six
 * connected channels spends saturated pixels that the accent ration does not
 * govern. Compare a route against ITSELF before and after, never one route
 * against another with a different number of platform marks on it.
 *
 * ── EVERY SECOND PIXEL, IN BOTH AXES ─────────────────────────────────────────
 * §2.3 says "every second pixel". Sampling every second COLUMN only would bias
 * a layout built from horizontal bands; this steps both axes, so it reads one
 * pixel in four. On a 1440x4000 full-page frame that is 1.44M samples, which is
 * far past the point where the fraction stops moving.
 */

/** What the measurement needs from an image. `RawImage` from `./png` satisfies it. */
export interface RawImageLike {
  width: number
  height: number
  channels: 3 | 4
  data: { [index: number]: number | undefined }
}

export interface AccentSpend {
  /** Saturated pixels as a fraction of those sampled, in percent. */
  percent: number
  /** How many pixels the sampler actually looked at. Zero is a broken read, not a clean frame. */
  sampled: number
  saturated: number
  width: number
  height: number
}

/** §2.3's threshold, kept as named constants so a caller cannot quote a number it did not use. */
export const SAT_MIN = 0.3
export const VAL_MIN = 0.25

/**
 * HSV saturation and value for an 8-bit RGB triple.
 *
 * Hue is deliberately not computed: the measure is "how much of this frame is
 * chromatic", and restricting by hue would exempt whichever colour a screen
 * happened to overspend on. §2.3 counts saturation, and so does this.
 */
function satVal(r: number, g: number, b: number): { s: number; v: number } {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const v = max / 255
  const s = max === 0 ? 0 : (max - min) / max
  return { s, v }
}

/**
 * Measure one frame.
 *
 * THROWS on a frame it could not read rather than returning zero. A 0.000%
 * reading is exactly what a lane wants to see after a fix, so a decode failure
 * that returned zero would be indistinguishable from total success — the
 * "harness that cannot tell nothing-broke from nothing-ran" failure, one
 * directory over in `ux-shot.ts`.
 */
export function accentSpendOf(file: string): AccentSpend {
  try {
    return accentSpendOfImage(decodePng(readFileSync(file)))
  } catch (error) {
    throw new Error(`accent: ${file}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * The measurement itself, over already-decoded pixels.
 *
 * Split from the file read so `accent.test.ts` can hand it an image whose right
 * answer is arithmetic — 200 orange pixels in a 400-pixel frame is 50.000%, and
 * an instrument that cannot return that number may not be used to claim a route
 * improved. Same discipline as `ux-detector-selftest.spec.ts`, which shows every
 * detector a white-on-white 1.00 and a black-on-white 21.00 before believing any
 * of them.
 */
export function accentSpendOfImage(img: RawImageLike): AccentSpend {
  const { width, height, channels, data } = img
  if (width === 0 || height === 0) throw new Error('decoded to a zero-area image')

  let sampled = 0
  let saturated = 0
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * channels
      // A fully transparent pixel is not a colour anyone saw. Screenshots are
      // opaque, so this is a guard rather than a branch that fires.
      if (channels === 4 && data[i + 3]! < 8) continue
      const { s, v } = satVal(data[i]!, data[i + 1]!, data[i + 2]!)
      sampled += 1
      if (s > SAT_MIN && v > VAL_MIN) saturated += 1
    }
  }

  if (sampled === 0) throw new Error('yielded no samples')
  return {
    percent: (saturated / sampled) * 100,
    sampled,
    saturated,
    width,
    height,
  }
}
