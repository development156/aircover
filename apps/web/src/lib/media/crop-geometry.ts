import type { AspectBand, MediaTarget } from './targets'

/**
 * The integer arithmetic of a crop, and nothing else.
 *
 * ── WHY THIS IS ITS OWN MODULE, AND WHY IT IS PURE ──────────────────────────
 * The rectangle computed here is used TWICE: the browser draws the "after"
 * preview by showing exactly this region of the original, and the server hands
 * exactly this rectangle to sharp. If those two came from two pieces of
 * arithmetic they would agree until they did not, and the failure would be
 * invisible — a preview that shows one crop and a stored file that is a
 * different one. One function, two callers, one test.
 *
 * ── THE ROUNDING IS THE WHOLE PROBLEM ───────────────────────────────────────
 * `validateMedia` compares `width / height` against the band with a plain `<`
 * and `>`. Instagram's floor is 0.75 and it was MEASURED at the boundary: 0.7500
 * is accepted, 0.7490 is refused. So a crop computed as `round(h * 0.75)` is not
 * good enough — at h = 999 that is 749, and 749/999 = 0.74975, which is BELOW
 * the floor. The crop would be cut, stored, attached, and then refused by the
 * same engine that asked for it.
 *
 * `fitInBand` therefore does not trust its own rounding. It generates candidate
 * integer rectangles around the ideal, KEEPS ONLY the ones whose exact
 * floating-point ratio passes the same comparison `validateMedia` makes, and
 * returns the largest of those. A candidate that cannot be verified is not
 * returned at all.
 */

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

/** A point in the ORIGINAL image, as fractions of its width and height. */
export interface FocalPoint {
  x: number
  y: number
}

export const CENTRE: FocalPoint = Object.freeze({ x: 0.5, y: 0.5 })

/** A resolved band. `Infinity` is the honest upper end when nothing is declared. */
export interface ResolvedBand {
  lo: number
  hi: number
}

/**
 * The one comparison. Written to match `validateMedia`'s
 * `aspect < range[0] || aspect > range[1]` exactly — not approximately, and with
 * no epsilon. An epsilon here would accept a ratio the engine then refuses,
 * which is the direction that costs a customer a post.
 */
export function inBand(aspect: number, band: ResolvedBand): boolean {
  if (!Number.isFinite(aspect) || aspect <= 0) return false
  return !(aspect < band.lo || aspect > band.hi)
}

function resolve(band: AspectBand | null): ResolvedBand {
  if (band === null) return { lo: 0, hi: Number.POSITIVE_INFINITY }
  return { lo: band.min ?? 0, hi: band.max ?? Number.POSITIVE_INFINITY }
}

/**
 * The band every selected channel can live inside at once.
 *
 * ── ONE FILE GOES TO EVERY CHANNEL ON A POST ────────────────────────────────
 * `post_media` has no channel column and the publisher's query has no channel
 * predicate — it reads a post's attachments and sends the same object to every
 * variant. So a crop is not "the Instagram crop": it is the crop that satisfies
 * the whole selected set, which is the INTERSECTION of their declared bands.
 * Cutting to one channel's edge and ignoring the others would fix Instagram and
 * break Google Business on the same post.
 *
 * Today only Instagram declares a band at all, so the intersection is always
 * non-empty in practice. `'empty'` is still a real return value rather than an
 * assertion, because the day a second channel declares one, two bands that do
 * not overlap must produce an honest refusal instead of a crop that satisfies
 * neither.
 */
export function intersectBands(targets: readonly MediaTarget[]): ResolvedBand | 'empty' {
  let lo = 0
  let hi = Number.POSITIVE_INFINITY
  for (const target of targets) {
    const band = resolve(target.aspect)
    if (band.lo > lo) lo = band.lo
    if (band.hi < hi) hi = band.hi
  }
  if (lo > hi) return 'empty'
  return { lo, hi }
}

/** The largest pixel floor any selected channel declares. */
export function floorFor(targets: readonly MediaTarget[]): { minW: number; minH: number } {
  let minW = 0
  let minH = 0
  for (const target of targets) {
    if (target.minW !== null && target.minW > minW) minW = target.minW
    if (target.minH !== null && target.minH > minH) minH = target.minH
  }
  return { minW, minH }
}

/** How far either side of the ideal integer the search looks. Three is ample. */
const SEARCH_RADIUS = 3

/**
 * The largest whole-pixel rectangle that fits inside `width`×`height` and whose
 * exact ratio passes `inBand`.
 *
 * Returns the original size unchanged when it is already in band — a photo that
 * needs no crop is never re-cut, so no derivative is minted for it.
 *
 * Returns `null` when no rectangle in the search window verifies. At ordinary
 * photo sizes that cannot happen; at 4×4, the floor `x` declares, it genuinely
 * can, and a `null` that refuses is better than a rectangle nobody checked.
 */
export function fitInBand(width: number, height: number, band: ResolvedBand): CropRect | null {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) return null
  if (width < 1 || height < 1) return null

  if (inBand(width / height, band)) return { x: 0, y: 0, width, height }

  // The ratio to aim at: the nearest edge of the band. Clamping rather than
  // picking a midpoint is what "preserve the most pixels" means — a 0.56 photo
  // headed for a 0.75–1.91 band is cut to 0.75, the least it can be cut.
  const actual = width / height
  const ideal = Math.min(Math.max(actual, band.lo), band.hi)
  if (!Number.isFinite(ideal) || ideal <= 0) return null

  const candidates: { width: number; height: number }[] = []
  for (let d = -SEARCH_RADIUS; d <= SEARCH_RADIUS; d += 1) {
    // Anchored on full height, trimming the sides.
    candidates.push({ width: Math.round(height * ideal) + d, height })
    // Anchored on full width, trimming top and bottom.
    candidates.push({ width, height: Math.round(width / ideal) + d })
  }

  let best: CropRect | null = null
  for (const candidate of candidates) {
    if (candidate.width < 1 || candidate.height < 1) continue
    if (candidate.width > width || candidate.height > height) continue
    if (!inBand(candidate.width / candidate.height, band)) continue
    const area = candidate.width * candidate.height
    if (best === null) {
      best = { x: 0, y: 0, ...candidate }
      continue
    }
    const bestArea = best.width * best.height
    // Deterministic on a tie: the wider rectangle wins, so the same input always
    // produces the same object key and re-running mints nothing new.
    if (area > bestArea || (area === bestArea && candidate.width > best.width)) {
      best = { x: 0, y: 0, ...candidate }
    }
  }
  return best
}

/** Clamp a focal coordinate into the unit interval; anything unreadable is centred. */
function focalAxis(value: number): number {
  if (!Number.isFinite(value)) return 0.5
  return Math.min(Math.max(value, 0), 1)
}

export function normaliseFocal(focal: FocalPoint | null | undefined): FocalPoint {
  if (focal === null || focal === undefined) return CENTRE
  return { x: focalAxis(focal.x), y: focalAxis(focal.y) }
}

/**
 * Where the crop sits, given where the person said the subject is.
 *
 * The focal point is the CENTRE of the crop wherever the image allows it, and is
 * pushed inside the edges where it does not — a subject at the very top of a
 * photo produces a crop flush with the top, never one hanging off it.
 */
export function placeCrop(
  width: number,
  height: number,
  size: { width: number; height: number },
  focal: FocalPoint,
): CropRect {
  const point = normaliseFocal(focal)
  const x = Math.min(Math.max(Math.round(point.x * width - size.width / 2), 0), width - size.width)
  const y = Math.min(
    Math.max(Math.round(point.y * height - size.height / 2), 0),
    height - size.height,
  )
  return { x, y, width: size.width, height: size.height }
}

export type CropPlan =
  | { ok: true; rect: CropRect; changed: boolean }
  /** The bands of the selected channels do not overlap; no single file can serve them. */
  | { ok: false; reason: 'bands_conflict' }
  /** A rectangle in band exists but is below a declared pixel floor. */
  | { ok: false; reason: 'below_floor'; minW: number; minH: number }
  /** Nothing in the search window verified against the band. */
  | { ok: false; reason: 'no_fit' }

/**
 * The whole geometry decision for one image against one channel set.
 *
 * ── CROPPING CANNOT FIX A PHOTO THAT IS TOO SMALL ───────────────────────────
 * A crop only ever removes pixels. If the rectangle that lands in band is below
 * a channel's `minW`/`minH`, the answer is `below_floor` and the caller refuses:
 * the only way to "fix" it would be to upscale, and upscaling invents pixels
 * that were never photographed. A file offered as a fix must genuinely be one.
 */
export function planCrop(
  image: { width: number; height: number },
  targets: readonly MediaTarget[],
  focal: FocalPoint,
): CropPlan {
  const band = intersectBands(targets)
  if (band === 'empty') return { ok: false, reason: 'bands_conflict' }

  const size = fitInBand(image.width, image.height, band)
  if (size === null) return { ok: false, reason: 'no_fit' }

  const floor = floorFor(targets)
  if (size.width < floor.minW || size.height < floor.minH) {
    return { ok: false, reason: 'below_floor', minW: floor.minW, minH: floor.minH }
  }

  const rect = placeCrop(image.width, image.height, size, focal)
  const changed = rect.width !== image.width || rect.height !== image.height
  return { ok: true, rect, changed }
}
