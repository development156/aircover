import 'server-only'

import sharp from 'sharp'

import type { StampSizeStep } from '@sahoda/shared'

import { linearLuminance } from '../brand/logo-facts-classify'
import type { InkPolarity } from '../brand/logo-facts'
import {
  needsPlate,
  placeLogo,
  type Anchor,
  type MixedInkMeasurement,
  type Placement,
  type Rect,
} from '../brand/logo-placement'

/**
 * WHICH OF THE FOUR CORNERS THE MARK ACTUALLY LANDS IN.
 *
 * ── WHY THIS IS SEPARATE FROM logo-placement.ts ─────────────────────────────
 * `placeLogo` is pure arithmetic that never sees a picture; its own header says
 * so. Tell it a corner and a canvas and it returns a rectangle, with no way to
 * know that rectangle lands on a face, a plate of food, or a flat wall. This
 * module is the piece that looks: it samples the picture under each of the four
 * candidate rectangles `placeLogo` can produce and decides which corner a
 * careful designer would actually use, calling `placeLogo` four times rather
 * than reimplementing one pixel of its geometry.
 *
 * ── ORDER OF OPERATIONS, SETTLED IN `stamp.ts`, AND WHY ─────────────────────
 * The variant swap (light mark vs. dark mark) runs BEFORE this module is asked
 * anything. The swap answers "is this ink readable here", measured against the
 * backdrop under the CUSTOMER'S OWN chosen corner, because that is the corner
 * the mark renders in if nothing overrides it and so the honest backdrop to
 * swap against. Only once the ink is final does "does this ink clear contrast
 * at each of the four corners" become a question worth asking four times: the
 * contrast thresholds `needsPlate` applies are keyed to ink polarity, and
 * re-running them for a mark that is about to change colour would answer the
 * wrong question. Corner choice runs on the settled ink, and the plate decision
 * that follows it (still `needsPlate`, still owned by `stamp.ts`) runs on
 * whichever corner this module lands on.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ─────────────────────────────────────────
 * It never decides whether to plate — `needsPlate` still owns that, called once
 * by `stamp.ts` on the corner this module returns. It never resizes or moves
 * the mark within a corner; `placeLogo` already produced every candidate
 * rectangle, and this module only picks which of the four to use. It never
 * measures a mark's OWN ink (`MixedInkMeasurement` is threaded through to
 * `needsPlate` exactly as `stamp.ts` already builds it, not re-derived here).
 */

/** Sharp's ceiling on decoded pixels, mirrored from `stamp.ts`'s own `open()`: the defence against a small file that decodes to gigabytes. */
const MAX_PIXELS = 100_000_000
const MAX_CHANNEL = 255

const ANCHORS: readonly Anchor[] = ['bottom-right', 'bottom-left', 'top-right', 'top-left']

/**
 * How much quieter another corner must be than the customer's chosen one
 * before this module overrides the choice for busyness, as a ratio of
 * candidate spread to chosen spread (lower is quieter).
 *
 * 0.75, defended: the customer set a preference, and a mark that hops corners
 * between two near-identical generations because one measured a whisker
 * quieter is worse than a mark that sits in a slightly busy corner every time
 * — it reads as a bug, not a design decision. Requiring the candidate to come
 * in at three quarters of the chosen corner's spread (a quarter quieter, not a
 * rounding error) means an override only happens when a corner is genuinely,
 * visibly calmer: a flat wall against a plate of samosas clears this by a wide
 * margin; two crops of the same gentle gradient do not. A margin of 1.0 (any
 * improvement moves the mark) was rejected specifically because floating point
 * noise between two nearly-identical corners would then decide the mark's
 * position, which is the "control the customer set is a coin flip" defect this
 * whole feature exists to avoid at the OTHER end from where the founder's
 * screenshot showed it.
 */
const QUIETNESS_MARGIN = 0.75

/**
 * One region's mean linear luminance and its alpha-weighted spread, in a
 * single decode and a single pass over the pixels.
 *
 * ── THE MEAN IS `stamp.ts`'s `meanLuminance`, MOVED HERE VERBATIM ───────────
 * Same transfer function (`linearLuminance`, shared with `logo-facts-classify.ts`
 * so a mark's own measured luminance and a backdrop's are the same quantity),
 * same alpha weighting, same `covered === 0 → 1` fallback for a fully
 * transparent region (it composites over white in every surface this product
 * puts a picture on, so treating it as bright is the honest answer, not a
 * guess). Kept byte-identical rather than re-derived so `stamp.ts` can still
 * call it as its own backdrop measurement for the mark it settles on.
 *
 * ── AND THE SPREAD IS THE BUSYNESS SIGNAL A MEAN CANNOT GIVE ────────────────
 * Standard deviation of the same per-pixel linear luminance, alpha-weighted
 * the same way. A flat wall and a plate of samosas can share a mean and read
 * completely differently: the wall's spread is near zero and the plate's is
 * large, which is the number that tells this module to leave the food alone.
 * Computed from the SAME decode as the mean (`sumL` then `sumSquares`) so a
 * busy region is never sampled twice for two different answers.
 *
 * A transparent region's spread is reported as 0: it composites as a flat
 * white fill, and a flat fill is, honestly, quiet.
 */
export interface RegionStats {
  mean: number
  spread: number
}

export async function regionLuminanceStats(
  picture: Uint8Array,
  region: Rect,
): Promise<RegionStats | null> {
  try {
    const { data, info } = await sharp(picture, { limitInputPixels: MAX_PIXELS, failOn: 'error' })
      .extract({ left: region.x, top: region.y, width: region.width, height: region.height })
      .toColourspace('srgb')
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const channels = info.channels
    if (data.length / channels < 1) return null

    const alphaAt = channels > 3 ? 3 : -1
    let covered = 0
    let sumL = 0
    let sumL2 = 0
    for (let at = 0; at < data.length; at += channels) {
      const alpha = alphaAt === -1 ? 1 : data[at + alphaAt]! / MAX_CHANNEL
      if (alpha === 0) continue
      const luminance = linearLuminance(data[at]!, data[at + 1]!, data[at + 2]!)
      covered += alpha
      sumL += alpha * luminance
      sumL2 += alpha * luminance * luminance
    }
    if (covered === 0) return { mean: 1, spread: 0 }

    const mean = sumL / covered
    // Floating-point subtraction of two close large sums can land a hair below
    // zero for a perfectly flat region; clamped rather than fed to `Math.sqrt`
    // as a negative.
    const variance = Math.max(0, sumL2 / covered - mean * mean)
    return { mean, spread: Math.sqrt(variance) }
  } catch {
    return null
  }
}

/** `stamp.ts`'s own name for the mean half of this, kept so its call site reads the same as before this module existed. */
export async function meanLuminance(picture: Uint8Array, region: Rect): Promise<number | null> {
  const stats = await regionLuminanceStats(picture, region)
  return stats === null ? null : stats.mean
}

/** What this module actually did with the customer's chosen corner. */
export type AnchorChoice =
  { kind: 'as_chosen' } | { kind: 'moved'; from: Anchor; to: Anchor; reason: 'busy' | 'unreadable' }

export interface AnchorChoiceResult {
  anchor: Anchor
  placement: Placement
  /** The backdrop's mean luminance under WHICHEVER corner was chosen, so `stamp.ts` need not re-measure it for the plate decision. */
  luminance: number
  anchorChoice: AnchorChoice
}

export interface ChooseAnchorInput {
  picture: Uint8Array
  canvas: { width: number; height: number }
  logoAspect: number
  sizeStep?: StampSizeStep
  /** The corner the customer actually asked for. */
  anchor: Anchor
  /** The FINAL ink, after any variant swap. */
  inkPolarity: InkPolarity
  mark?: MixedInkMeasurement
}

interface CornerStats {
  anchor: Anchor
  placement: Placement
  mean: number | null
  spread: number | null
}

/**
 * Decide which corner the mark actually lands in.
 *
 * `null` only when the customer's OWN chosen corner cannot be read at all
 * (the picture region is undecodable). `stamp.ts` already refuses the whole
 * stamp in that case before this is ever called, using its own
 * `meanLuminance` on the chosen corner, so in practice this `null` is
 * unreachable rather than a second, silent failure mode; it exists so this
 * function is honest about its own inputs rather than asserting a value it
 * has not checked.
 *
 * A corner OTHER than the one chosen that fails to decode (should not happen:
 * every corner's rect is the same size, inside the same canvas, that already
 * passed `stamp.ts`'s `fitsInside` check for the chosen corner) is simply
 * excluded from consideration, the same way a corner that fails contrast is:
 * a candidate this module cannot vouch for is not a candidate.
 */
export async function chooseAnchor(input: ChooseAnchorInput): Promise<AnchorChoiceResult | null> {
  const placements = new Map<Anchor, Placement>()
  for (const anchor of ANCHORS) {
    placements.set(
      anchor,
      placeLogo({
        canvas: input.canvas,
        logoAspect: input.logoAspect,
        anchor,
        sizeStep: input.sizeStep,
      }),
    )
  }

  const stats: CornerStats[] = await Promise.all(
    ANCHORS.map(async (anchor) => {
      const placement = placements.get(anchor)!
      const region = await regionLuminanceStats(input.picture, placement.mark)
      return {
        anchor,
        placement,
        mean: region?.mean ?? null,
        spread: region?.spread ?? null,
      }
    }),
  )

  const chosen = stats.find((s) => s.anchor === input.anchor)!
  if (chosen.mean === null) return null

  const clears = (mean: number): boolean => !needsPlate(mean, input.inkPolarity, input.mark)
  const readable = stats.filter(
    (s): s is CornerStats & { mean: number; spread: number } =>
      s.mean !== null && s.spread !== null,
  )
  const candidates = readable.filter((s) => clears(s.mean))

  const quietestOf = (pool: typeof readable): (typeof readable)[number] =>
    pool.reduce((quietest, next) => (next.spread < quietest.spread ? next : quietest))

  if (!clears(chosen.mean)) {
    // Rule 4: the chosen corner is unreadable and another clears. Moving is not
    // a marginal call here — it is the difference between a legible mark and an
    // illegible one — so no quietness margin gates this branch.
    if (candidates.length > 0) {
      const best = quietestOf(candidates)
      return {
        anchor: best.anchor,
        placement: best.placement,
        luminance: best.mean,
        anchorChoice: { kind: 'moved', from: input.anchor, to: best.anchor, reason: 'unreadable' },
      }
    }
    // Rule 5: no corner clears contrast. Stay and let `needsPlate` plate it,
    // exactly as before this module existed. Never move the mark for a reason
    // the customer cannot see when the outcome is a plate either way.
    return {
      anchor: input.anchor,
      placement: chosen.placement,
      luminance: chosen.mean,
      anchorChoice: { kind: 'as_chosen' },
    }
  }

  // The chosen corner clears contrast. Only a MEANINGFULLY quieter corner among
  // the other clearing corners can override it (rule 3); ties, and anything
  // within the margin, keep the customer's own choice.
  const quietest = quietestOf(candidates)
  if (quietest.anchor !== input.anchor && quietest.spread <= chosen.spread! * QUIETNESS_MARGIN) {
    return {
      anchor: quietest.anchor,
      placement: quietest.placement,
      luminance: quietest.mean,
      anchorChoice: { kind: 'moved', from: input.anchor, to: quietest.anchor, reason: 'busy' },
    }
  }

  return {
    anchor: input.anchor,
    placement: chosen.placement,
    luminance: chosen.mean,
    anchorChoice: { kind: 'as_chosen' },
  }
}
