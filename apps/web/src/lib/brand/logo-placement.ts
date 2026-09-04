/**
 * Where a logo sits on a rendered picture, and whether it needs a plate behind it.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * `logo-facts.ts` answers what a logo IS. This file answers where it GOES. Every
 * generated banner, square post and story stamps the same mark, and the two ways
 * that goes wrong are both geometric: a mark sized off the wrong edge is a
 * postage stamp on one format and a billboard on the next, and a mark pushed
 * into a corner with no breathing room reads as a watermark somebody forgot to
 * remove. Both rules live here once, as pure arithmetic, so that the renderer,
 * the preview and any future export agree on the pixel rather than each having
 * its own opinion.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────
 * It never sees a pixel. It does not decode, composite, draw, or read the
 * picture the mark is going onto. It cannot tell you that the bottom-right
 * corner already holds a face, that the region under the mark is busy, or that
 * the corner you asked for is the wrong corner. Those need the image and belong
 * to the caller. `needsPlate` likewise knows nothing about WHERE a backdrop
 * luminance was measured: hand it the average of the wrong region and it returns
 * an honest answer to a dishonest question.
 *
 * ── ONE MENTAL MODEL: THE CLEAR RECTANGLE IS WHAT GETS PLACED ───────────────
 * The mark is never positioned directly. What is positioned is `clear`, the mark
 * plus its breathing room, and `clear` is what sits flush into the anchor
 * corner. The mark then sits inside it. That is why the inset from the canvas
 * edge and the gap between the mark and anything else are the same number: there
 * is only one number, and it scales with the mark rather than being a fixed
 * pixel margin that swallows a 400px square and vanishes on a 4000px one.
 *
 * `clear` is never itself painted. It is the exclusion zone, the claim that
 * nothing else comes within that gap of the mark, and a caller that paints
 * `clear` has turned a guarantee into a slab flush against the picture's own
 * edge. What a caller paints, when `needsPlate` says one is needed at all, is
 * `plate`: a third rectangle, smaller than `clear` and centred on the same
 * mark, that always leaves real room between its own edge and `clear`'s.
 */

import type { StampSizeStep } from '@sahoda/shared'

import type { InkPolarity } from './logo-facts'

export type Anchor = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Placement {
  /** The mark itself, in canvas pixels. */
  mark: Rect
  /** The mark plus its clear space. Contains `mark` and is what sits flush into the corner. */
  clear: Rect
  /**
   * The rectangle a plate is PAINTED into, when one is needed at all.
   *
   * `clear` is an EXCLUSION ZONE, the brand report's guarantee that nothing else
   * sits within half the mark's height of it. Painting a plate over the whole of
   * `clear` was the defect this field exists to fix: it turned the guarantee
   * into an opaque slab flush against the picture's own edge, on two sides, with
   * no margin left over. `plate` is the mark plus a SMALLER pad, `PLATE_PAD_SHARE`
   * of the mark's height rather than `CLEAR_SPACE_SHARE`, so it is always
   * strictly inside `clear` with real breathing room left between the plate's own
   * edge and the picture's: the exclusion zone stays excluded even where a plate
   * is drawn. `plate` is centred on `mark`, exactly like `clear` is, so the two
   * share the same centre and differ only in how far out they reach. Whether
   * this rectangle gets painted at all is `needsPlate`'s call, not this file's:
   * a workspace whose mark already reads gets a `plate` rect it never uses.
   */
  plate: Rect
}

/**
 * The mark's height, as a share of the canvas's SHORTER edge, one entry per
 * named size step a customer may choose.
 *
 * The shorter edge, not the width and not the diagonal, because that is what
 * makes one workspace's mark look like the same mark across formats: a 1200x628
 * banner and a 628x628 square share a shorter edge and so get an identical mark.
 * Sizing off the width instead would hand the banner a mark twice the size for
 * no reason other than that the canvas is wide, and a story at 1080x1920 would
 * get a mark sized off 1920 that it has no room for.
 *
 * `medium` is 0.14, UNCHANGED from before size steps existed: a mark about a
 * seventh of the frame tall, legible when a post is viewed as a thumbnail in a
 * feed and small enough that it never competes with the content it is signing.
 * It is also `StampOptionsSchema`'s default in `@sahoda/shared`, so a request
 * that names no step draws exactly the picture it always did.
 *
 * `small` and `large` step by the same proportion either side of it (roughly
 * five sevenths and ten sevenths of `medium`) rather than by a fixed number of
 * points, so the three steps read as "smaller", "as before" and "bigger" at
 * every canvas size rather than being calibrated for one.
 */
const MARK_HEIGHT_SHARE: Record<StampSizeStep, number> = {
  small: 0.1,
  medium: 0.14,
  large: 0.2,
}

/** `medium`, the step every caller gets when it names none. */
const DEFAULT_SIZE_STEP: StampSizeStep = 'medium'

/**
 * Hard ceiling on the mark's width as a share of the canvas WIDTH.
 *
 * This is the cap that does the work. Height alone is a fine size rule for a
 * roughly square mark and a disaster for a lockup: an 8:1 wordmark sized to
 * 0.14 of the shorter edge of a 1200x628 banner would be 704px wide, running
 * 59% of the way across the picture, and a 200:1 rule-shaped mark would be wider
 * than the canvas. A third of the width is the point where a wordmark still
 * reads as a signature in the corner rather than as a header band.
 */
const MAX_MARK_WIDTH_SHARE = 0.32

/**
 * Hard ceiling on the mark's height as a share of the canvas HEIGHT.
 *
 * Honest note: at today's constants this cap CANNOT bind, for any size step,
 * and saying so is better than implying a guard that never fires. The mark's
 * height starts at `MARK_HEIGHT_SHARE[sizeStep]` of the shorter edge, the
 * shorter edge is never longer than the height, so the starting height is
 * never more than that share of the canvas height. The largest share any step
 * offers is `large` at 0.2, still below 0.25. The width cap only ever scales it
 * further down. The cap is kept because it bounds every entry in
 * MARK_HEIGHT_SHARE rather than trusting whoever next tunes one of them: raise
 * `large` past 0.25 and a tall mark on a tall canvas would eat a third of the
 * frame, and this line is what stops it instead of a review.
 */
const MAX_MARK_HEIGHT_SHARE = 0.25

/**
 * Clear space on all four sides, as a share of the MARK's own height.
 *
 * A half of the mark's height is the exclusion zone the brand report specifies,
 * and it is a share of the mark rather than of the canvas so that the mark and
 * its breathing room scale together: shrink the mark and the gap shrinks with
 * it, which is what keeps the corner looking the same at every output size. A
 * fixed pixel margin would crush a small mark against the edge and strand a
 * large one in the middle of nowhere.
 */
const CLEAR_SPACE_SHARE = 0.5

/**
 * Pad on all four sides of the PLATE, as a share of the mark's own height.
 *
 * Half of `CLEAR_SPACE_SHARE`, on purpose: the plate must never reach as far
 * out as `clear` does, or a plate at exactly the clear-space margin would BE
 * the exclusion zone rather than sit inside it, with nothing left to call a
 * guarantee. Keeping this at half leaves a margin equal to itself, 0.25 of the
 * mark's height, between the plate's own edge and the edge of `clear` (and, for
 * the anchor corner's two touching sides, the edge of the canvas) on every
 * side, at every mark size and every canvas shape.
 */
const PLATE_PAD_SHARE = 0.25

/**
 * The contrast ratio a stamped mark is held to, against the backdrop under it.
 *
 * 4.5:1, the WCAG AA ratio for body text, not the 3:1 allowed for a plain
 * graphical object. A logo is usually a wordmark, so it carries letterforms, and
 * letterforms at the size this file produces are small text by any reading.
 */
const TARGET_CONTRAST = 4.5

/**
 * WCAG's contrast offset, from `(L1 + 0.05) / (L2 + 0.05)`.
 */
const CONTRAST_OFFSET = 0.05

/**
 * The backdrop luminances at which a near-black and a near-white mark each stop
 * clearing TARGET_CONTRAST, solved from the ratio rather than picked by eye.
 *
 *   dark ink, modelled at luminance 0: (b + 0.05) / 0.05 >= 4.5  ->  b >= 0.175
 *   light ink, modelled at luminance 1: 1.05 / (b + 0.05) >= 4.5 ->  b <= 0.1833
 *
 * So a dark mark needs a plate below 0.175 and a light mark needs one above
 * 0.1833. Both numbers sit low because contrast is not linear in luminance: white
 * ink on a mid-grey 0.5 backdrop is 1.9:1, which reads as a smudge however
 * "middle" that grey feels to the eye.
 */
const DARK_INK_MIN_BACKDROP = CONTRAST_OFFSET * TARGET_CONTRAST - CONTRAST_OFFSET
const LIGHT_INK_MAX_BACKDROP = (1 + CONTRAST_OFFSET) / TARGET_CONTRAST - CONTRAST_OFFSET

function assertPositiveIntegerCanvas(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError(
      `placeLogo: canvas width and height must be positive integers, got ${width}x${height}`,
    )
  }
}

function assertUsableAspect(logoAspect: number): void {
  if (!Number.isFinite(logoAspect) || logoAspect <= 0) {
    throw new RangeError(
      `placeLogo: logoAspect must be a positive finite number, got ${logoAspect}`,
    )
  }
}

/** Where the clear rectangle's top-left corner lands, given the corner it hugs. */
function clearOrigin(
  anchor: Anchor,
  canvas: { width: number; height: number },
  clearWidth: number,
  clearHeight: number,
): { x: number; y: number } {
  const right = canvas.width - clearWidth
  const bottom = canvas.height - clearHeight
  switch (anchor) {
    case 'bottom-right':
      return { x: right, y: bottom }
    case 'bottom-left':
      return { x: 0, y: bottom }
    case 'top-right':
      return { x: right, y: 0 }
    case 'top-left':
      return { x: 0, y: 0 }
  }
}

/**
 * The mark's rectangle and its clear space, for one canvas and one corner.
 *
 * Throws a `RangeError` on input it cannot honestly answer: a canvas dimension
 * that is not a positive integer, or a `logoAspect` that is zero, negative,
 * `NaN` or infinite. Same reasoning as `logoFactsFromRaw`'s own guard. There is
 * no rectangle that describes "no canvas", and a fabricated one would be
 * composited as though it meant something.
 *
 * A merely SMALL canvas is not refused. Because the mark is a share of the
 * canvas's own shorter edge, a small canvas produces a small mark rather than
 * one that cannot fit, so there is no positive canvas for which the answer is
 * structurally impossible.
 *
 * `sizeStep` is optional and defaults to `'medium'`, today's fixed 0.14 share,
 * so every caller that predates this parameter keeps drawing the same mark.
 */
export function placeLogo(input: {
  canvas: { width: number; height: number }
  logoAspect: number
  anchor: Anchor
  sizeStep?: StampSizeStep
}): Placement {
  const { canvas, logoAspect, anchor } = input
  const sizeStep = input.sizeStep ?? DEFAULT_SIZE_STEP
  assertPositiveIntegerCanvas(canvas.width, canvas.height)
  assertUsableAspect(logoAspect)

  const shorterEdge = Math.min(canvas.width, canvas.height)
  let height = MARK_HEIGHT_SHARE[sizeStep] * shorterEdge
  let width = height * logoAspect

  // Both caps scale the whole rect, so the aspect survives them. Width first,
  // because it is the one a wide lockup trips; height is then measured on what
  // the width cap left.
  const maxWidth = MAX_MARK_WIDTH_SHARE * canvas.width
  if (width > maxWidth) {
    const scale = maxWidth / width
    width *= scale
    height *= scale
  }
  const maxHeight = MAX_MARK_HEIGHT_SHARE * canvas.height
  if (height > maxHeight) {
    const scale = maxHeight / height
    width *= scale
    height *= scale
  }

  // Rounding happens once, here, after every scale. Rounding the height and then
  // deriving the width from the ROUNDED height keeps the achievable aspect error
  // at half a pixel, where rounding the two independently would let it grow with
  // the aspect. A sub-pixel mark still gets one pixel: it is a silly output, but
  // an empty rect would be a silently invisible logo.
  let markHeight = Math.max(1, Math.round(height))
  let markWidth = Math.max(1, Math.round(markHeight * logoAspect))

  // ── AND THEN THE WIDTH CAP IS RE-CHECKED, BECAUSE THAT DERIVATION LEAVES IT ─
  // The line above multiplies the ROUNDED height by the UNCAPPED aspect, which
  // walks straight back past the `maxWidth` the scaling established. Two things
  // compound: `Math.max(1, …)` re-inflates a height the caps had taken below a
  // pixel, and the aspect is then applied to that.
  //
  // MEASURED on a real 1080x1080 canvas, cap 346px: an aspect-10 wordmark
  // shipped 350, aspect 16 shipped 352. At the extreme it stops being a rounding
  // question — canvas 200x200 with aspect 200 produced a clear box 202px wide,
  // placed at x = -2, off the canvas the file's header calls structurally
  // impossible. `assertUsableAspect` admits any positive finite aspect, so that
  // input is reachable rather than theoretical.
  //
  // Held to the cap by width, with the height re-derived from it. At an aspect
  // this extreme the half-pixel aspect promise cannot also be kept, and a mark
  // inside its own canvas is the one that matters.
  const widthCeiling = Math.max(1, Math.floor(maxWidth))
  if (markWidth > widthCeiling) {
    markWidth = widthCeiling
    markHeight = Math.max(1, Math.round(markWidth / logoAspect))
  }

  const margin = Math.max(1, Math.round(markHeight * CLEAR_SPACE_SHARE))
  const clearWidth = markWidth + margin * 2
  const clearHeight = markHeight + margin * 2
  const origin = clearOrigin(anchor, canvas, clearWidth, clearHeight)

  const mark: Rect = {
    x: origin.x + margin,
    y: origin.y + margin,
    width: markWidth,
    height: markHeight,
  }

  // ── PAD IS CLAMPED BELOW MARGIN, NOT JUST COMPUTED FROM A SMALLER SHARE ─────
  // `PLATE_PAD_SHARE * markHeight` is mathematically half of `CLEAR_SPACE_SHARE
  // * markHeight`, but the two are rounded SEPARATELY and each carries its own
  // `Math.max(1, …)` floor, exactly the trap the width cap above already ran
  // into once. At markHeight 1, the smallest a real mark ever floors to,
  // `Math.round(1 * 0.5)` and `Math.round(1 * 0.25)` both land on 1: without
  // this clamp `pad` would equal `margin` and `plate` would equal `clear`
  // exactly, which is not "strictly inside". Clamping `pad` to at most
  // `margin - 1` (never below 0) keeps `plate` inside `clear` by construction
  // rather than by an arithmetic coincidence that breaks at the edge case this
  // very file's width-cap comment already measured going wrong once.
  // `logo-placement.test.ts` pins the strict containment directly rather than
  // trusting this reasoning, at the extreme aspects the width-cap comment
  // documents (200x200 aspect 200; 1080x1080 aspect 10 and 16).
  const pad =
    margin > 1 ? Math.min(margin - 1, Math.max(1, Math.round(markHeight * PLATE_PAD_SHARE))) : 0
  const plate: Rect = {
    x: mark.x - pad,
    y: mark.y - pad,
    width: markWidth + pad * 2,
    height: markHeight + pad * 2,
  }

  return {
    mark,
    clear: { x: origin.x, y: origin.y, width: clearWidth, height: clearHeight },
    plate,
  }
}

/**
 * What `needsPlate` was told about a `mixed` mark's own ink, beyond the enum.
 * Everything here is optional and every field can independently be `undefined`
 * or `null`: a caller that has not measured a mark (an old `LogoFacts`, a hand
 * built test fixture) passes nothing at all, and `plateDecisionFor` treats that
 * exactly like today's unconditional plate.
 */
export interface MixedInkMeasurement {
  /** The mark's own linearised WCAG mean luminance, 0-1. `null` means no ink was measured. */
  meanInkLuminance: number | null
  /** Share of the mark's ink pixels in the dark band, 0-1. */
  darkInkShare: number
  /** Share of the mark's ink pixels in the light band, 0-1. */
  lightInkShare: number
}

/**
 * Share of a `mixed` mark's ink one polarity must hold, on ITS OWN, before the
 * mark is called bipolar rather than mid-tone.
 *
 * `mixed` already means neither polarity reached `DOMINANT_INK_SHARE` (0.75) in
 * `logo-facts-classify.ts`, so everything below is ink that failed to dominate.
 * That is not the same claim as "ink at both extremes": a mark can be 74% dark
 * and 26% neither-dark-nor-light and land here with essentially no light ink at
 * all, and averaging its luminance is honest. What makes averaging DISHONEST is
 * substantial ink at BOTH extremes at once, where the mean describes a colour
 * that exists nowhere on the mark.
 *
 * 0.1 is chosen so a handful of anti-aliased edge pixels that stray into the
 * opposite band cannot alone flip a mid-tone mark to bipolar (a smooth curve on
 * a single-colour mark can shed a few percent of its ink into the wrong band
 * purely from blending against the canvas), while any mark whose SECOND colour
 * is a real, deliberate feature, not edge noise, clears it easily: a logo with
 * a black wordmark and even a small white accent puts far more than a tenth of
 * its ink at the opposite extreme. Below this share in EITHER band, that band's
 * ink is treated as noise around a single mid-tone colour rather than as a
 * second colour the mean needs to represent.
 */
const BIPOLAR_MINORITY_SHARE = 0.1

export type MixedPlateDecision =
  | { kind: 'unmeasured' }
  | { kind: 'bipolar' }
  | { kind: 'measured'; markLuminance: number }

/**
 * Which of the three cases a `mixed` mark is in, from the measurement alone.
 *
 * Kept as its own function, returning a discriminated union rather than a
 * boolean, so `needsPlate` never has to re-derive "was this even measured" from
 * threading four raw numbers through a conditional: the three cases are read
 * off the `kind` and nothing else has to be rechecked at the call site.
 */
export function plateDecisionFor(mark: MixedInkMeasurement | undefined): MixedPlateDecision {
  if (mark === undefined || mark.meanInkLuminance === null) return { kind: 'unmeasured' }
  if (mark.darkInkShare >= BIPOLAR_MINORITY_SHARE && mark.lightInkShare >= BIPOLAR_MINORITY_SHARE) {
    return { kind: 'bipolar' }
  }
  return { kind: 'measured', markLuminance: mark.meanInkLuminance }
}

/**
 * Whether the mark needs a plate painted behind it to stay legible.
 *
 * `backdropLuminance` is relative luminance from 0 to 1, measured by the caller
 * over the region the mark will actually cover. A value outside that range lands
 * on the far side of a threshold, which is the same answer the endpoint gives.
 *
 * `dark` and `light` are UNCHANGED: both model the ink at a worst-case luminance
 * of 0 or 1 respectively rather than measuring it, deliberately, and this
 * function still never measures either.
 *
 * `mixed` defaults to always needing a plate, exactly as before, UNLESS `mark`
 * measures it as mid-tone (`plateDecisionFor` returns `'measured'`), in which
 * case the actual WCAG contrast ratio between the mark's own mean luminance and
 * the backdrop decides it. A mark `plateDecisionFor` calls `'unmeasured'` or
 * `'bipolar'` plates unconditionally, same as a mark with no `mark` argument at
 * all: absence of a safe measurement is never read as permission to skip the
 * plate.
 *
 * The old "always plate" comment about the 0.175-0.183 sliver still applies
 * once a mark IS being measured: the input is an average over thousands of
 * pixels, so a contrast ratio that clears 4.5:1 by less than the measurement's
 * own error is not a judgement worth trusting either way, and `< TARGET_CONTRAST`
 * (not `<=`) plates on a tie rather than gambling on it.
 */
export function needsPlate(
  backdropLuminance: number,
  ink: InkPolarity,
  mark?: MixedInkMeasurement,
): boolean {
  switch (ink) {
    case 'dark':
      return backdropLuminance < DARK_INK_MIN_BACKDROP
    case 'light':
      return backdropLuminance > LIGHT_INK_MAX_BACKDROP
    case 'mixed': {
      const decision = plateDecisionFor(mark)
      if (decision.kind !== 'measured') return true
      const lighter = Math.max(decision.markLuminance, backdropLuminance)
      const darker = Math.min(decision.markLuminance, backdropLuminance)
      const contrast = (lighter + CONTRAST_OFFSET) / (darker + CONTRAST_OFFSET)
      return contrast < TARGET_CONTRAST
    }
  }
}
