import { describe, expect, it } from 'vitest'

import { accentSpendOfImage, SAT_MIN, VAL_MIN, type RawImageLike } from './accent'

/**
 * CALIBRATE THE ACCENT METER BEFORE ANY ROUTE IS GRADED BY IT.
 *
 * `docs/37` §19 states the rule this file exists for: "a guard that cannot fail
 * is worse than no guard, because a green result is read as evidence" — and that
 * two guards in the v5 lane were themselves wrong on their first run and were
 * fixed rather than trusted. An accent number is going to be quoted as a before
 * and an after in a report. If the meter is wrong, the report is wrong in the
 * one direction nobody checks: it will say a screen improved.
 *
 * So every case here has an answer that is ARITHMETIC, not a snapshot. A frame
 * of N pixels with K orange ones is 100·K/N, and the meter either returns that
 * or it may not be used.
 */

/** Build an image from a per-pixel colour function. Row-major, RGBA. */
function image(
  width: number,
  height: number,
  at: (x: number, y: number) => [number, number, number, number],
): RawImageLike {
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = at(x, y)
      const i = (y * width + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = a
    }
  }
  return { width, height, channels: 4, data }
}

const ORANGE: [number, number, number, number] = [255, 102, 0, 255] // --p
const WHITE: [number, number, number, number] = [255, 255, 255, 255] // --canvas-ish
const BLACK: [number, number, number, number] = [0, 0, 0, 255]
const NEAR_BLACK: [number, number, number, number] = [13, 13, 13, 255] // dark --canvas
const CARD_DARK: [number, number, number, number] = [23, 23, 23, 255] // dark --surface
const MID_GREY: [number, number, number, number] = [151, 151, 151, 255] // --ink-mute dark

describe('the accent meter, calibrated', () => {
  it('reads 0.000% on a frame with no chroma at all — light', () => {
    expect(accentSpendOfImage(image(40, 40, () => WHITE)).percent).toBe(0)
  })

  it('reads 0.000% on a frame with no chroma at all — dark', () => {
    // The dark ladder is achromatic by construction (docs/37 §10), so an ENTIRE
    // dark screen with no brand on it must score zero. A meter that scored dark
    // greys as "saturated" would report every dark frame as overspent and the
    // whole light-vs-dark comparison in the report would be noise.
    const dark = image(40, 40, (x) => (x < 20 ? NEAR_BLACK : CARD_DARK))
    expect(accentSpendOfImage(dark).percent).toBe(0)
    expect(accentSpendOfImage(image(40, 40, () => MID_GREY)).percent).toBe(0)
    expect(accentSpendOfImage(image(40, 40, () => BLACK)).percent).toBe(0)
  })

  it('reads 100.000% on a frame that is entirely brand orange', () => {
    expect(accentSpendOfImage(image(40, 40, () => ORANGE)).percent).toBe(100)
  })

  it('reads exactly 50.000% on a half-orange frame, and samples one pixel in four', () => {
    // Left half orange, right half white. Sampling steps BOTH axes by two, so a
    // 40x40 frame yields 20x20 = 400 samples and 200 of them are orange.
    const half = image(40, 40, (x) => (x < 20 ? ORANGE : WHITE))
    const spend = accentSpendOfImage(half)
    expect(spend.sampled).toBe(400)
    expect(spend.saturated).toBe(200)
    expect(spend.percent).toBe(50)
  })

  it('is not fooled by a horizontal band, which sampling one axis would be', () => {
    // The reason the sampler steps y as well as x. A layout of full-width bands
    // is exactly this product's shape, and a column-only sampler reading rows
    // 0,2,4… would still be right here — but one reading only even COLUMNS of a
    // frame banded by row would return 100% or 0% depending on the phase.
    const banded = image(40, 40, (_x, y) => (y < 20 ? ORANGE : WHITE))
    expect(accentSpendOfImage(banded).percent).toBe(50)
  })

  it('counts a platform mark, and that is a stated limit rather than a bug', () => {
    // Instagram's magenta is not the brand accent and §2.1 exempts platform
    // marks from the ration — but it IS chroma, and this meter counts chroma.
    // Asserted so the limit is a fact of the suite rather than a line in a
    // comment nobody re-derives.
    const insta: [number, number, number, number] = [225, 48, 108, 255]
    expect(accentSpendOfImage(image(40, 40, () => insta)).percent).toBe(100)
  })

  it('refuses the threshold boundary in the direction it is written', () => {
    // `s > SAT_MIN`, strictly. A colour sitting exactly ON the threshold is NOT
    // counted, and a meter that used >= would report a different number for the
    // same screen. Built to land on the boundary exactly: max=200, min=140
    // gives s = 60/200 = 0.30.
    const onBoundary: [number, number, number, number] = [200, 140, 140, 255]
    const { s } = { s: (200 - 140) / 200 }
    expect(s).toBe(SAT_MIN)
    expect(accentSpendOfImage(image(40, 40, () => onBoundary)).percent).toBe(0)

    // And one step past it IS counted, so the zero above is the boundary rule
    // and not a meter that counts nothing.
    const pastBoundary: [number, number, number, number] = [200, 139, 139, 255]
    expect(accentSpendOfImage(image(40, 40, () => pastBoundary)).percent).toBe(100)
  })

  it('discards a saturated colour that is too dark to see', () => {
    // `v > VAL_MIN` exists so a deep shadow with a colour cast is not counted as
    // spent accent. A very dark red is fully saturated and invisible.
    const darkRed: [number, number, number, number] = [40, 0, 0, 255]
    expect(40 / 255).toBeLessThan(VAL_MIN)
    expect(accentSpendOfImage(image(40, 40, () => darkRed)).percent).toBe(0)
  })

  it('throws rather than reporting a clean frame it could not read', () => {
    // The failure this protects against: 0.000% is the exact number a lane wants
    // to see after a fix, so a decode failure that returned zero would read as
    // total success.
    expect(() => accentSpendOfImage(image(0, 0, () => WHITE))).toThrow(/zero-area/)
  })
})
