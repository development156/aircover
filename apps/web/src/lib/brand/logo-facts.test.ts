import { describe, expect, it } from 'vitest'
import sharp from 'sharp'

import { logoFactsFromRaw } from './logo-facts'

/**
 * Pins the contract for `logoFactsFromRaw`, a pure function that has not been
 * written yet. It is expected to fail on `./logo-facts` not existing until the
 * implementer builds against this file.
 *
 * ── DOES THIS FILE HAVE A BLIND SPOT? ────────────────────────────────────────
 * No file read, no child process, no directory walk: every fixture is a small
 * image built in memory with `sharp`, decoded back to raw bytes with
 * `.raw().toBuffer({resolveWithObject:true})`, and fed straight to the function
 * under test. `scripts/lib/scanner-registry.mjs` only flags a test file that
 * calls `readFileSync`, `readdirSync`, `globSync`, `execFileSync` or `execSync`
 * — this one calls none of them, so it is not a scanner and carries no
 * declaration.
 *
 * ── THE DECISION THIS FILE PINS FOR NON-ALPHA TRIM ───────────────────────────
 * `trim` is defined unambiguously for a buffer with meaningful alpha: the tight
 * box of pixels that are not fully transparent. For a buffer with NO meaningful
 * alpha — a plain 3-channel image, or a 4-channel image where every pixel is
 * fully opaque — there is no transparency to read, so this suite pins the
 * decision that the BORDER RING is the background sample, the same ring
 * `transparentBackground` already reads. Ink is any pixel whose colour differs
 * from that border sample by more than a small tolerance, and `trim` is the
 * tight box of those pixels. One mental model — "background is what touches the
 * edges of the canvas" — covers both facts instead of two unrelated rules.
 *
 * Every trim assertion below is an exact box, not a range: an off-by-one in the
 * row/column scan is the defect this code will actually have, and "roughly
 * right" would not catch it.
 */

interface RGBA {
  r: number
  g: number
  b: number
  alpha?: number
}

/** A same-size opaque or translucent rectangle, composited with no blending at its edges. */
async function patch(width: number, height: number, color: RGBA): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: color.r, g: color.g, b: color.b, alpha: (color.alpha ?? 255) / 255 },
    },
  })
    .png()
    .toBuffer()
}

interface RawImage {
  raw: Uint8Array
  width: number
  height: number
  channels: 3 | 4
}

/** Builds a canvas of `channels` depth, drops zero or more ink rectangles onto it, decodes to raw. */
async function build(
  width: number,
  height: number,
  channels: 3 | 4,
  background: RGBA,
  ink: Array<{ left: number; top: number; width: number; height: number; color: RGBA }> = [],
): Promise<RawImage> {
  const base = sharp({
    create: {
      width,
      height,
      channels,
      background:
        channels === 4
          ? { r: background.r, g: background.g, b: background.b, alpha: (background.alpha ?? 255) / 255 }
          : { r: background.r, g: background.g, b: background.b },
    },
  })

  const overlays = await Promise.all(
    ink.map(async (rect) => ({
      input: await patch(rect.width, rect.height, rect.color),
      left: rect.left,
      top: rect.top,
    })),
  )

  const composed = overlays.length > 0 ? base.composite(overlays) : base
  const { data, info } = await composed.raw().toBuffer({ resolveWithObject: true })

  return {
    raw: new Uint8Array(data),
    width: info.width,
    height: info.height,
    channels: info.channels as 3 | 4,
  }
}

const BLACK: RGBA = { r: 10, g: 10, b: 10 }
const NEAR_BLACK: RGBA = { r: 15, g: 15, b: 15 }
const NEAR_WHITE: RGBA = { r: 245, g: 245, b: 245 }
const TRANSPARENT: RGBA = { r: 0, g: 0, b: 0, alpha: 0 }
const WHITE: RGBA = { r: 255, g: 255, b: 255 }
const LIGHT_GRAY: RGBA = { r: 200, g: 200, b: 200 }
const PURE_WHITE_INK: RGBA = { r: 255, g: 255, b: 255 }
const PURE_BLACK_INK: RGBA = { r: 0, g: 0, b: 0 }

describe('hasAlpha: a channel is not the same thing as transparency', () => {
  it('is false for a 4-channel image where every pixel is fully opaque', async () => {
    const img = await build(120, 90, 4, LIGHT_GRAY, [
      { left: 30, top: 25, width: 40, height: 20, color: { ...NEAR_BLACK, alpha: 255 } },
    ])
    const facts = logoFactsFromRaw(img.raw, img.width, img.height, img.channels)
    expect(facts.hasAlpha).toBe(false)
  })

  it('is true for a 4-channel image with at least one non-opaque pixel', async () => {
    const img = await build(200, 200, 4, TRANSPARENT, [
      { left: 60, top: 60, width: 80, height: 80, color: { ...BLACK, alpha: 255 } },
    ])
    const facts = logoFactsFromRaw(img.raw, img.width, img.height, img.channels)
    expect(facts.hasAlpha).toBe(true)
  })

  it('is false for a plain 3-channel image, because there is no alpha channel to have', async () => {
    const img = await build(100, 100, 3, WHITE, [
      { left: 35, top: 35, width: 30, height: 30, color: NEAR_BLACK },
    ])
    const facts = logoFactsFromRaw(img.raw, img.width, img.height, img.channels)
    expect(facts.hasAlpha).toBe(false)
  })
})

describe('transparentBackground: read from the border ring, never a single corner', () => {
  it('is true when the mark sits on a transparent canvas with padding all round', async () => {
    const img = await build(200, 200, 4, TRANSPARENT, [
      { left: 60, top: 60, width: 80, height: 80, color: { ...BLACK, alpha: 255 } },
    ])
    const facts = logoFactsFromRaw(img.raw, img.width, img.height, img.channels)
    expect(facts.transparentBackground).toBe(true)
  })

  it('is false for a JPEG-shaped image: there is no alpha channel at all', async () => {
    const img = await build(100, 100, 3, WHITE, [
      { left: 35, top: 35, width: 30, height: 30, color: NEAR_BLACK },
    ])
    const facts = logoFactsFromRaw(img.raw, img.width, img.height, img.channels)
    expect(facts.transparentBackground).toBe(false)
  })

  it('is false for a PNG that bakes in an opaque white box, the whole reason the fact exists', async () => {
    // A PNG that HAS an alpha channel, but every alpha byte is 255 including the
    // border: the file looks like a knockout logo from the extension alone, and
    // is not one. hasAlpha and transparentBackground must both be false here.
    const img = await build(120, 90, 4, { ...WHITE, alpha: 255 }, [
      { left: 30, top: 25, width: 40, height: 20, color: { ...NEAR_BLACK, alpha: 255 } },
    ])
    const facts = logoFactsFromRaw(img.raw, img.width, img.height, img.channels)
    expect(facts.hasAlpha).toBe(false)
    expect(facts.transparentBackground).toBe(false)
  })
})

describe('trim: the tight box of the ink, exact, not approximate', () => {
  it('finds a centred mark with padding on a transparent canvas', async () => {
    const img = await build(200, 200, 4, TRANSPARENT, [
      { left: 60, top: 60, width: 80, height: 80, color: { ...BLACK, alpha: 255 } },
    ])
    const facts = logoFactsFromRaw(img.raw, img.width, img.height, img.channels)
    expect(facts.trim).toEqual({ x: 60, y: 60, width: 80, height: 80 })
  })

  it('finds a knockout (light) mark on a transparent canvas', async () => {
    const img = await build(150, 150, 4, TRANSPARENT, [
      { left: 25, top: 45, width: 100, height: 60, color: { ...NEAR_WHITE, alpha: 255 } },
    ])
    const facts = logoFactsFromRaw(img.raw, img.width, img.height, img.channels)
    expect(facts.trim).toEqual({ x: 25, y: 45, width: 100, height: 60 })
  })

  it('finds the mark on an opaque white box, reading the border as the background', async () => {
    const img = await build(100, 100, 3, WHITE, [
      { left: 35, top: 35, width: 30, height: 30, color: NEAR_BLACK },
    ])
    const facts = logoFactsFromRaw(img.raw, img.width, img.height, img.channels)
    expect(facts.trim).toEqual({ x: 35, y: 35, width: 30, height: 30 })
  })

  it('finds the mark on a fully opaque 4-channel image, the same border-ring rule as no alpha', async () => {
    const img = await build(120, 90, 4, LIGHT_GRAY, [
      { left: 30, top: 25, width: 40, height: 20, color: { ...NEAR_BLACK, alpha: 255 } },
    ])
    const facts = logoFactsFromRaw(img.raw, img.width, img.height, img.channels)
    expect(facts.trim).toEqual({ x: 30, y: 25, width: 40, height: 20 })
  })

  it('is null when every pixel is transparent, because there is no mark to measure', async () => {
    const img = await build(100, 100, 4, TRANSPARENT, [])
    const facts = logoFactsFromRaw(img.raw, img.width, img.height, img.channels)
    expect(facts.trim).toBeNull()
  })

  it('reaches the top-left corner exactly when the mark touches those edges', async () => {
    const img = await build(200, 200, 4, TRANSPARENT, [
      { left: 0, top: 0, width: 70, height: 70, color: { ...BLACK, alpha: 255 } },
    ])
    const facts = logoFactsFromRaw(img.raw, img.width, img.height, img.channels)
    expect(facts.trim).toEqual({ x: 0, y: 0, width: 70, height: 70 })
  })

  it('spans the full width when the mark bleeds edge to edge horizontally', async () => {
    const img = await build(180, 120, 4, TRANSPARENT, [
      { left: 0, top: 35, width: 180, height: 50, color: { ...BLACK, alpha: 255 } },
    ])
    const facts = logoFactsFromRaw(img.raw, img.width, img.height, img.channels)
    expect(facts.trim).toEqual({ x: 0, y: 35, width: 180, height: 50 })
    expect(facts.trim?.width).toBe(img.width)
  })
})

describe('inkPolarity: computed over the ink pixels only, never the padding', () => {
  it('is dark for a dark mark surrounded by a large transparent canvas', async () => {
    const img = await build(200, 200, 4, TRANSPARENT, [
      { left: 60, top: 60, width: 80, height: 80, color: { ...BLACK, alpha: 255 } },
    ])
    const facts = logoFactsFromRaw(img.raw, img.width, img.height, img.channels)
    expect(facts.inkPolarity).toBe('dark')
  })

  it('is light for a knockout mark surrounded by a large transparent canvas', async () => {
    const img = await build(150, 150, 4, TRANSPARENT, [
      { left: 25, top: 45, width: 100, height: 60, color: { ...NEAR_WHITE, alpha: 255 } },
    ])
    const facts = logoFactsFromRaw(img.raw, img.width, img.height, img.channels)
    expect(facts.inkPolarity).toBe('light')
  })

  it('is dark for a dark mark on an opaque white box, not swayed by the white majority', async () => {
    const img = await build(100, 100, 3, WHITE, [
      { left: 35, top: 35, width: 30, height: 30, color: NEAR_BLACK },
    ])
    const facts = logoFactsFromRaw(img.raw, img.width, img.height, img.channels)
    expect(facts.inkPolarity).toBe('dark')
  })

  it('is mixed for a full-colour mark that is genuinely both dark and light ink', async () => {
    // Pure black square beside a pure white square, both opaque, both ink: a
    // polarity computed on ink pixels only has no honest single answer but
    // "mixed", and a polarity that averaged toward mid-grey would be wrong for
    // BOTH halves at once.
    const img = await build(160, 160, 4, TRANSPARENT, [
      { left: 10, top: 10, width: 70, height: 140, color: { ...PURE_BLACK_INK, alpha: 255 } },
      { left: 90, top: 10, width: 70, height: 140, color: { ...PURE_WHITE_INK, alpha: 255 } },
    ])
    const facts = logoFactsFromRaw(img.raw, img.width, img.height, img.channels)
    expect(facts.inkPolarity).toBe('mixed')
  })
})

describe('shapeClass: from the trim box, never the canvas', () => {
  it('is square when the trim box is square, even though the canvas is not', async () => {
    const img = await build(100, 100, 3, WHITE, [
      { left: 35, top: 35, width: 30, height: 30, color: NEAR_BLACK },
    ])
    const facts = logoFactsFromRaw(img.raw, img.width, img.height, img.channels)
    expect(facts.shapeClass).toBe('square')
  })

  it('is wide for a wide lockup sitting inside a SQUARE transparent canvas', async () => {
    // The load-bearing case: a 400x400 canvas is exactly as tall as it is wide,
    // but the mark inside it — a 300x60 lockup with 170px of transparent band
    // above and below — is wide. Measuring the canvas would call this square;
    // measuring the trim, which is the whole point, calls it wide.
    const img = await build(400, 400, 4, TRANSPARENT, [
      { left: 50, top: 170, width: 300, height: 60, color: { ...BLACK, alpha: 255 } },
    ])
    expect(img.width).toBe(img.height)
    const facts = logoFactsFromRaw(img.raw, img.width, img.height, img.channels)
    expect(facts.trim).toEqual({ x: 50, y: 170, width: 300, height: 60 })
    expect(facts.shapeClass).toBe('wide')
  })

  it('is tall for a tall mark sitting inside a wide canvas', async () => {
    const img = await build(500, 200, 4, TRANSPARENT, [
      { left: 225, top: 20, width: 50, height: 160, color: { ...BLACK, alpha: 255 } },
    ])
    const facts = logoFactsFromRaw(img.raw, img.width, img.height, img.channels)
    expect(facts.trim).toEqual({ x: 225, y: 20, width: 50, height: 160 })
    expect(facts.shapeClass).toBe('tall')
  })
})

describe('a fully transparent image has no mark to measure', () => {
  it('reports no trim, an alpha channel, and a transparent background, without throwing', async () => {
    const img = await build(100, 100, 4, TRANSPARENT, [])
    const facts = logoFactsFromRaw(img.raw, img.width, img.height, img.channels)
    expect(facts.trim).toBeNull()
    expect(facts.hasAlpha).toBe(true)
    expect(facts.transparentBackground).toBe(true)
    // inkPolarity and shapeClass are deliberately not asserted here: there is no
    // ink to have a polarity or a shape, and the spec does not pin what a
    // function typed to always return one of three enum values should say when
    // the honest answer is "there is nothing". Whatever is returned must not
    // throw, which is the only claim this test makes about those two fields.
  })
})

/**
 * ── ADDED BY THE IMPLEMENTER: the hole the block above names ─────────────────
 * The suite above asserts only that the fully transparent case does not throw,
 * which an implementation can fall through silently. These pin the decision the
 * implementation documents in its header: `mixed` because it is the only
 * polarity that commits to nothing (`dark` and `light` each tell a caller to
 * place the mark on the opposite surface, a claim about ink that is not there),
 * and `square` because it is the neutral slot a layout does not reshape itself
 * around. Neither replaces the real signal, which is `trim === null`.
 */
describe('a fully transparent image: what the two enums say when there is no ink', () => {
  it('answers mixed, the only polarity that claims nothing about absent ink', async () => {
    const img = await build(100, 100, 4, TRANSPARENT, [])
    const facts = logoFactsFromRaw(img.raw, img.width, img.height, img.channels)
    expect(facts.trim).toBeNull()
    expect(facts.inkPolarity).toBe('mixed')
  })

  it('answers square, the slot a layout does not reshape itself around', async () => {
    // A 400x120 canvas, emphatically wide, and still square: the answer comes
    // from the absent trim box and never from the canvas.
    const img = await build(400, 120, 4, TRANSPARENT, [])
    const facts = logoFactsFromRaw(img.raw, img.width, img.height, img.channels)
    expect(facts.trim).toBeNull()
    expect(facts.shapeClass).toBe('square')
  })
})

/**
 * ── ADDED BY THE IMPLEMENTER: malformed input is refused, never guessed ──────
 * Both of these are caller bugs rather than odd pictures. Reading a buffer that
 * is shorter than its stated size walks off its end and reports facts about
 * whatever followed it in memory; a zero dimension divides by nothing and writes
 * NaN into a column typed `int`. A throw is the only answer that cannot end up
 * stored in `asset_logo_facts` and trusted by the render code forever after.
 */
describe('malformed input is refused', () => {
  it('throws when raw is shorter than width * height * channels', () => {
    const short = new Uint8Array(10 * 10 * 4 - 4)
    expect(() => logoFactsFromRaw(short, 10, 10, 4)).toThrow(RangeError)
    expect(() => logoFactsFromRaw(short, 10, 10, 4)).toThrow(/expected 400/)
  })

  it('throws when raw is longer than width * height * channels', () => {
    const long = new Uint8Array(10 * 10 * 4 + 4)
    expect(() => logoFactsFromRaw(long, 10, 10, 4)).toThrow(RangeError)
  })

  it('throws on a zero dimension rather than returning NaN', () => {
    expect(() => logoFactsFromRaw(new Uint8Array(0), 0, 10, 4)).toThrow(RangeError)
    expect(() => logoFactsFromRaw(new Uint8Array(0), 10, 0, 4)).toThrow(RangeError)
    expect(() => logoFactsFromRaw(new Uint8Array(0), 0, 10, 4)).toThrow(/positive integers/)
  })

  it('throws on a negative or fractional dimension', () => {
    expect(() => logoFactsFromRaw(new Uint8Array(40), -10, 1, 4)).toThrow(RangeError)
    expect(() => logoFactsFromRaw(new Uint8Array(40), 10.5, 1, 4)).toThrow(RangeError)
  })
})

/**
 * ── ADDED BY THE IMPLEMENTER: the ring vs a single corner, actually tested ───
 * The suite above names "never a single corner" in a heading, and nothing in it
 * fails if the implementation reads only pixel (0,0). MEASURED: replacing the
 * whole ring scan with the top-left pixel alone left all 27 tests above green.
 * Every fixture up to here keeps its corner clear of the mark, so the corner and
 * the ring agree in all of them. These two put ink IN the corner, which is the
 * only arrangement where the two rules give different answers, once for each
 * fact that depends on the background sample.
 */
describe('the background sample is the whole border ring, not one corner', () => {
  it('still calls the background transparent when the mark covers the top-left corner', async () => {
    // Three of the four edges are clear transparent canvas and the mark bleeds
    // into one corner. Sampling that corner alone reads an opaque pixel and
    // reports a solid background for what is plainly a knockout logo.
    const img = await build(200, 200, 4, TRANSPARENT, [
      { left: 0, top: 0, width: 70, height: 70, color: { ...BLACK, alpha: 255 } },
    ])
    const facts = logoFactsFromRaw(img.raw, img.width, img.height, img.channels)
    expect(facts.transparentBackground).toBe(true)
  })

  it('still finds the mark on an opaque canvas when the mark covers the top-left corner', async () => {
    // No alpha, so the border sample IS the background definition. Sampling the
    // corner alone takes the MARK for the background and then reports the white
    // page as the ink, inverting the trim box into the whole canvas.
    const img = await build(100, 100, 3, WHITE, [
      { left: 0, top: 0, width: 40, height: 40, color: NEAR_BLACK },
    ])
    const facts = logoFactsFromRaw(img.raw, img.width, img.height, img.channels)
    expect(facts.trim).toEqual({ x: 0, y: 0, width: 40, height: 40 })
    expect(facts.inkPolarity).toBe('dark')
  })
})
