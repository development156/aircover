import { decodePng, type RawImage } from './png'

/**
 * HOW MUCH OF A SCREEN IS ORANGE, AND WHERE.
 *
 * docs/37 §2.3 makes the accent a per-screen BUDGET and measures it as saturated
 * pixels over the frame. That section quotes numbers for ten routes — Sahoda
 * /home at 0.487%, /analytics at 0.498% — but the script that produced them is
 * not in this repository: it was a Pillow one-liner in the v5 lane's own shell.
 * So those figures cannot be a "before" for anything measured here, and this file
 * exists so that a before and an after are produced by the SAME instrument.
 *
 * ── THE DENOMINATOR IS THE WHOLE ARGUMENT ────────────────────────────────────
 * The obvious reading of "saturated pixels over the frame" is a full-page
 * screenshot, and it is wrong for this lane in a way that would have inverted
 * every verdict.
 *
 * A fullPage frame's height is the page's height. This lane's entire job is to
 * make two pages SHORTER — collapse five cards restating one absence into one
 * statement of it. Do that and the orange pixels stay roughly constant while the
 * denominator shrinks, so a genuine improvement scores WORSE. Run the reverse —
 * pad the page with dead space — and the fraction "improves".
 *
 * So the measurement is taken from a FIXED VIEWPORT: the first screenful, at a
 * stated height per width, which is also the only part of the page the accent
 * budget is really about (what the eye meets). `pixels` is reported next to
 * `fraction` so a reader can see which of the two moved.
 *
 * ── AND A FRACTION CANNOT SEE WHERE THE ORANGE IS ────────────────────────────
 * 0.3% in one primary button and 0.3% smeared over nine links score identically,
 * and §2.3 is about exactly that difference ("one primary action per view"). This
 * module therefore reports `regions` — how many disjoint blobs of accent the
 * frame contains — beside the totals. Two frames with the same fraction and 1 vs
 * 9 regions are not the same screen, and the DOM-level guard
 * (`accent-budget.spec.ts`) is what actually enforces the "one primary" rule.
 *
 * ── PLATFORM MARKS ARE EXEMPT, SO HUE IS SPLIT OUT ───────────────────────────
 * docs/37 §2.1: Instagram's and LinkedIn's own colours are identity, not chrome,
 * and are "the only exception". A workspace with four connected channels
 * therefore scores higher for a legitimate reason. `brandPixels` counts only
 * pixels whose hue is within ±BRAND_HUE_TOLERANCE of `--p` #ff6600 (h≈24°), so a
 * regression in Sahoda's own orange is separable from a customer connecting
 * Instagram. It is a refinement, not a solution — see LIMITS at the foot.
 */

/** `--p` #ff6600 in HSV. Hue 24°, s 1.0, v 1.0. */
export const BRAND_HUE = 24

/**
 * How far from the brand hue still counts as the brand.
 *
 * `--acc` is #f60 in BOTH themes as of the 2026-08-26 ruling, so it is h 24°
 * exactly — the same value as `--p`, not merely the same hue. It was #bd4b00 in
 * light until then, also h≈24°, so this window held the whole ramp before the
 * ruling and holds a narrower one now. Widened to 18 rather than kept tight because the browser
 * composites the 6% and 24% tints over surfaces and antialiases every edge, and
 * a blend of orange over a warm-grey surface drifts a few degrees.
 *
 * 18° excludes Instagram (h≈326 magenta / 260 purple), LinkedIn (h≈201 blue),
 * Facebook (h≈221) and Google's blue/green/red. It DOES include Google's yellow
 * only at its edge (h≈45 is 21° away, so it is excluded) — see LIMITS.
 */
export const BRAND_HUE_TOLERANCE = 18

/** docs/37 §2.3's own thresholds, quoted: `HSV s>0.30, v>0.25`. */
export const SAT_MIN = 0.3
export const VAL_MIN = 0.25

/** §2.3 samples every second pixel. Kept, so the method is the document's. */
export const SAMPLE_STEP = 2

export interface AccentSpend {
  /** Pixels sampled — the denominator. `width*height/(step*step)`, near enough. */
  sampled: number
  /** Sampled pixels over the saturation and value floors, any hue. */
  pixels: number
  /** Of those, the ones within the brand-hue window. */
  brandPixels: number
  /** `pixels / sampled`, as a percentage. Comparable in shape to §2.3's table. */
  fraction: number
  /** `brandPixels / sampled`, as a percentage. Sahoda's own spend. */
  brandFraction: number
  /**
   * The biggest blobs, largest first, with the box each occupies in CSS pixels.
   *
   * The fraction alone cannot say WHERE the orange is, and §2.3 is entirely about
   * where: 0.3% in one primary button and 0.3% smeared over nine links score the
   * same. A box is what turns "the page is 0.56% orange" into "80% of that is the
   * Create post button at (1270,160)", which is the sentence a design decision can
   * actually be made from.
   */
  top: Region[]
  /**
   * Median luminance of the sampled pixels, 0-255.
   *
   * Not part of the accent budget. It is here because a peer lane recorded, on
   * 2026-08-23, a capture spec reporting green over 34 UNSTYLED PNGs: the frame
   * count, the sha and the `data-theme` label were all correct and the pages had
   * no CSS at all. Everything a camera normally asserts survives a stylesheet
   * that never loaded, and the pixels are the only place the difference exists.
   *
   * See the light-against-dark assertion in `page-dash-frames.spec.ts`, which is
   * the form of the check that catches it in BOTH themes rather than only in one.
   */
  medianLuminance: number
  /**
   * Disjoint blobs of BRAND-hue accent, 8-connected on the sampled grid.
   *
   * Blobs under `MIN_REGION` sampled pixels are dropped: antialiasing on a single
   * orange glyph stroke produces specks, and counting those would report forty
   * regions for one icon. At step 2 a 44px marker tile is ~484 sampled pixels and
   * a 16px icon glyph is ~30, so the floor keeps real elements and drops fringes.
   */
  regions: number
}

/** Sampled-pixel floor for a blob to count as a region. */
export const MIN_REGION = 12

/** How many blobs `top` carries. Enough to see the shape, short enough to read. */
export const TOP_REGIONS = 6

/** One blob of brand-hue accent. `px` is SAMPLED pixels; x/y/w/h are CSS pixels. */
export interface Region {
  px: number
  /** This blob's share of all brand-hue pixels in the frame, 0-100. */
  share: number
  x: number
  y: number
  w: number
  h: number
}

/** HSV saturation and value from 8-bit RGB. Hue in degrees, or null when grey. */
function hsv(r: number, g: number, b: number): { h: number | null; s: number; v: number } {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const v = max / 255
  const d = max - min
  const s = max === 0 ? 0 : d / max
  if (d === 0) return { h: null, s, v }
  let h: number
  if (max === r) h = 60 * (((g - b) / d) % 6)
  else if (max === g) h = 60 * ((b - r) / d + 2)
  else h = 60 * ((r - g) / d + 4)
  if (h < 0) h += 360
  return { h, s, v }
}

/** Circular distance between two hues, in degrees. */
function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

export function measureAccentSpend(png: Buffer): AccentSpend {
  const img: RawImage = decodePng(png)
  const cols = Math.ceil(img.width / SAMPLE_STEP)
  const rows = Math.ceil(img.height / SAMPLE_STEP)

  // A flat grid rather than a 2-D array: at 1440x900 this is 324k entries and
  // the region pass walks it twice.
  const brand = new Uint8Array(cols * rows)
  // Rec.601 luma is enough here: this is a "did the stylesheet load" check, not
  // a contrast measurement, and it never leaves this function's own histogram.
  const luma = new Uint32Array(256)
  let pixels = 0
  let brandPixels = 0

  for (let gy = 0; gy < rows; gy += 1) {
    const y = gy * SAMPLE_STEP
    for (let gx = 0; gx < cols; gx += 1) {
      const x = gx * SAMPLE_STEP
      const i = (img.width * y + x) * img.channels
      const r = img.data[i] ?? 0
      const g = img.data[i + 1] ?? 0
      const b = img.data[i + 2] ?? 0
      luma[Math.min(255, Math.round(0.299 * r + 0.587 * g + 0.114 * b))]! += 1
      const { h, s, v } = hsv(r, g, b)
      if (s <= SAT_MIN || v <= VAL_MIN) continue
      pixels += 1
      if (h !== null && hueDistance(h, BRAND_HUE) <= BRAND_HUE_TOLERANCE) {
        brandPixels += 1
        brand[gy * cols + gx] = 1
      }
    }
  }

  const sampled = cols * rows
  const found = findRegions(brand, cols, rows)
  let seen = 0
  let median = 0
  for (let level = 0; level < 256; level += 1) {
    seen += luma[level] ?? 0
    if (seen * 2 >= sampled) {
      median = level
      break
    }
  }
  return {
    medianLuminance: median,
    sampled,
    pixels,
    brandPixels,
    fraction: (pixels / sampled) * 100,
    brandFraction: (brandPixels / sampled) * 100,
    regions: found.length,
    top: found.slice(0, TOP_REGIONS).map((region) => ({
      ...region,
      share: brandPixels === 0 ? 0 : Math.round((region.px / brandPixels) * 1000) / 10,
    })),
  }
}

/**
 * 8-connected flood fill over the sampled grid, largest blob first.
 *
 * Iterative rather than recursive: a full-width brand bar is tens of thousands of
 * sampled pixels and a recursive fill would blow the stack on exactly the element
 * most worth measuring.
 */
function findRegions(mask: Uint8Array, cols: number, rows: number): Omit<Region, 'share'>[] {
  const seen = new Uint8Array(mask.length)
  const stack: number[] = []
  const found: Omit<Region, 'share'>[] = []

  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] !== 1 || seen[start] === 1) continue
    let size = 0
    let x0 = cols
    let y0 = rows
    let x1 = -1
    let y1 = -1
    stack.push(start)
    seen[start] = 1
    while (stack.length > 0) {
      const at = stack.pop() as number
      size += 1
      const x = at % cols
      const y = (at - x) / cols
      if (x < x0) x0 = x
      if (y < y0) y0 = y
      if (x > x1) x1 = x
      if (y > y1) y1 = y
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
          const n = ny * cols + nx
          if (mask[n] !== 1 || seen[n] === 1) continue
          seen[n] = 1
          stack.push(n)
        }
      }
    }
    if (size < MIN_REGION) continue
    found.push({
      px: size,
      x: x0 * SAMPLE_STEP,
      y: y0 * SAMPLE_STEP,
      w: (x1 - x0 + 1) * SAMPLE_STEP,
      h: (y1 - y0 + 1) * SAMPLE_STEP,
    })
  }

  return found.sort((a, b) => b.px - a.px)
}

/**
 * ── WHAT THIS INSTRUMENT CANNOT SEE ──────────────────────────────────────────
 *
 * 1. WHAT the orange IS. `top` says a 124x38 blob sits at (1270,160); it does not
 *    say that blob is a button rather than an image of one. The DOM guard in
 *    `accent-budget.spec.ts` is what counts solid-brand FILLS by element; this is
 *    the pixel backstop, and neither alone is sufficient.
 * 2. Google Business Profile's brand yellow (h≈45) sits 21° from the brand hue
 *    and is excluded from `brandPixels` — correct — but its red (h≈5) is 19°
 *    away and is also excluded by one degree. A GBP mark is therefore split
 *    across the two counters depending on which of its four colours dominates.
 *    Read `brandFraction` as "Sahoda's orange plus anything within 18° of it".
 * 3. A frame below the fold. The viewport clip is the point (see the header) but
 *    it means a page can move its orange down and the number will not notice.
 *    `regions` over the FULL page is not measured here.
 * 4. Anything painted by a customer theme. Brand Skin is cut, so every frame in
 *    this lane is Sahoda's own palette; a re-themed workspace would move the hue
 *    window and this file does not know that.
 * 5. A LIGHT-TO-DARK `regions` DELTA IS AN ARTEFACT, NOT A FINDING. MEASURED on
 *    /home 1440 empty, where the DOM is identical in both themes: 15 regions in
 *    light against 30 in dark, for 1392 against 1758 sampled pixels. THE CAUSE
 *    THIS NOTE USED TO GIVE IS NO LONGER TRUE: it read "`--acc` is #bd4b00 in
 *    light and #ff6600 in dark and the two antialias across the s>0.30 floor
 *    differently against their own grounds". The 2026-08-26 ruling made `--acc`
 *    #f60 in BOTH themes, so that explanation is void. The 15-against-30
 *    measurement stands — it was measured — but nothing here has re-measured it
 *    since, and the surfaces still differ, so a delta may or may not survive.
 *    Compare a theme against itself, and re-measure before explaining a delta.
 * 6. Text antialiasing. Orange TEXT at 13px contributes a few dozen sampled
 *    pixels with soft edges; a solid fill of the same visual weight contributes
 *    hundreds. That is the correct bias for a budget about visual dominance, but
 *    it means the number under-reports a screen whose accent is all links.
 */
