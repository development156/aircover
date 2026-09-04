import 'server-only'

// sharp 0.35 stopped shipping its types as a namespace on the default export,
// so the pipeline and overlay types come in as named type imports. This is the
// same import shape `derive.ts` settled on, for the same reason.
import sharp, { type OverlayOptions, type Sharp } from 'sharp'

import type { StampSizeStep } from '@sahoda/shared'

import type { InkPolarity, LogoFacts } from '../brand/logo-facts'
import { pickLogoVariant } from '@/lib/brand/logo-variant-pick'
import {
  needsPlate,
  placeLogo,
  type Anchor,
  type Placement,
  type Rect,
} from '../brand/logo-placement'
import { sniffImage } from '../posts/sniff-image'
import { roundedRectPng } from './rounded-rect'

/**
 * STAMPING A WORKSPACE'S LOGO ONTO A PICTURE THE MODEL JUST DREW.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 * Until now the provider's base64 went straight to storage with nothing in
 * between, so a generated picture carried no mark at all. This is the piece in
 * between. It takes the picture, the logo file, the facts stage 2 measured about
 * that logo file, and a corner, and it returns new PNG bytes with the mark on
 * them plus an account of what it did.
 *
 * ── THE THREE JUDGEMENTS IT DOES NOT MAKE ───────────────────────────────────
 * WHERE the mark goes is `placeLogo`'s answer, not this file's. WHETHER a plate
 * is needed is `needsPlate`'s answer. WHAT the ink is like is `LogoFacts`. This
 * file's whole job is the pixels: trim, measure, resize, composite, encode. Kept
 * that way so the geometry can be re-tuned without anyone reading a compositor,
 * and so the compositor can be proven with real pixels without stubbing a rule.
 *
 * ── TRIM FIRST, ALWAYS ──────────────────────────────────────────────────────
 * `facts.trim` is where the ink actually sits inside the logo file. A logo drawn
 * from its full canvas is smaller than the rect asked for by however much
 * padding the file carries, and pushed away from its corner by the same amount.
 * That padding is the entire reason the trim box was measured, so the extract
 * happens before anything else touches the mark.
 *
 * ── AND THE BACKDROP IS MEASURED UNDER THE MARK ONLY ────────────────────────
 * The luminance handed to `needsPlate` comes from the picture region at
 * `placement.mark` and nowhere else. Averaging the whole picture would plate a
 * dark photograph that happens to have a bright corner, and leave a bright one
 * with a dark corner unplated: both are the wrong answer at the only place a
 * reader looks.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────
 * No storage, no database, no credits, no wiring into the generate action. It
 * does not apply EXIF orientation, because a provider's PNG carries none and
 * rotating would make the composited canvas a different size from the one the
 * placement was computed against. It never modifies the picture it was given:
 * `sharp` reads a buffer and writes a new one, there is no in-place mode here,
 * and the tests assert the input array is byte-identical after the call.
 * Nothing throws out of this file. Every failure is a `reason` string a
 * developer can act on.
 */

/** Sharp's ceiling on decoded pixels: the defence against a small file that decodes to gigabytes. */
const MAX_PIXELS = 100_000_000
/** Rec. 709 relative luminance weights, the same ones `logo-facts-classify` uses. */
const LUMA_R = 0.2126
const LUMA_G = 0.7152
const LUMA_B = 0.0722

const MAX_CHANNEL = 255

/**
 * One sRGB byte to its linear-light value, the sRGB electro-optical transfer
 * function exactly as WCAG 2.1 defines it for relative luminance.
 *
 * The same curve `lib/brand/oklch.ts` already applies in this tree. It is here
 * rather than imported from there because that module is about colour SPACES
 * and this one needs a single scalar; the constants are the specification's,
 * not either module's, so the two cannot drift into disagreeing.
 */
function linearise(byte: number): number {
  const c = byte / MAX_CHANNEL
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

interface Rgb {
  r: number
  g: number
  b: number
}

/**
 * The plate colours used when the caller names none. Integers rather than hex
 * because these are pixel values fed to a compositor, and because the design
 * system owns every colour a person actually reads. Dark ink wants a light plate
 * under it and light ink a dark one. `mixed` ink works at neither extreme, so it
 * gets the light plate, which is the surface most marks are drawn for.
 */
/**
 * The plate's corner radius, as a share of the plate's own height.
 *
 * A share rather than a pixel count, for the same reason every other number in
 * this pair of files is a share: a fixed radius is a soft badge on a 400px
 * picture and an invisible bevel on a 4000px one. 0.18 is enough curve to read
 * as a deliberate shape at a glance and far short of the stadium a half-height
 * radius would produce.
 */
const PLATE_RADIUS_SHARE = 0.18

const LIGHT_PLATE: Rgb = { r: 255, g: 255, b: 255 }
const DARK_PLATE: Rgb = { r: 17, g: 17, b: 17 }

function defaultPlate(ink: InkPolarity): Rgb {
  return ink === 'light' ? DARK_PLATE : LIGHT_PLATE
}

export interface StampInput {
  /** The generated picture, as the provider returned it. */
  picture: Uint8Array
  /** The logo file's bytes. */
  logo: Uint8Array
  /** What stage 2 measured about the logo file. */
  facts: LogoFacts
  anchor: Anchor
  /** How big the mark is drawn. Optional; `placeLogo` defaults it to `'medium'`, today's fixed share. */
  sizeStep?: StampSizeStep
  /** The plate colour when one is needed, as #rrggbb. Optional. */
  plate?: string
  /**
   * The OTHER logo variant, when the workspace supplied two.
   *
   * ── WHY THE CHOICE IS MADE HERE AND NOWHERE ELSE ──────────────────────────
   * Picking between a light-background and a dark-background mark needs the
   * luminance of the picture UNDER the mark, and that number exists in exactly
   * one place: after `placeLogo` has said where the mark goes and `meanLuminance`
   * has sampled it. A caller cannot make this decision without redoing both.
   *
   * When both variants have ink, `pickLogoVariant` chooses and this function
   * re-runs once with the winner. `alt` is cleared on that second pass, so the
   * recursion is exactly one level deep and cannot loop: the guard is the
   * absence of the field, not a counter somebody has to keep right.
   *
   * A workspace with ONE logo passes nothing here and takes the path it always
   * did, plate and all. Swapping the mark is better than plating behind it, but
   * plating is what there is when there is only one mark.
   */
  alt?: { bytes: Uint8Array; facts: LogoFacts }
}

export type StampResult =
  | { ok: true; png: Uint8Array; placement: Placement; plated: boolean }
  | { ok: false; reason: string }

const refuse = (reason: string): StampResult => ({ ok: false, reason })

function open(input: Uint8Array): Sharp {
  return sharp(input, { limitInputPixels: MAX_PIXELS, failOn: 'error' })
}

/** Six hex digits, with or without the leading hash. Anything else is a caller bug, not a colour. */
function parsePlate(value: string): Rgb | null {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(value.trim())
  if (match === null) return null
  const digits = match[1]!
  return {
    r: Number.parseInt(digits.slice(0, 2), 16),
    g: Number.parseInt(digits.slice(2, 4), 16),
    b: Number.parseInt(digits.slice(4, 6), 16),
  }
}

function fitsInside(inner: Rect, outer: { width: number; height: number }): boolean {
  return (
    Number.isInteger(inner.x) &&
    Number.isInteger(inner.y) &&
    Number.isInteger(inner.width) &&
    Number.isInteger(inner.height) &&
    inner.width >= 1 &&
    inner.height >= 1 &&
    inner.x >= 0 &&
    inner.y >= 0 &&
    inner.x + inner.width <= outer.width &&
    inner.y + inner.height <= outer.height
  )
}

/**
 * Mean RELATIVE luminance of one region of the picture, normalised 0 to 1.
 *
 * Forced to sRGB with alpha so the read is the same three bytes per pixel
 * whatever the source was: a greyscale PNG decodes to one channel and a CMYK
 * JPEG to four, and indexing those as RGB gives a wrong verdict, not an error.
 *
 * ── EACH CHANNEL IS LINEARISED FIRST, AND THAT IS THE WHOLE POINT ───────────
 * This used to weight the raw sRGB BYTES and divide by 255. That is a gamma
 * encoded value, and the thresholds it feeds — `DARK_INK_MIN_BACKDROP` and
 * `LIGHT_INK_MAX_BACKDROP` in `logo-placement.ts` — are solved from WCAG's
 * `(L1 + 0.05) / (L2 + 0.05)`, which is defined over LINEAR relative luminance.
 * Comparing one against the other is comparing two different quantities.
 *
 * MEASURED, black ink on flat grey backdrops:
 *
 *   backdrop   old read   true L   real contrast   old verdict
 *   RGB  60      0.235     0.045      1.90:1        no plate
 *   RGB  80      0.314     0.080      2.60:1        no plate
 *   RGB 100      0.392     0.127      3.55:1        no plate
 *
 * Every one of those is below the 4.5:1 this module exists to guarantee, and
 * every one was passed without a plate. The band runs roughly RGB 45 to 130,
 * which is an ordinary photographic mid-shadow rather than an exotic input.
 *
 * The suite could not see it: its two backdrops are RGB 18 and RGB 235, and
 * both fall on the SAME side of the threshold in either space. A fixture in the
 * band is what makes this fail, and `stamp.test.ts` now carries one.
 *
 * The transfer function is per CHANNEL and per PIXEL. Applying it to the mean
 * afterwards is a different number again, because it is not linear.
 */
async function meanLuminance(picture: Uint8Array, region: Rect): Promise<number | null> {
  try {
    const { data, info } = await open(picture)
      .extract({ left: region.x, top: region.y, width: region.width, height: region.height })
      .toColourspace('srgb')
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const channels = info.channels
    const pixels = data.length / channels
    if (pixels < 1) return null

    // ── A TRANSPARENT PIXEL IS NOT A BLACK ONE ──────────────────────────────
    // `ensureAlpha()` adds the channel and this loop read only 0-2, so a
    // generated PNG with a transparent region under the mark measured its
    // zeroed RGB as pitch black — plating dark ink that needed no plate, and
    // refusing to plate light ink over what will composite as white. Weighting
    // by coverage is what makes the answer the one a reader will see; a fully
    // transparent region contributes nothing and falls back to white below,
    // because that is what a transparent PNG composites over in every surface
    // this product puts a picture on.
    const alphaAt = channels > 3 ? 3 : -1
    let total = 0
    let covered = 0
    for (let at = 0; at < data.length; at += channels) {
      const alpha = alphaAt === -1 ? 1 : data[at + alphaAt]! / MAX_CHANNEL
      if (alpha === 0) continue
      total +=
        alpha *
        (LUMA_R * linearise(data[at]!) +
          LUMA_G * linearise(data[at + 1]!) +
          LUMA_B * linearise(data[at + 2]!))
      covered += alpha
    }
    // Nothing under the mark at all: the picture is transparent there and will
    // composite over white, which is what the caller is really placing ink on.
    if (covered === 0) return 1
    return total / covered
  } catch {
    return null
  }
}

/**
 * Put the mark on the picture.
 *
 * The order of the refusals below is the order in which a claim becomes
 * possible: there is no point sniffing a picture for a logo that has no ink, and
 * no point measuring a backdrop under a rect that does not fit the canvas.
 */
export async function stampLogo(input: StampInput): Promise<StampResult> {
  const trim = input.facts.trim
  if (trim === null) {
    // `facts.trim` is null, which is what a fully transparent image measures.
    return refuse('The logo file has no ink to stamp, so there is no mark to place.')
  }
  if (trim.width < 1 || trim.height < 1) {
    return refuse(`The logo trim box is empty: ${trim.width}x${trim.height}.`)
  }

  let plateColour: Rgb | null = null
  if (input.plate !== undefined) {
    plateColour = parsePlate(input.plate)
    if (plateColour === null) {
      return refuse(
        `The plate colour must be a hash followed by six hex digits. Got ${input.plate}.`,
      )
    }
  }

  // Facts from the bytes, never from what the provider called them. `sniffImage`
  // is what the upload and generate paths already believe, and its dimensions are
  // the canvas the placement is computed against.
  const sniffed = sniffImage(input.picture)
  if (!sniffed.ok) {
    return refuse(
      `The picture bytes do not decode as an image the channels accept (${sniffed.reason}).`,
    )
  }
  const canvas = { width: sniffed.image.width, height: sniffed.image.height }

  let logoWidth: number | undefined
  let logoHeight: number | undefined
  try {
    const meta = await open(input.logo).metadata()
    logoWidth = meta.width
    logoHeight = meta.height
  } catch {
    return refuse('The logo bytes do not decode as an image.')
  }
  if (logoWidth === undefined || logoHeight === undefined) {
    return refuse(
      'The logo bytes decode but report no size, so the trim box cannot be cut out of them.',
    )
  }
  if (!fitsInside(trim, { width: logoWidth, height: logoHeight })) {
    return refuse(
      `The trim box ${trim.width}x${trim.height} at ${trim.x},${trim.y} lies outside the logo image ${logoWidth}x${logoHeight}.`,
    )
  }

  let placement: Placement
  try {
    placement = placeLogo({
      canvas,
      // Aspect comes from the TRIM, not the file. A padded file is a different
      // shape from its own mark, and the slot is sized for the mark.
      logoAspect: trim.width / trim.height,
      anchor: input.anchor,
      sizeStep: input.sizeStep,
    })
  } catch {
    return refuse('The logo could not be placed on this canvas.')
  }

  if (!fitsInside(placement.clear, canvas)) {
    return refuse(
      `The placement clear area ${placement.clear.width}x${placement.clear.height} at ${placement.clear.x},${placement.clear.y} does not fit the ${canvas.width}x${canvas.height} picture.`,
    )
  }
  if (!fitsInside(placement.mark, canvas)) {
    return refuse(
      `The placement mark ${placement.mark.width}x${placement.mark.height} at ${placement.mark.x},${placement.mark.y} does not fit the ${canvas.width}x${canvas.height} picture.`,
    )
  }

  let mark: Buffer
  try {
    mark = await open(input.logo)
      .extract({ left: trim.x, top: trim.y, width: trim.width, height: trim.height })
      // `fill` because the rect came from the trim's own aspect. Anything else
      // would letterbox the mark inside the slot it was measured for.
      .resize({ width: placement.mark.width, height: placement.mark.height, fit: 'fill' })
      .png()
      .toBuffer()
  } catch {
    // NOT the decode message above: by this point the bytes have already
    // decoded, so a failure here is the extract or the resize, not the file. A
    // caller reading `reason` could not tell a corrupt upload from a
    // compositor fault, which is what this file's "a reason a developer can
    // act on" exists to prevent.
    return refuse(
      `The logo could not be cut to ${placement.mark.width}x${placement.mark.height} from its ${trim.width}x${trim.height} trim box.`,
    )
  }

  const luminance = await meanLuminance(input.picture, placement.mark)
  if (luminance === null) {
    return refuse(
      'The picture region under the mark could not be read, so no plate decision is possible.',
    )
  }
  // ── THE VARIANT CHOICE, AT THE ONE POINT THE BACKDROP IS KNOWN ────────────
  // Before any plate is considered: a plate is the fallback for having one mark,
  // and reaching for it while a better mark is sitting unused would be drawing
  // a rectangle to fix a problem the customer already solved by uploading a
  // second file.
  if (input.alt !== undefined) {
    const chosen = pickLogoVariant({ light: input.facts, dark: input.alt.facts }, luminance)
    if (chosen.ok && chosen.kind === 'dark') {
      // One level, and `alt: undefined` is what makes that true.
      return stampLogo({ ...input, logo: input.alt.bytes, facts: input.alt.facts, alt: undefined })
    }
  }

  const plated = needsPlate(luminance, input.facts.inkPolarity)

  const layers: OverlayOptions[] = []
  if (plated) {
    const colour = plateColour ?? defaultPlate(input.facts.inkPolarity)
    // ── THE PLATE IS `placement.plate`, AND NEVER `placement.clear` ───────────
    // `clear` is the exclusion zone: the promise that nothing encroaches on the
    // mark. Painting it was this file's worst defect. It made the plate twice
    // the mark's height and flush against two of the picture's own edges, which
    // a founder screenshot showed swallowing the corner of a food photo as an
    // opaque white slab. `plate` is the mark plus a quarter of its height, so
    // the exclusion zone stays excluded even where a plate is drawn.
    //
    // The radius is what turns the remaining rectangle into a badge rather than
    // a torn sticker. Clamped to half the shorter side because an SVG `rect`
    // past that silently becomes a stadium instead of erroring.
    const radius = Math.min(
      Math.round(placement.plate.height * PLATE_RADIUS_SHARE),
      Math.floor(Math.min(placement.plate.width, placement.plate.height) / 2),
    )
    // Fully opaque, deliberately: `needsPlate` computed a 4.5:1 guarantee that
    // assumes the plate is the only colour between the backdrop and the mark.
    // A translucent plate would let the backdrop bleed back and break the ratio
    // the caller already decided it needed.
    layers.push({
      input: await roundedRectPng(placement.plate.width, placement.plate.height, radius, colour),
      left: placement.plate.x,
      top: placement.plate.y,
    })
  }
  // The mark goes on last, so it sits on top of its own plate.
  layers.push({ input: mark, left: placement.mark.x, top: placement.mark.y })

  let png: Buffer
  try {
    // PNG, whatever came in. A stamped JPEG re-encoded as JPEG is quantised
    // twice, and the unstamped picture is already stored elsewhere, so there is
    // nothing to gain by paying that a second time.
    png = await open(input.picture).composite(layers).png({ compressionLevel: 9 }).toBuffer()
  } catch {
    return refuse('The picture could not be composited, so nothing was stamped.')
  }

  return { ok: true, png: new Uint8Array(png), placement, plated }
}
