import { describe, expect, it } from 'vitest'

import {
  needsPlate,
  placeLogo,
  plateDecisionFor,
  type Anchor,
  type MixedInkMeasurement,
  type Placement,
  type Rect,
} from './logo-placement'

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
function clearMargins(placement: Placement): {
  left: number
  top: number
  right: number
  bottom: number
} {
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
    const base = placeLogo({
      canvas: { width: 800, height: 400 },
      logoAspect: 2,
      anchor: 'bottom-right',
    })
    const doubled = placeLogo({
      canvas: { width: 1600, height: 800 },
      logoAspect: 2,
      anchor: 'bottom-right',
    })
    expect(doubled.mark.height).toBeGreaterThan(base.mark.height)
    expect(doubled.mark.width).toBeGreaterThan(base.mark.width)
  })
})

describe('size: sizeStep changes how big the mark is, and defaults to medium', () => {
  it('omitting sizeStep gives the same mark as passing "medium" explicitly', () => {
    const omitted = placeLogo({ canvas: CANVAS_WIDE, logoAspect: 1.5, anchor: 'bottom-right' })
    const explicit = placeLogo({
      canvas: CANVAS_WIDE,
      logoAspect: 1.5,
      anchor: 'bottom-right',
      sizeStep: 'medium',
    })
    expect(omitted).toEqual(explicit)
  })

  it('small is smaller than medium, and large is bigger than medium, for the same canvas', () => {
    const small = placeLogo({
      canvas: CANVAS_WIDE,
      logoAspect: 1.5,
      anchor: 'bottom-right',
      sizeStep: 'small',
    })
    const medium = placeLogo({
      canvas: CANVAS_WIDE,
      logoAspect: 1.5,
      anchor: 'bottom-right',
      sizeStep: 'medium',
    })
    const large = placeLogo({
      canvas: CANVAS_WIDE,
      logoAspect: 1.5,
      anchor: 'bottom-right',
      sizeStep: 'large',
    })
    expect(small.mark.height).toBeLessThan(medium.mark.height)
    expect(medium.mark.height).toBeLessThan(large.mark.height)
  })

  it('every size step keeps its clear rectangle fully inside the canvas', () => {
    for (const sizeStep of ['small', 'medium', 'large'] as const) {
      const placement = placeLogo({
        canvas: CANVAS_WIDE,
        logoAspect: 1.5,
        anchor: 'bottom-right',
        sizeStep,
      })
      expect(placement.clear.x, sizeStep).toBeGreaterThanOrEqual(0)
      expect(placement.clear.y, sizeStep).toBeGreaterThanOrEqual(0)
      expect(placement.clear.x + placement.clear.width, sizeStep).toBeLessThanOrEqual(
        CANVAS_WIDE.width,
      )
      expect(placement.clear.y + placement.clear.height, sizeStep).toBeLessThanOrEqual(
        CANVAS_WIDE.height,
      )
    }
  })

  it("every step's exact share, unclamped, on a square canvas where no cap can engage", () => {
    // A square canvas with a square logo trips neither cap: width and height
    // caps are both well above the size any of these shares can reach at
    // 1000px. So the mark's height is the share times the shorter edge,
    // EXACTLY, and this is the test that would catch a share silently
    // drifting rather than merely "getting bigger" — a step could double and
    // the ordering assertion above would still pass.
    const canvas = { width: 1000, height: 1000 }
    expect(
      placeLogo({ canvas, logoAspect: 1, anchor: 'bottom-right', sizeStep: 'small' }).mark.height,
    ).toBe(100)
    expect(
      placeLogo({ canvas, logoAspect: 1, anchor: 'bottom-right', sizeStep: 'medium' }).mark.height,
    ).toBe(140)
    expect(
      placeLogo({ canvas, logoAspect: 1, anchor: 'bottom-right', sizeStep: 'large' }).mark.height,
    ).toBe(200)
  })

  it('the height cap still cannot bind at "large", the biggest step, on a tall canvas', () => {
    // A tall, narrow canvas is the shape that pushes the starting height
    // closest to MAX_MARK_HEIGHT_SHARE (0.25), because the shorter edge and
    // the canvas height are close together. If the height cap were reachable
    // at any step, this is where it would show up first.
    const tall = { width: 500, height: 2000 }
    const placement = placeLogo({
      canvas: tall,
      logoAspect: 1,
      anchor: 'bottom-right',
      sizeStep: 'large',
    })
    // 0.2 (large's share) * 500 (shorter edge) = 100, well under 0.25 * 2000 = 500.
    // Exact, not just "less than": an exact match is what the cap NOT
    // engaging looks like, and a range would pass just as well if the cap
    // silently kicked in and clamped it to something still under the bound.
    expect(placement.mark.height).toBe(100)
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
    const placement = placeLogo({
      canvas: { width: 1000, height: 1000 },
      logoAspect: 200,
      anchor: 'bottom-right',
    })
    expect(placement.clear.x).toBeGreaterThanOrEqual(0)
    expect(placement.clear.x + placement.clear.width).toBeLessThanOrEqual(1000)
  })
})

describe("clear: a fraction of the mark's own height, symmetric on all four sides, and scales with the mark", () => {
  it('the four margins between mark and clear are all equal, for a square mark', () => {
    const placement = placeLogo({
      canvas: { width: 900, height: 900 },
      logoAspect: 1,
      anchor: 'bottom-right',
    })
    const margins = clearMargins(placement)
    expect(margins.left).toBe(margins.top)
    expect(margins.left).toBe(margins.right)
    expect(margins.left).toBe(margins.bottom)
  })

  it('the four margins between mark and clear are all equal, for a wide mark', () => {
    const placement = placeLogo({
      canvas: { width: 1400, height: 700 },
      logoAspect: 3,
      anchor: 'top-left',
    })
    const margins = clearMargins(placement)
    expect(margins.left).toBe(margins.top)
    expect(margins.left).toBe(margins.right)
    expect(margins.left).toBe(margins.bottom)
  })

  it('doubling the mark doubles the clear-space margin', () => {
    const small = placeLogo({
      canvas: { width: 800, height: 400 },
      logoAspect: 2,
      anchor: 'bottom-right',
    })
    const big = placeLogo({
      canvas: { width: 1600, height: 800 },
      logoAspect: 2,
      anchor: 'bottom-right',
    })
    expect(big.mark.height).toBe(small.mark.height * 2)
    const smallMargin = clearMargins(small).left
    const bigMargin = clearMargins(big).left
    expect(bigMargin).toBe(smallMargin * 2)
  })

  it('clear contains mark: the mark never sits outside its own clear rectangle', () => {
    const placement = placeLogo({
      canvas: { width: 1200, height: 628 },
      logoAspect: 1.5,
      anchor: 'top-right',
    })
    const { mark, clear } = placement
    expect(clear.x).toBeLessThanOrEqual(mark.x)
    expect(clear.y).toBeLessThanOrEqual(mark.y)
    expect(clear.x + clear.width).toBeGreaterThanOrEqual(mark.x + mark.width)
    expect(clear.y + clear.height).toBeGreaterThanOrEqual(mark.y + mark.height)
  })
})

describe('plate: strictly inside clear, never the exclusion zone itself', () => {
  const CASES: Array<{ label: string; canvas: { width: number; height: number }; aspect: number }> =
    [
      { label: 'ordinary wide canvas', canvas: CANVAS_WIDE, aspect: 1.5 },
      { label: 'square canvas', canvas: { width: 1000, height: 1000 }, aspect: 1 },
      // The extreme aspects the width-cap comment in logo-placement.ts already
      // measured re-deriving markHeight down to 1px, which is exactly the
      // markHeight where pad and margin round to the same integer unless the
      // clamp holds.
      { label: '200x200 canvas, aspect 200', canvas: { width: 200, height: 200 }, aspect: 200 },
      { label: '1080x1080 canvas, aspect 10', canvas: { width: 1080, height: 1080 }, aspect: 10 },
      { label: '1080x1080 canvas, aspect 16', canvas: { width: 1080, height: 1080 }, aspect: 16 },
    ]

  it.each(CASES)('$label: plate is strictly inside clear, on every side', ({ canvas, aspect }) => {
    for (const anchor of ANCHORS) {
      const { plate, clear } = placeLogo({ canvas, logoAspect: aspect, anchor })
      expect(plate.x, 'plate.x > clear.x').toBeGreaterThan(clear.x)
      expect(plate.y, 'plate.y > clear.y').toBeGreaterThan(clear.y)
      expect(plate.x + plate.width, 'plate right < clear right').toBeLessThan(clear.x + clear.width)
      expect(plate.y + plate.height, 'plate bottom < clear bottom').toBeLessThan(
        clear.y + clear.height,
      )
    }
  })

  it.each(CASES)('$label: plate is strictly inside the canvas', ({ canvas, aspect }) => {
    for (const anchor of ANCHORS) {
      const { plate } = placeLogo({ canvas, logoAspect: aspect, anchor })
      expect(plate.x).toBeGreaterThanOrEqual(0)
      expect(plate.y).toBeGreaterThanOrEqual(0)
      expect(plate.x + plate.width).toBeLessThanOrEqual(canvas.width)
      expect(plate.y + plate.height).toBeLessThanOrEqual(canvas.height)
    }
  })

  it.each(CASES)('$label: plate is smaller than clear in both dimensions', ({ canvas, aspect }) => {
    for (const anchor of ANCHORS) {
      const { plate, clear } = placeLogo({ canvas, logoAspect: aspect, anchor })
      expect(plate.width).toBeLessThan(clear.width)
      expect(plate.height).toBeLessThan(clear.height)
    }
  })

  it('plate contains mark, and is centred on it', () => {
    const placement = placeLogo({
      canvas: { width: 900, height: 900 },
      logoAspect: 1,
      anchor: 'bottom-right',
    })
    const { mark, plate } = placement
    expect(plate.x).toBeLessThanOrEqual(mark.x)
    expect(plate.y).toBeLessThanOrEqual(mark.y)
    expect(plate.x + plate.width).toBeGreaterThanOrEqual(mark.x + mark.width)
    expect(plate.y + plate.height).toBeGreaterThanOrEqual(mark.y + mark.height)
    // Centred: the gap on the left equals the gap on the right, same for top/bottom.
    const leftGap = mark.x - plate.x
    const rightGap = plate.x + plate.width - (mark.x + mark.width)
    const topGap = mark.y - plate.y
    const bottomGap = plate.y + plate.height - (mark.y + mark.height)
    expect(leftGap).toBe(rightGap)
    expect(topGap).toBe(bottomGap)
  })

  it("plate's exact pad is a quarter of the mark's height, not merely smaller than clear's half", () => {
    // A square canvas and a square mark, at 'large', where no cap engages: the
    // exact-share test above already pins mark.height at 200 for these
    // inputs. margin (CLEAR_SPACE_SHARE 0.5) is round(200 * 0.5) = 100, and pad
    // (PLATE_PAD_SHARE 0.25) must be round(200 * 0.25) = 50, EXACTLY. A test
    // that only checked "plate is smaller than clear" would keep passing if
    // PLATE_PAD_SHARE silently drifted back up toward CLEAR_SPACE_SHARE, right
    // up until the clamp below margin started biting; this test catches the
    // drift immediately, at the first pixel it changes.
    const canvas = { width: 1000, height: 1000 }
    const placement = placeLogo({
      canvas,
      logoAspect: 1,
      anchor: 'bottom-right',
      sizeStep: 'large',
    })
    expect(placement.mark.height).toBe(200)
    const pad = (placement.plate.width - placement.mark.width) / 2
    expect(pad).toBe(50)
    expect(placement.plate.width).toBe(300)
    expect(placement.plate.height).toBe(300)
  })

  it('the tiniest reachable mark (markHeight 1px, at the 200x200/aspect-200 extreme) still keeps plate strictly inside clear', () => {
    const placement = placeLogo({
      canvas: { width: 200, height: 200 },
      logoAspect: 200,
      anchor: 'bottom-right',
    })
    // Pin the extreme this case exists to reach: this is the width-cap
    // derivation the file's own comment measures landing on markHeight 1.
    expect(placement.mark.height).toBe(1)
    expect(placement.plate.width).toBeLessThan(placement.clear.width)
    expect(placement.plate.height).toBeLessThan(placement.clear.height)
    expect(placement.plate.x).toBeGreaterThan(placement.clear.x)
    expect(placement.plate.y).toBeGreaterThan(placement.clear.y)
  })
})

describe('inset: the mark sits one clear-space in from its anchor corner, for every anchor', () => {
  const canvas = { width: 1200, height: 628 }

  it.each(ANCHORS)(
    'anchor %s puts the clear rectangle flush against the correct edges',
    (anchor) => {
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
    },
  )

  it.each(ANCHORS)(
    'anchor %s keeps clear fully inside the canvas, never past an edge',
    (anchor) => {
      const placement = placeLogo({ canvas, logoAspect: 2, anchor })
      const { clear } = placement
      expect(clear.x).toBeGreaterThanOrEqual(0)
      expect(clear.y).toBeGreaterThanOrEqual(0)
      expect(clear.x + clear.width).toBeLessThanOrEqual(canvas.width)
      expect(clear.y + clear.height).toBeLessThanOrEqual(canvas.height)
    },
  )

  it('bottom-right and top-left place the mark in visibly different, opposite corners', () => {
    const bottomRight = placeLogo({ canvas, logoAspect: 2, anchor: 'bottom-right' })
    const topLeft = placeLogo({ canvas, logoAspect: 2, anchor: 'top-left' })
    expect(bottomRight.mark.x).toBeGreaterThan(topLeft.mark.x)
    expect(bottomRight.mark.y).toBeGreaterThan(topLeft.mark.y)
  })
})

describe('integers: every number in both rects, even on a canvas that does not divide evenly', () => {
  it('mark and clear are all-integer rects for a 733x511 canvas', () => {
    const placement = placeLogo({
      canvas: { width: 733, height: 511 },
      logoAspect: 1.7,
      anchor: 'bottom-right',
    })
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
    const placement = placeLogo({
      canvas: { width: 1200, height: 628 },
      logoAspect: aspect,
      anchor: 'bottom-right',
    })
    const { width, height } = placement.mark
    // width and height are each independently rounded to an integer, so the
    // achievable error is at most one pixel of width against the exact aspect.
    expect(Math.abs(width - height * aspect)).toBeLessThanOrEqual(1)
  })
})

describe('degenerate inputs: refused, never guessed', () => {
  it('throws on a zero canvas dimension', () => {
    expect(() =>
      placeLogo({ canvas: { width: 0, height: 400 }, logoAspect: 1, anchor: 'bottom-right' }),
    ).toThrow(RangeError)
    expect(() =>
      placeLogo({ canvas: { width: 400, height: 0 }, logoAspect: 1, anchor: 'bottom-right' }),
    ).toThrow(RangeError)
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
    expect(() =>
      placeLogo({ canvas: { width: 400, height: 400 }, logoAspect: 0, anchor: 'bottom-right' }),
    ).toThrow(RangeError)
    expect(() =>
      placeLogo({ canvas: { width: 400, height: 400 }, logoAspect: -2, anchor: 'bottom-right' }),
    ).toThrow(RangeError)
  })

  it('throws on a NaN or infinite logoAspect', () => {
    expect(() =>
      placeLogo({
        canvas: { width: 400, height: 400 },
        logoAspect: Number.NaN,
        anchor: 'bottom-right',
      }),
    ).toThrow(RangeError)
    expect(() =>
      placeLogo({
        canvas: { width: 400, height: 400 },
        logoAspect: Number.POSITIVE_INFINITY,
        anchor: 'bottom-right',
      }),
    ).toThrow(RangeError)
  })

  it('does not throw on a very small canvas, and clear still stays fully inside it', () => {
    // 4x4 is the smallest canvas with a meaningful shorter edge (see file
    // header): the mark scales down with the canvas rather than the canvas
    // being too small to hold it, so this is not one of the refused inputs.
    const placement = placeLogo({
      canvas: { width: 4, height: 4 },
      logoAspect: 1,
      anchor: 'bottom-right',
    })
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

describe('plateDecisionFor: which of the three mixed cases a measurement lands in', () => {
  it('is unmeasured when no measurement is given at all, so mixed keeps plating by default', () => {
    expect(plateDecisionFor(undefined)).toEqual({ kind: 'unmeasured' })
  })

  it('is unmeasured when the mark has no ink to measure', () => {
    const mark: MixedInkMeasurement = { meanInkLuminance: null, darkInkShare: 0, lightInkShare: 0 }
    expect(plateDecisionFor(mark)).toEqual({ kind: 'unmeasured' })
  })

  it('is bipolar when both shares clear the minority threshold, whatever the mean says', () => {
    const mark: MixedInkMeasurement = {
      meanInkLuminance: 0.5,
      darkInkShare: 0.4,
      lightInkShare: 0.4,
    }
    expect(plateDecisionFor(mark)).toEqual({ kind: 'bipolar' })
  })

  it('is NOT bipolar when only one share clears the threshold', () => {
    const mark: MixedInkMeasurement = {
      meanInkLuminance: 0.18,
      darkInkShare: 0.9,
      lightInkShare: 0,
    }
    expect(plateDecisionFor(mark)).toEqual({ kind: 'measured', markLuminance: 0.18 })
  })

  it('is measured, carrying the mean, for a genuinely mid-tone mark', () => {
    const mark: MixedInkMeasurement = { meanInkLuminance: 0.18, darkInkShare: 0, lightInkShare: 0 }
    expect(plateDecisionFor(mark)).toEqual({ kind: 'measured', markLuminance: 0.18 })
  })
})

describe('needsPlate: a mixed mark measured as mid-tone is judged on its own contrast', () => {
  // meanInkLuminance ~0.1791 is the point that maximises the WORSE of its two
  // contrasts against pure black and pure white at once: 20L+1 = 1.05/(L+.05)
  // solves to L ≈ 0.1791, giving ~4.58:1 either way, comfortably over 4.5:1
  // without leaning on a sliver narrower than any real measurement.
  const MID_TONE: MixedInkMeasurement = {
    meanInkLuminance: 0.1791,
    darkInkShare: 0,
    lightInkShare: 0,
  }

  it('does not plate a mid-tone mark on a near-black backdrop, unlike the old unconditional rule', () => {
    expect(needsPlate(0, 'mixed', MID_TONE)).toBe(false)
  })

  it('does not plate the SAME mid-tone mark on a near-white backdrop either', () => {
    expect(needsPlate(1, 'mixed', MID_TONE)).toBe(false)
  })

  it('plates a mid-tone mark whose contrast genuinely fails against a similarly mid backdrop', () => {
    // Mark at 0.3 against a backdrop at 0.35: two close-together mid-tones,
    // (0.35+.05)/(0.3+.05) ≈ 1.14:1, nowhere near 4.5:1.
    const mark: MixedInkMeasurement = { meanInkLuminance: 0.3, darkInkShare: 0, lightInkShare: 0 }
    expect(needsPlate(0.35, 'mixed', mark)).toBe(true)
  })

  it('still plates unconditionally when the same mid-tone luminance is reported bipolar', () => {
    const bipolar: MixedInkMeasurement = {
      meanInkLuminance: 0.1791,
      darkInkShare: 0.4,
      lightInkShare: 0.4,
    }
    expect(needsPlate(0, 'mixed', bipolar)).toBe(true)
    expect(needsPlate(1, 'mixed', bipolar)).toBe(true)
  })

  it('plates unconditionally when mark info is passed but unmeasured (no ink)', () => {
    const noInk: MixedInkMeasurement = { meanInkLuminance: null, darkInkShare: 0, lightInkShare: 0 }
    expect(needsPlate(0, 'mixed', noInk)).toBe(true)
  })
})

describe('the width cap holds for a wide wordmark, and the mark stays on the canvas', () => {
  /**
   * ── THE INVARIANT THE ROUNDING STEP WAS BREAKING ───────────────────────────
   * `markWidth` was re-derived as `round(markHeight) * logoAspect` AFTER the
   * caps had scaled the rect, using the uncapped aspect — so it walked back past
   * `MAX_MARK_WIDTH_SHARE`. The existing cap test passes only because it picked
   * 1000x1000 with a modest aspect, one of the canvases where it still held.
   *
   * MEASURED before the fix, cap 346px on a 1080 canvas: aspect 6 shipped 348,
   * aspect 10 shipped 350, aspect 16 shipped 352. Ordinary wide wordmarks.
   */
  const CAP_SHARE = 0.32

  it('never exceeds the width cap, at any aspect a caller may pass', () => {
    for (const aspect of [2, 6, 8, 10, 12, 16, 20, 200]) {
      for (const canvas of [
        { width: 1080, height: 1080 },
        { width: 1200, height: 628 },
        { width: 400, height: 400 },
        { width: 200, height: 200 },
      ]) {
        const p = placeLogo({ canvas, logoAspect: aspect, anchor: 'bottom-right' })
        expect(
          p.mark.width,
          `aspect ${aspect} on ${canvas.width}x${canvas.height}`,
        ).toBeLessThanOrEqual(Math.floor(CAP_SHARE * canvas.width))
      }
    }
  })

  it('keeps the clear box inside the canvas, which is the header\u2019s own promise', () => {
    // The file says no positive canvas is structurally impossible. At 200x200
    // with an aspect-200 lockup the clear box was 202 wide at x = -2.
    for (const aspect of [2, 10, 200]) {
      for (const canvas of [
        { width: 1080, height: 1080 },
        { width: 400, height: 400 },
        { width: 200, height: 200 },
      ]) {
        const p = placeLogo({ canvas, logoAspect: aspect, anchor: 'bottom-right' })
        const where = `aspect ${aspect} on ${canvas.width}x${canvas.height}`
        expect(p.clear.x, where).toBeGreaterThanOrEqual(0)
        expect(p.clear.y, where).toBeGreaterThanOrEqual(0)
        expect(p.clear.x + p.clear.width, where).toBeLessThanOrEqual(canvas.width)
        expect(p.clear.y + p.clear.height, where).toBeLessThanOrEqual(canvas.height)
      }
    }
  })
})
