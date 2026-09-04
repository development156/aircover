import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import type { InkPolarity } from '../brand/logo-facts'
import { placeLogo, type Anchor, type Rect } from '../brand/logo-placement'
import { chooseAnchor, regionLuminanceStats } from './corner-choice'

/**
 * REAL VARIANCE, NOT TWO FLAT FILLS.
 *
 * A pair of solid colours tells `regionLuminanceStats` a mean and nothing
 * else: two flat corners at different brightness differ in MEAN, but a flat
 * wall and a plate of samosas can share a mean and still read completely
 * differently. Every "busy" region below is a checkerboard of two grey
 * levels, so its SPREAD is a real, non-zero number a "quiet" flat region does
 * not have.
 */

const CANVAS = { width: 400, height: 400 }
const LOGO_ASPECT = 1

function placementFor(anchor: Anchor): Rect {
  return placeLogo({ canvas: CANVAS, logoAspect: LOGO_ASPECT, anchor }).mark
}

/** Every pixel painted `flat`, everywhere the canvas has not been painted otherwise. */
function makeCanvas(flat: number): Buffer {
  const raw = Buffer.alloc(CANVAS.width * CANVAS.height * 3, flat)
  return raw
}

function paintFlat(raw: Buffer, region: Rect, value: number): void {
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      const at = (y * CANVAS.width + x) * 3
      raw[at] = value
      raw[at + 1] = value
      raw[at + 2] = value
    }
  }
}

/** A 1px checkerboard of `a` and `b` over `region`: real per-pixel variance, not a gradient. */
function paintCheckerboard(raw: Buffer, region: Rect, a: number, b: number): void {
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      const value = (x + y) % 2 === 0 ? a : b
      const at = (y * CANVAS.width + x) * 3
      raw[at] = value
      raw[at + 1] = value
      raw[at + 2] = value
    }
  }
}

async function toPng(raw: Buffer): Promise<Uint8Array> {
  const png = await sharp(raw, { raw: { width: CANVAS.width, height: CANVAS.height, channels: 3 } })
    .png()
    .toBuffer()
  return new Uint8Array(png)
}

const DARK_INK: InkPolarity = 'dark'

/** Flat, bright grey. Clears contrast for dark ink (linear luminance ≈0.72, well above the 0.175 threshold) and, painted everywhere, reads as quiet. */
const QUIET_CLEAR = 220
/** Flat, near-black. Fails contrast for dark ink (linear luminance ≈0.007). */
const DARK_UNREADABLE = 20
/** Flat, near-white. Clears contrast for dark ink easily. */
const BRIGHT_CLEAR = 235

describe('chooseAnchor: moves off a busy corner for a meaningfully quieter one', () => {
  it('moves from a checkerboarded chosen corner to a flat one that clears contrast', async () => {
    const raw = makeCanvas(QUIET_CLEAR)
    const chosen = placementFor('bottom-right')
    // A wide-amplitude checkerboard: real spread, still bright on average
    // (mean of 250 and 30 is comfortably above the dark-ink contrast floor).
    paintCheckerboard(raw, chosen, 250, 30)
    const picture = await toPng(raw)

    const result = await chooseAnchor({
      picture,
      canvas: CANVAS,
      logoAspect: LOGO_ASPECT,
      anchor: 'bottom-right',
      inkPolarity: DARK_INK,
    })

    expect(result).not.toBeNull()
    expect(result?.anchor).toBe('bottom-left')
    expect(result?.anchorChoice).toEqual({
      kind: 'moved',
      from: 'bottom-right',
      to: 'bottom-left',
      reason: 'busy',
    })
  })

  it('does NOT move when every other corner is only marginally quieter', async () => {
    const raw = makeCanvas(QUIET_CLEAR)
    const chosen = placementFor('bottom-right')
    // Every OTHER corner gets the calmer checkerboard too, not just one: a
    // single untouched flat corner elsewhere (spread 0) would trivially win
    // "quietest" and defeat the point of this test, which is the MARGIN, not
    // the presence of a flat corner.
    for (const anchor of ['bottom-left', 'top-right', 'top-left'] as const) {
      paintCheckerboard(raw, placementFor(anchor), 250, 60)
    }
    // Both patterns are checkerboards, one only a little calmer than the
    // other: measured spread ratio here is ≈0.97, well inside the 0.75
    // margin, so the customer's own choice must win.
    paintCheckerboard(raw, chosen, 250, 30)
    const picture = await toPng(raw)

    const result = await chooseAnchor({
      picture,
      canvas: CANVAS,
      logoAspect: LOGO_ASPECT,
      anchor: 'bottom-right',
      inkPolarity: DARK_INK,
    })

    expect(result).not.toBeNull()
    expect(result?.anchor).toBe('bottom-right')
    expect(result?.anchorChoice).toEqual({ kind: 'as_chosen' })
  })
})

describe('chooseAnchor: moves off a corner that cannot clear contrast at all', () => {
  it('moves to a corner that clears contrast when the chosen one cannot, regardless of busyness', async () => {
    const raw = makeCanvas(BRIGHT_CLEAR)
    const chosen = placementFor('bottom-right')
    paintFlat(raw, chosen, DARK_UNREADABLE)
    const picture = await toPng(raw)

    const result = await chooseAnchor({
      picture,
      canvas: CANVAS,
      logoAspect: LOGO_ASPECT,
      anchor: 'bottom-right',
      inkPolarity: DARK_INK,
    })

    expect(result).not.toBeNull()
    expect(result?.anchorChoice.kind).toBe('moved')
    if (result?.anchorChoice.kind === 'moved') {
      expect(result.anchorChoice.from).toBe('bottom-right')
      expect(result.anchorChoice.to).not.toBe('bottom-right')
      expect(result.anchorChoice.reason).toBe('unreadable')
    }
  })
})

describe('chooseAnchor: stays and lets the caller plate when nowhere clears', () => {
  it('keeps the chosen corner when every corner fails contrast', async () => {
    // Uniformly dark: no corner clears for dark ink, anywhere.
    const raw = makeCanvas(DARK_UNREADABLE)
    const picture = await toPng(raw)

    const result = await chooseAnchor({
      picture,
      canvas: CANVAS,
      logoAspect: LOGO_ASPECT,
      anchor: 'bottom-right',
      inkPolarity: DARK_INK,
    })

    expect(result).not.toBeNull()
    expect(result?.anchor).toBe('bottom-right')
    expect(result?.anchorChoice).toEqual({ kind: 'as_chosen' })
  })

  it('stays on the chosen corner even when a DIFFERENT unreadable corner is quieter', async () => {
    // ── THE MUTATION THIS TEST CATCHES ──────────────────────────────────────
    // If rule 5's "no corner clears, so stay" ever became "no corner clears,
    // so move to whichever is quietest anyway", this is the fixture that would
    // catch it silently otherwise: every corner ties on spread 0 in the two
    // simpler "uniformly dark" fixtures above, so a mutant that moves to the
    // quietest corner would still land back on the chosen one by tie order.
    // Here the chosen corner is deliberately the BUSIEST of the four, so a
    // "move to quietest anyway" mutant picks a different corner than this
    // asserts.
    const raw = makeCanvas(DARK_UNREADABLE)
    paintCheckerboard(raw, placementFor('bottom-right'), 40, 5)
    const picture = await toPng(raw)

    const result = await chooseAnchor({
      picture,
      canvas: CANVAS,
      logoAspect: LOGO_ASPECT,
      anchor: 'bottom-right',
      inkPolarity: DARK_INK,
    })

    expect(result).not.toBeNull()
    expect(result?.anchor).toBe('bottom-right')
    expect(result?.anchorChoice).toEqual({ kind: 'as_chosen' })
  })

  it('also stays when every corner is uniformly BUSY, not just uniformly dark', async () => {
    // Every corner checkerboards identically: nothing is quieter than anything
    // else, and the chosen corner still clears contrast, so it wins on its own
    // terms rather than by a tie-break that happens to favour it.
    const raw = makeCanvas(QUIET_CLEAR)
    for (const anchor of ['bottom-right', 'bottom-left', 'top-right', 'top-left'] as const) {
      paintCheckerboard(raw, placementFor(anchor), 250, 30)
    }
    const picture = await toPng(raw)

    const result = await chooseAnchor({
      picture,
      canvas: CANVAS,
      logoAspect: LOGO_ASPECT,
      anchor: 'bottom-right',
      inkPolarity: DARK_INK,
    })

    expect(result).not.toBeNull()
    expect(result?.anchor).toBe('bottom-right')
    expect(result?.anchorChoice).toEqual({ kind: 'as_chosen' })
  })
})

describe('regionLuminanceStats: the busyness signal a mean alone cannot give', () => {
  it('reports zero spread for a flat region and a real spread for a checkerboarded one', async () => {
    const raw = makeCanvas(QUIET_CLEAR)
    const busyRegion = placementFor('bottom-right')
    const quietRegion = placementFor('top-left')
    paintCheckerboard(raw, busyRegion, 250, 30)
    const picture = await toPng(raw)

    const busy = await regionLuminanceStats(picture, busyRegion)
    const quiet = await regionLuminanceStats(picture, quietRegion)

    expect(quiet?.spread ?? -1).toBeCloseTo(0, 5)
    expect(busy?.spread).toBeGreaterThan(0.3)
    // A flat wall and a plate of samosas CAN share a mean: assert the two
    // regions here are not being told apart by mean alone.
    expect(Math.abs((busy?.mean ?? 0) - (quiet?.mean ?? 0))).toBeLessThan(0.3)
  })
})
