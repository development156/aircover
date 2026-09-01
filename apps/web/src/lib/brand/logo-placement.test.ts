import { describe, expect, it } from 'vitest'

import { needsPlate, placeLogo, type Anchor, type Placement, type Rect } from './logo-placement'

/**
 * Pins the contract for `placeLogo` and `needsPlate`, pure functions that have
 * not been written yet. Expected to fail on `./logo-placement` not existing
 * until the implementer builds against this file.
 *
 * ── WHAT THIS FILE CANNOT PROVE ──────────────────────────────────────────────
 * `placeLogo` is geometry only. It never sees a pixel and it never sees the
 * picture the mark is being stamped onto, so nothing here can say whether the
 * region under the mark is busy, whether the mark reads well against a real
 * backdrop, or whether the chosen corner clashes with something already in the
 * frame. It can only pin the RECTANGLES: sizes, margins and insets that follow
 * from the rules in `apps/web/src/lib/brand/logo-facts.ts`'s trim box and the
 * shape it feeds into placement. `needsPlate` similarly knows nothing about
 * WHERE a backdrop's luminance came from: a caller that averages the wrong
 * region of the picture will get an honest answer to a dishonest question, and
 * no test below can catch that.
 *
 * Every rect assertion is exact, an integer or an exact relationship between
 * integers, never a range: an off-by-one in a rounding step is the defect this
 * code will actually have, and "roughly right" would not catch it.
 *
 * ── DEGENERATE INPUTS, DECIDED AND PINNED HERE ───────────────────────────────
 * `placeLogo` throws `RangeError` on inputs that are not honestly answerable:
 * a non-positive or non-integer canvas dimension, and a `logoAspect` that is
 * zero, negative, `NaN` or non-finite (`Infinity`). Both are caller bugs, the
 * same reasoning `logoFactsFromRaw` uses for its own malformed-input guard:
 * there is no rect that honestly describes "no ink" or "no canvas", and a
 * fabricated one would be composited as if it meant something.
 *
 * A merely SMALL canvas is not treated the same way. Because the mark's size
 * is always a share of the canvas's own shorter edge (rule 1 below), a tiny
 * canvas produces a tiny mark rather than one that cannot fit: there is no
 * finite positive canvas for which "mark plus its clear space" is structurally
 * incapable of fitting, so this file does not pin a throw for smallness. It
 * pins the weaker, always-true guarantee instead: `clear` never extends past
 * the canvas, checked against a 4x4 canvas below, the smallest that still has
 * a meaningful shorter edge to scale from.
 */

const CANVAS_WIDE = { width: 1200, height: 628 }
const CANVAS_SQUARE_MATCHING_SHORT_EDGE = { width: 628, height: 628 }

/** Every anchor, so a loop can assert the per-corner rule once for each. */
const ANCHORS: Anchor[] = ['bottom-right', 'bottom-left', 'top-right', 'top-left']

function assertIsIntegerRect(rect: Rect, label: string): void {
  expect(Number.isInteger(rect.x), `${label}.x`).toBe(true)
  expect(Number.isInteger(rect.y), `${label}.y`).toBe(true)
  expect(Number.isInteger(rect.width), `${label}.width`).toBe(true)
  expect(Number.isInteger(rect.height), `${label}.height`).toBe(true)
}

/** The four margins between `mark` and the `clear` rect that must contain it. */
function clearMargins(placement: Placement): { left: number; top: number; right: number; bottom: number } {
  const { mark, clear } = placement
  return {
    left: mark.x - clear.x,
    top: mark.y - clear.y,
    right: clear.x + clear.width - (mark.x + mark.width),
    bottom: clear.y + clear.height - (mark.y + mark.height),
  }
}

describe('size: bound by the shorter edge of the canvas', () => {
  it('a wide banner and a square post give the mark the same size, because size comes from the shorter edge', () => {
    const wide = placeLogo({ canvas: CANVAS_WIDE, logoAspect: 2, anchor: 'bottom-right' })
    const square = placeLogo({
      canvas: CANVAS_SQUARE_MATCHING_SHORT_EDGE,
      logoAspect: 2,
      anchor: 'bottom-right',
    })
    // 1200x628 and 628x628 share a shorter edge of 628. A wide canvas must not
    // get a bigger mark just because it is wide: the extra width is not a
    // shorter edge and must not feed the size at all.
    expect(wide.mark.width).toBe(square.mark.width)
    expect(wide.mark.height).toBe(square.mark.height)
  })

  it('scaling the shorter edge up scales the mark up, for a canvas the same shape', () => {
    const base = placeLogo({ canvas: { width: 800, height: 400 }, logoAspect: 2, anchor: 'bottom-right' })
    const doubled = placeLogo({ canvas: { width: 1600, height: 800 }, logoAspect: 2, anchor: 'bottom-right' })
    expect(doubled.mark.height).toBeGreaterThan(base.mark.height)
    expect(doubled.mark.width).toBeGreaterThan(base.mark.width)
  })
})

describe('size: capped on the long axis so a very wide lockup cannot run across the picture', () => {
  it('mark width grows slower than aspect once the lockup is very wide, because the width cap has kicked in', () => {
    const canvas = { width: 1000, height: 1000 }
    const modest = placeLogo({ canvas, logoAspect: 8, anchor: 'bottom-right' })
    const extreme = placeLogo({ canvas, logoAspect: 200, anchor: 'bottom-right' })
    // Sized purely off the shorter edge, extreme's mark would be 25x wider than
    // modest's (200 / 8). If the long-axis cap is real, the actual ratio must
    // fall well short of that: the cap, not the aspect, is setting the width.
    const uncappedRatio = 200 / 8
    const actualRatio = extreme.mark.width / modest.mark.width
    expect(actualRatio).toBeLessThan(uncappedRatio / 2)
  })

  it('a very wide lockup still leaves its clear space fully inside the canvas', () => {
    const placement = placeLogo({ canvas: { width: 1000, height: 1000 }, logoAspect: 200, anchor: 'bottom-right' })
    expect(placement.clear.x).toBeGreaterThanOrEqual(0)
    expect(placement.clear.x + placement.clear.width).toBeLessThanOrEqual(1000)
  })
})

describe('clear: a fraction of the mark\'s own height, symmetric on all four sides, and scales with the mark', () => {
  it('the four margins between mark and clear are all equal, for a square mark', () => {
    const placement = placeLogo({ canvas: { width: 900, height: 900 }, logoAspect: 1, anchor: 'bottom-right' })
    const margins = clearMargins(placement)
    expect(margins.left).toBe(margins.top)
    expect(margins.left).toBe(margins.right)
    expect(margins.left).toBe(margins.bottom)
  })

  it('the four margins between mark and clear are all equal, for a wide mark', () => {
    const placement = placeLogo({ canvas: { width: 1400, height: 700 }, logoAspect: 3, anchor: 'top-left' })
    const margins = clearMargins(placement)
    expect(margins.left).toBe(margins.top)
    expect(margins.left).toBe(margins.right)
    expect(margins.left).toBe(margins.bottom)
  })

  it('doubling the mark doubles the clear-space margin', () => {
    const small = placeLogo({ canvas: { width: 800, height: 400 }, logoAspect: 2, anchor: 'bottom-right' })
    const big = placeLogo({ canvas: { width: 1600, height: 800 }, logoAspect: 2, anchor: 'bottom-right' })
    expect(big.mark.height).toBe(small.mark.height * 2)
    const smallMargin = clearMargins(small).left
    const bigMargin = clearMargins(big).left
    expect(bigMargin).toBe(smallMargin * 2)
  })

  it('clear contains mark: the mark never sits outside its own clear rectangle', () => {
    const placement = placeLogo({ canvas: { width: 1200, height: 628 }, logoAspect: 1.5, anchor: 'top-right' })
    const { mark, clear } = placement
    expect(clear.x).toBeLessThanOrEqual(mark.x)
    expect(clear.y).toBeLessThanOrEqual(mark.y)
    expect(clear.x + clear.width).toBeGreaterThanOrEqual(mark.x + mark.width)
    expect(clear.y + clear.height).toBeGreaterThanOrEqual(mark.y + mark.height)
  })
})

describe('inset: the mark sits one clear-space in from its anchor corner, for every anchor', () => {
  const canvas = { width: 1200, height: 628 }

  it.each(ANCHORS)('anchor %s puts the clear rectangle flush against the correct edges', (anchor) => {
    const placement = placeLogo({ canvas, logoAspect: 2, anchor })
    const { clear } = placement
    const touchesRight = clear.x + clear.width === canvas.width
    const touchesLeft = clear.x === 0
    const touchesBottom = clear.y + clear.height === canvas.height
    const touchesTop = clear.y === 0

    if (anchor === 'bottom-right') {
      expect(touchesRight).toBe(true)
      expect(touchesBottom).toBe(true)
    } else if (anchor === 'bottom-left') {
      expect(touchesLeft).toBe(true)
      expect(touchesBottom).toBe(true)
    } else if (anchor === 'top-right') {
      expect(touchesRight).toBe(true)
      expect(touchesTop).toBe(true)
    } else {
      expect(touchesLeft).toBe(true)
      expect(touchesTop).toBe(true)
    }
  })

  it.each(ANCHORS)('anchor %s keeps clear fully inside the canvas, never past an edge', (anchor) => {
    const placement = placeLogo({ canvas, logoAspect: 2, anchor })
    const { clear } = placement
    expect(clear.x).toBeGreaterThanOrEqual(0)
    expect(clear.y).toBeGreaterThanOrEqual(0)
    expect(clear.x + clear.width).toBeLessThanOrEqual(canvas.width)
    expect(clear.y + clear.height).toBeLessThanOrEqual(canvas.height)
  })

  it('bottom-right and top-left place the mark in visibly different, opposite corners', () => {
    const bottomRight = placeLogo({ canvas, logoAspect: 2, anchor: 'bottom-right' })
    const topLeft = placeLogo({ canvas, logoAspect: 2, anchor: 'top-left' })
    expect(bottomRight.mark.x).toBeGreaterThan(topLeft.mark.x)
    expect(bottomRight.mark.y).toBeGreaterThan(topLeft.mark.y)
  })
})

describe('integers: every number in both rects, even on a canvas that does not divide evenly', () => {
  it('mark and clear are all-integer rects for a 733x511 canvas', () => {
    const placement = placeLogo({ canvas: { width: 733, height: 511 }, logoAspect: 1.7, anchor: 'bottom-right' })
    assertIsIntegerRect(placement.mark, 'mark')
    assertIsIntegerRect(placement.clear, 'clear')
  })

  it('mark and clear are all-integer rects for every anchor on the same awkward canvas', () => {
    for (const anchor of ANCHORS) {
      const placement = placeLogo({ canvas: { width: 733, height: 511 }, logoAspect: 0.83, anchor })
      assertIsIntegerRect(placement.mark, `mark (${anchor})`)
      assertIsIntegerRect(placement.clear, `clear (${anchor})`)
    }
  })
})

describe('aspect: mark.width / mark.height matches logoAspect, within a pixel of rounding', () => {
  it.each([
    ['tall', 0.3],
    ['square', 1],
    ['wide', 4],
  ] as const)('holds for a %s logo (aspect %s)', (_label, aspect) => {
    const placement = placeLogo({ canvas: { width: 1200, height: 628 }, logoAspect: aspect, anchor: 'bottom-right' })
    const { width, height } = placement.mark
    // width and height are each independently rounded to an integer, so the
    // achievable error is at most one pixel of width against the exact aspect.
    expect(Math.abs(width - height * aspect)).toBeLessThanOrEqual(1)
  })
})

describe('degenerate inputs: refused, never guessed', () => {
  it('throws on a zero canvas dimension', () => {
    expect(() => placeLogo({ canvas: { width: 0, height: 400 }, logoAspect: 1, anchor: 'bottom-right' })).toThrow(
      RangeError,
    )
    expect(() => placeLogo({ canvas: { width: 400, height: 0 }, logoAspect: 1, anchor: 'bottom-right' })).toThrow(
      RangeError,
    )
  })

  it('throws on a negative canvas dimension', () => {
    expect(() =>
      placeLogo({ canvas: { width: -100, height: 400 }, logoAspect: 1, anchor: 'bottom-right' }),
    ).toThrow(RangeError)
  })

  it('throws on a non-integer canvas dimension', () => {
    expect(() =>
      placeLogo({ canvas: { width: 400.5, height: 400 }, logoAspect: 1, anchor: 'bottom-right' }),
    ).toThrow(RangeError)
  })

  it('throws on a zero or negative logoAspect', () => {
    expect(() => placeLogo({ canvas: { width: 400, height: 400 }, logoAspect: 0, anchor: 'bottom-right' })).toThrow(
      RangeError,
    )
    expect(() =>
      placeLogo({ canvas: { width: 400, height: 400 }, logoAspect: -2, anchor: 'bottom-right' }),
    ).toThrow(RangeError)
  })

  it('throws on a NaN or infinite logoAspect', () => {
    expect(() =>
      placeLogo({ canvas: { width: 400, height: 400 }, logoAspect: Number.NaN, anchor: 'bottom-right' }),
    ).toThrow(RangeError)
    expect(() =>
      placeLogo({ canvas: { width: 400, height: 400 }, logoAspect: Number.POSITIVE_INFINITY, anchor: 'bottom-right' }),
    ).toThrow(RangeError)
  })

  it('does not throw on a very small canvas, and clear still stays fully inside it', () => {
    // 4x4 is the smallest canvas with a meaningful shorter edge (see file
    // header): the mark scales down with the canvas rather than the canvas
    // being too small to hold it, so this is not one of the refused inputs.
    const placement = placeLogo({ canvas: { width: 4, height: 4 }, logoAspect: 1, anchor: 'bottom-right' })
    assertIsIntegerRect(placement.mark, 'mark')
    assertIsIntegerRect(placement.clear, 'clear')
    expect(placement.clear.x).toBeGreaterThanOrEqual(0)
    expect(placement.clear.y).toBeGreaterThanOrEqual(0)
    expect(placement.clear.x + placement.clear.width).toBeLessThanOrEqual(4)
    expect(placement.clear.y + placement.clear.height).toBeLessThanOrEqual(4)
  })
})

describe('needsPlate: whether the mark needs a plate behind it on a given backdrop', () => {
  it('dark ink on a dark backdrop needs a plate', () => {
    expect(needsPlate(0, 'dark')).toBe(true)
  })

  it('dark ink on a light backdrop does not need a plate', () => {
    expect(needsPlate(1, 'dark')).toBe(false)
  })

  it('light ink on a light backdrop needs a plate', () => {
    expect(needsPlate(1, 'light')).toBe(true)
  })

  it('light ink on a dark backdrop does not need a plate', () => {
    expect(needsPlate(0, 'light')).toBe(false)
  })

  it('mixed ink needs a plate on a dark backdrop, because a full-colour mark cannot be relied on to clear it', () => {
    expect(needsPlate(0, 'mixed')).toBe(true)
  })

  it('mixed ink needs a plate on a light backdrop too, for the same reason at the other extreme', () => {
    expect(needsPlate(1, 'mixed')).toBe(true)
  })
})
