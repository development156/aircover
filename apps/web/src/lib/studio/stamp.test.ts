import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import type { LogoFacts, TrimBox } from '../brand/logo-facts'
import { placeLogo, type Placement, type Rect } from '../brand/logo-placement'
import { sniffImage } from '../posts/sniff-image'
import { stampLogo } from './stamp'

/**
 * REAL PIXELS, READ BACK OUT OF THE FINISHED PNG.
 *
 * ── WHY NOTHING HERE ASSERTS ON A BYTE COUNT ────────────────────────────────
 * A compositor that returned its own input would satisfy every "it resolved"
 * and every "the buffer is longer than zero" check that could be written about
 * it, and would ship a picture with no mark on it. So every claim below is a
 * colour at a named coordinate, decoded from the bytes the function returned.
 *
 * ── THE FIXTURE LOGO HAS A HOLE IN IT, ON PURPOSE ───────────────────────────
 * The ink is a rectangle with a transparent window at its centre, so one pixel
 * in the middle of the mark shows whatever is BEHIND the mark. That is the only
 * pixel that can tell a plate from no plate without moving outside the mark, and
 * it is what makes "the plate was drawn behind the mark" checkable rather than
 * inferred from a boolean the function set itself.
 *
 * ── AND THE FIXTURE LOGO IS PADDED, ON PURPOSE ──────────────────────────────
 * The ink sits well inside a much larger transparent canvas. A compositor that
 * placed the file instead of the trim box would put mostly padding in the mark
 * rect, so the four corner assertions below are what catch that.
 */

const PICTURE = { width: 600, height: 400 }

/** The logo file: a lot of empty canvas with the mark somewhere inside it. */
const LOGO_FILE = { width: 200, height: 120 }
const TRIM: TrimBox = { x: 40, y: 30, width: 100, height: 60 }
/** The transparent window, in the logo file's own coordinates, centred on the trim box. */
const WINDOW = { x: 70, y: 50, width: 40, height: 20 }

const INK = { r: 20, g: 20, b: 20 }
const LIGHT_BASE = { r: 235, g: 235, b: 235 }
const DARK_BASE = { r: 18, g: 18, b: 18 }
/**
/**
 * A MID-SHADOW, AND THE ONLY BACKDROP IN THIS FILE THAT CAN SEE THE BUG.
 *
 * `DARK_BASE` and `LIGHT_BASE` both fall on the SAME side of the plate
 * threshold whether luminance is computed from gamma-encoded bytes or from
 * linear light, so 13 green tests could not tell the two apart. This one is
 * inside the band where they disagree.
 *
 * MEASURED: RGB 80 reads 0.314 as a raw byte mean, which is above the 0.175
 * dark-ink threshold and therefore "no plate needed". Its true relative
 * luminance is 0.080, and black ink on it is 2.60:1 — well under the 4.5:1
 * this module exists to guarantee.
 */
const MID_SHADOW_BASE = { r: 80, g: 80, b: 80 }

/**
 * Deliberately a colour no fixture could produce by accident.
 *
 * Built FROM the channel values rather than written as a literal, for two
 * reasons. The repository refuses a raw hex colour anywhere in source (docs/37
 * §18), and a test that stated the same colour twice could drift: the string
 * and the pixel it is checked against are now one fact.
 */
const PLATE_RGB = { r: 255, g: 0, b: 255 }
const hex2 = (n: number): string => n.toString(16).padStart(2, '0')
const PLATE = `#${hex2(PLATE_RGB.r)}${hex2(PLATE_RGB.g)}${hex2(PLATE_RGB.b)}`

const DARK_INK_FACTS: LogoFacts = {
  hasAlpha: true,
  transparentBackground: true,
  trim: TRIM,
  inkPolarity: 'dark',
  shapeClass: 'wide',
}

interface Rgb {
  r: number
  g: number
  b: number
}

interface Decoded {
  data: Buffer
  width: number
  height: number
  channels: number
}

async function decode(bytes: Uint8Array): Promise<Decoded> {
  const { data, info } = await sharp(bytes)
    .toColourspace('srgb')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height, channels: info.channels }
}

function pixel(image: Decoded, x: number, y: number): Rgb {
  const at = (y * image.width + x) * image.channels
  return { r: image.data[at]!, g: image.data[at + 1]!, b: image.data[at + 2]! }
}

/** Largest single-channel distance, which is the honest way to say "this colour, near enough". */
function distance(left: Rgb, right: Rgb): number {
  return Math.max(
    Math.abs(left.r - right.r),
    Math.abs(left.g - right.g),
    Math.abs(left.b - right.b),
  )
}

function expectColour(actual: Rgb, expected: Rgb, tolerance: number, where: string): void {
  expect(
    distance(actual, expected),
    `${where}: expected about ${expected.r},${expected.g},${expected.b} but read ${actual.r},${actual.g},${actual.b}`,
  ).toBeLessThanOrEqual(tolerance)
}

/**
 * A picture with per-pixel variation, so "this corner is unchanged" is a real
 * claim rather than a comparison of one flat colour against another. The patch
 * is how a picture gets a corner whose brightness disagrees with its average.
 */
async function makePicture(base: Rgb, patch?: { rect: Rect; colour: Rgb }): Promise<Uint8Array> {
  const raw = Buffer.alloc(PICTURE.width * PICTURE.height * 3)
  for (let y = 0; y < PICTURE.height; y += 1) {
    for (let x = 0; x < PICTURE.width; x += 1) {
      const inPatch =
        patch !== undefined &&
        x >= patch.rect.x &&
        x < patch.rect.x + patch.rect.width &&
        y >= patch.rect.y &&
        y < patch.rect.y + patch.rect.height
      const colour = inPatch ? patch.colour : base
      const wobble = ((x * 7 + y * 13) % 9) - 4
      const at = (y * PICTURE.width + x) * 3
      raw[at] = Math.min(255, Math.max(0, colour.r + wobble))
      raw[at + 1] = Math.min(255, Math.max(0, colour.g + wobble))
      raw[at + 2] = Math.min(255, Math.max(0, colour.b + wobble))
    }
  }
  const png = await sharp(raw, {
    raw: { width: PICTURE.width, height: PICTURE.height, channels: 3 },
  })
    .png()
    .toBuffer()
  return new Uint8Array(png)
}

/**
 * A picture that is DARK everywhere except a fully transparent hole where the
 * mark goes. Four channels, because three cannot express the hole.
 *
 * The read used to ignore alpha entirely, so those zeroed RGB bytes measured as
 * pitch black: the darkest possible backdrop, from a region that will actually
 * composite over white. It plated dark ink that needed no plate.
 */
async function makePictureWithHole(base: Rgb, hole: Rect): Promise<Uint8Array> {
  const raw = Buffer.alloc(PICTURE.width * PICTURE.height * 4)
  for (let y = 0; y < PICTURE.height; y += 1) {
    for (let x = 0; x < PICTURE.width; x += 1) {
      const at = (y * PICTURE.width + x) * 4
      const inHole =
        x >= hole.x && x < hole.x + hole.width && y >= hole.y && y < hole.y + hole.height
      raw[at] = inHole ? 0 : base.r
      raw[at + 1] = inHole ? 0 : base.g
      raw[at + 2] = inHole ? 0 : base.b
      raw[at + 3] = inHole ? 0 : 255
    }
  }
  const png = await sharp(raw, {
    raw: { width: PICTURE.width, height: PICTURE.height, channels: 4 },
  })
    .png()
    .toBuffer()
  return new Uint8Array(png)
}

async function makeLogo(): Promise<Uint8Array> {
  const raw = Buffer.alloc(LOGO_FILE.width * LOGO_FILE.height * 4, 0)
  for (let y = TRIM.y; y < TRIM.y + TRIM.height; y += 1) {
    for (let x = TRIM.x; x < TRIM.x + TRIM.width; x += 1) {
      const inWindow =
        x >= WINDOW.x &&
        x < WINDOW.x + WINDOW.width &&
        y >= WINDOW.y &&
        y < WINDOW.y + WINDOW.height
      if (inWindow) continue
      const at = (y * LOGO_FILE.width + x) * 4
      raw[at] = INK.r
      raw[at + 1] = INK.g
      raw[at + 2] = INK.b
      raw[at + 3] = 255
    }
  }
  const png = await sharp(raw, {
    raw: { width: LOGO_FILE.width, height: LOGO_FILE.height, channels: 4 },
  })
    .png()
    .toBuffer()
  return new Uint8Array(png)
}

/**
 * A patch that covers the clear rectangle and a little more, and NOTHING else.
 *
 * Deliberately small. It has to be, for these tests to mean anything: a patch
 * covering a quarter of the picture would move the whole-picture average far
 * enough to agree with the region under the mark, and then a compositor that
 * averaged the wrong thing would still reach the right answer. At this size the
 * two averages land on opposite sides of the plate threshold.
 */
function patchOverMark(placement: Placement): Rect {
  const grow = 8
  const x = Math.max(0, placement.clear.x - grow)
  const y = Math.max(0, placement.clear.y - grow)
  return {
    x,
    y,
    width: Math.min(PICTURE.width - x, placement.clear.width + grow * 2),
    height: Math.min(PICTURE.height - y, placement.clear.height + grow * 2),
  }
}

function expectedPlacement(): Placement {
  return placeLogo({
    canvas: PICTURE,
    logoAspect: TRIM.width / TRIM.height,
    anchor: 'bottom-right',
  })
}

/** The four corners of the mark, one pixel in, where only trimmed ink can land. */
function markCorners(mark: Rect): Array<{ x: number; y: number; label: string }> {
  return [
    { x: mark.x + 1, y: mark.y + 1, label: 'mark top-left' },
    { x: mark.x + mark.width - 2, y: mark.y + 1, label: 'mark top-right' },
    { x: mark.x + 1, y: mark.y + mark.height - 2, label: 'mark bottom-left' },
    { x: mark.x + mark.width - 2, y: mark.y + mark.height - 2, label: 'mark bottom-right' },
  ]
}

/**
 * A point on the plate's own left edge, vertically centred, away from the
 * corner the radius rounds off. The exact corner pixel `(plate.x, plate.y)`
 * is deliberately NOT this point: a badge with a real radius leaves that pixel
 * unpainted, which is what `stamp.test.ts` asserts separately below.
 */
function platePoint(plate: Rect): { x: number; y: number } {
  return { x: plate.x, y: plate.y + Math.floor(plate.height / 2) }
}

describe('stampLogo: the mark lands where the placement put it', () => {
  it('draws the TRIMMED logo at the placement rect on a light picture, and plates nothing', async () => {
    const picture = await makePicture(LIGHT_BASE)
    const result = await stampLogo({
      picture,
      logo: await makeLogo(),
      facts: DARK_INK_FACTS,
      anchor: 'bottom-right',
    })
    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
    if (!result.ok) return

    expect(result.plated).toBe(false)
    expect(result.placement).toEqual(expectedPlacement())

    const out = await decode(result.png)
    expect({ width: out.width, height: out.height }).toEqual(PICTURE)

    // Every corner of the mark rect is ink. Placing the untrimmed file would put
    // the logo canvas's transparent padding here instead, and these would read
    // as the picture.
    for (const corner of markCorners(result.placement.mark)) {
      expectColour(pixel(out, corner.x, corner.y), INK, 24, corner.label)
    }

    // The window at the centre of the mark shows the picture, because nothing
    // was plated behind it.
    const source = await decode(picture)
    const centreX = result.placement.mark.x + Math.floor(result.placement.mark.width / 2)
    const centreY = result.placement.mark.y + Math.floor(result.placement.mark.height / 2)
    expectColour(
      pixel(out, centreX, centreY),
      pixel(source, centreX, centreY),
      12,
      'window with no plate',
    )
  })

  it('puts nothing of the logo outside the clear rectangle', async () => {
    const picture = await makePicture(LIGHT_BASE)
    const result = await stampLogo({
      picture,
      logo: await makeLogo(),
      facts: DARK_INK_FACTS,
      anchor: 'bottom-right',
    })
    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
    if (!result.ok) return

    const out = await decode(result.png)
    const source = await decode(picture)
    const { clear } = result.placement

    // A ring of pixels one outside each edge of clear, every one still the
    // picture's own colour.
    for (let x = clear.x - 1; x <= clear.x + clear.width && x < PICTURE.width; x += 1) {
      if (x < 0) continue
      const above = clear.y - 1
      if (above >= 0) {
        expect(pixel(out, x, above), `above clear at ${x}`).toEqual(pixel(source, x, above))
      }
    }
    for (let y = clear.y - 1; y <= clear.y + clear.height && y < PICTURE.height; y += 1) {
      if (y < 0) continue
      const left = clear.x - 1
      if (left >= 0) {
        expect(pixel(out, left, y), `left of clear at ${y}`).toEqual(pixel(source, left, y))
      }
    }
  })

  it('leaves a corner far from the mark byte-identical to the original picture', async () => {
    const picture = await makePicture(LIGHT_BASE)
    const result = await stampLogo({
      picture,
      logo: await makeLogo(),
      facts: DARK_INK_FACTS,
      anchor: 'bottom-right',
    })
    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
    if (!result.ok) return

    // Both sides forced to four srgb channels first. The stamped PNG carries an
    // alpha channel that the source RGB picture does not, so a raw comparison
    // without this compares three bytes per pixel against four and reports a
    // difference that is not a difference in any pixel.
    const window = { left: 0, top: 0, width: 64, height: 64 }
    const before = await sharp(picture)
      .extract(window)
      .toColourspace('srgb')
      .ensureAlpha()
      .raw()
      .toBuffer()
    const after = await sharp(result.png)
      .extract(window)
      .toColourspace('srgb')
      .ensureAlpha()
      .raw()
      .toBuffer()
    expect(after.equals(before), 'the top-left 64x64 of the picture changed').toBe(true)
  })
})

describe('stampLogo: the plate is decided from the backdrop under the mark', () => {
  it('plates a dark picture and paints the plate colour behind the mark', async () => {
    const picture = await makePicture(DARK_BASE)
    const result = await stampLogo({
      picture,
      logo: await makeLogo(),
      facts: DARK_INK_FACTS,
      anchor: 'bottom-right',
      plate: PLATE,
    })
    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
    if (!result.ok) return

    expect(result.plated).toBe(true)
    const out = await decode(result.png)

    // Behind the mark, seen through its transparent window.
    const centreX = result.placement.mark.x + Math.floor(result.placement.mark.width / 2)
    const centreY = result.placement.mark.y + Math.floor(result.placement.mark.height / 2)
    expectColour(pixel(out, centreX, centreY), PLATE_RGB, 12, 'window over the plate')

    // The plate rect (not the clear rect) carries the plate colour, on its
    // edge away from the rounded corner.
    const platePt = platePoint(result.placement.plate)
    expectColour(pixel(out, platePt.x, platePt.y), PLATE_RGB, 12, 'plate edge')

    // And the ink is still drawn on top of it.
    for (const corner of markCorners(result.placement.mark)) {
      expectColour(pixel(out, corner.x, corner.y), INK, 24, corner.label)
    }
  })

  it('paints the plate rect, not the clear rect: the clear corner stays the picture, and the plate corner is rounded off', async () => {
    const picture = await makePicture(DARK_BASE)
    const result = await stampLogo({
      picture,
      logo: await makeLogo(),
      facts: DARK_INK_FACTS,
      anchor: 'bottom-right',
      plate: PLATE,
    })
    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
    if (!result.ok) return

    const out = await decode(result.png)
    const { clear, plate } = result.placement

    // `clear` is the exclusion zone, never painted. Its own corner, flush
    // against the picture's own corner, must still read as the picture.
    expectColour(
      pixel(out, clear.x, clear.y),
      DARK_BASE,
      12,
      'clear corner must be the untouched picture, not the plate',
    )
    // Sanity: plate is a strictly smaller rect than clear, geometrically, so
    // there is no way this could pass by the plate happening to cover it too.
    expect(plate.x).toBeGreaterThan(clear.x)
    expect(plate.y).toBeGreaterThan(clear.y)

    // The plate's own exact corner pixel is where the radius rounds the badge
    // off: it must NOT be the plate colour either, or the "badge" is really a
    // square with the label changed.
    expectColour(
      pixel(out, plate.x, plate.y),
      DARK_BASE,
      12,
      'plate corner pixel must be rounded off, not squared',
    )
  })

  it('does not plate a mostly dark picture whose bright corner is where the mark goes', async () => {
    const picture = await makePicture(DARK_BASE, {
      rect: patchOverMark(expectedPlacement()),
      colour: LIGHT_BASE,
    })
    const result = await stampLogo({
      picture,
      logo: await makeLogo(),
      facts: DARK_INK_FACTS,
      anchor: 'bottom-right',
      plate: PLATE,
    })
    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
    if (!result.ok) return

    // Averaging the WHOLE picture reads dark here and would plate. The region
    // under the mark is bright, and bright is what the reader sees.
    expect(result.plated).toBe(false)
    const out = await decode(result.png)
    expectColour(
      pixel(out, result.placement.clear.x, result.placement.clear.y),
      LIGHT_BASE,
      12,
      'clear corner with no plate',
    )
  })

  it('reads a transparent region as what it composites over, not as black', async () => {
    // ── ALPHA WAS NOT READ AT ALL ────────────────────────────────────────────
    // `ensureAlpha()` adds the channel and the luminance loop took only 0-2, so
    // a hole in the picture measured as RGB 0,0,0 — the darkest possible
    // backdrop — from a region that will composite over white. Dark ink there
    // got a plate it did not need, and light ink would have been refused one.
    const picture = await makePictureWithHole(DARK_BASE, patchOverMark(expectedPlacement()))
    const result = await stampLogo({
      picture,
      logo: await makeLogo(),
      facts: DARK_INK_FACTS,
      anchor: 'bottom-right',
      plate: PLATE,
    })
    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
    if (!result.ok) return

    // Dark ink over what will read as white needs no plate.
    expect(result.plated).toBe(false)
  })

  it('plates a mid-shadow backdrop, which a gamma-encoded read calls bright enough', async () => {
    // ── THE FIXTURE THE OTHER THIRTEEN COULD NOT BE ─────────────────────────
    // `meanLuminance` used to weight the raw sRGB bytes and divide by 255,
    // while the threshold it feeds is solved from WCAG's contrast formula,
    // which is defined over LINEAR relative luminance. The two are different
    // quantities and the comparison silently mixed them.
    //
    // RGB 80 is where that shows: 0.314 as a byte mean (above the 0.175
    // threshold, so "no plate"), 0.080 linearised (below it, so "plate"), and
    // black ink on it measures 2.60:1 against a 4.5:1 promise. The band runs
    // roughly RGB 45 to 130 — an ordinary photographic mid-shadow.
    const picture = await makePicture(MID_SHADOW_BASE)
    const result = await stampLogo({
      picture,
      logo: await makeLogo(),
      facts: DARK_INK_FACTS,
      anchor: 'bottom-right',
      plate: PLATE,
    })
    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
    if (!result.ok) return

    expect(result.plated).toBe(true)
    const out = await decode(result.png)
    const platePt = platePoint(result.placement.plate)
    expectColour(
      pixel(out, platePt.x, platePt.y),
      PLATE_RGB,
      12,
      'mid-shadow plate edge, which must carry a plate',
    )
  })

  it('plates a mostly light picture whose dark corner is where the mark goes', async () => {
    const picture = await makePicture(LIGHT_BASE, {
      rect: patchOverMark(expectedPlacement()),
      colour: DARK_BASE,
    })
    const result = await stampLogo({
      picture,
      logo: await makeLogo(),
      facts: DARK_INK_FACTS,
      anchor: 'bottom-right',
      plate: PLATE,
    })
    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
    if (!result.ok) return

    expect(result.plated).toBe(true)
    const out = await decode(result.png)
    const platePt = platePoint(result.placement.plate)
    expectColour(pixel(out, platePt.x, platePt.y), PLATE_RGB, 12, 'plate edge')
  })
})

/** A picture with no per-pixel wobble at all, for backdrops close enough to a threshold that noise would matter. */
async function makeFlatPicture(base: Rgb): Promise<Uint8Array> {
  const raw = Buffer.alloc(PICTURE.width * PICTURE.height * 3)
  for (let i = 0; i < PICTURE.width * PICTURE.height; i += 1) {
    raw[i * 3] = base.r
    raw[i * 3 + 1] = base.g
    raw[i * 3 + 2] = base.b
  }
  const png = await sharp(raw, {
    raw: { width: PICTURE.width, height: PICTURE.height, channels: 3 },
  })
    .png()
    .toBuffer()
  return new Uint8Array(png)
}

const NEAR_BLACK_BACKDROP = { r: 0, g: 0, b: 0 }
const NEAR_WHITE_BACKDROP = { r: 255, g: 255, b: 255 }
const MID_BACKDROP = { r: 154, g: 154, b: 154 } // linearised luminance ≈ 0.35

/**
 * A single mid-tone mark (`darkInkShare`/`lightInkShare` both 0, so nothing
 * pushes `plateDecisionFor` to `'bipolar'`), luminance chosen at ≈0.1791: the
 * point that maximises the WORSE of its two contrasts against pure black and
 * pure white at once (`20L+1 = 1.05/(L+.05)`), giving ~4.58:1 either way.
 */
const MID_TONE_FACTS: LogoFacts = {
  hasAlpha: true,
  transparentBackground: true,
  trim: TRIM,
  inkPolarity: 'mixed',
  shapeClass: 'wide',
  meanInkLuminance: 0.1791,
  darkInkShare: 0,
  lightInkShare: 0,
}

/** Same shape as `MID_TONE_FACTS`, but a mean the fixture's own comment computes as failing. */
const MID_TONE_FAILS_FACTS: LogoFacts = {
  ...MID_TONE_FACTS,
  meanInkLuminance: 0.3,
}

/** Genuinely two-toned: black-and-white in real proportion, not a rounding artefact. */
const BIPOLAR_FACTS: LogoFacts = {
  ...MID_TONE_FACTS,
  meanInkLuminance: 0.5,
  darkInkShare: 0.45,
  lightInkShare: 0.45,
}

/** No ink at all: the fixture the fix must never treat as "safe to skip the plate". */
const NO_INK_MIXED_FACTS: LogoFacts = {
  ...MID_TONE_FACTS,
  meanInkLuminance: null,
  darkInkShare: 0,
  lightInkShare: 0,
}

describe('stampLogo: a MIXED mark, measured, is no longer plated unconditionally', () => {
  it('a mid-tone mark on a near-black backdrop needs no plate: the whole reason this fix exists', async () => {
    const result = await stampLogo({
      picture: await makeFlatPicture(NEAR_BLACK_BACKDROP),
      logo: await makeLogo(),
      facts: MID_TONE_FACTS,
      anchor: 'bottom-right',
      plate: PLATE,
    })
    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
    if (!result.ok) return
    expect(result.plated).toBe(false)
  })

  it('the SAME mid-tone mark on a near-white backdrop also needs no plate: it clears 4.5:1 both ways', async () => {
    const result = await stampLogo({
      picture: await makeFlatPicture(NEAR_WHITE_BACKDROP),
      logo: await makeLogo(),
      facts: MID_TONE_FACTS,
      anchor: 'bottom-right',
      plate: PLATE,
    })
    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
    if (!result.ok) return
    expect(result.plated).toBe(false)
  })

  it('a mid-tone mark whose contrast genuinely fails against a similarly mid backdrop is still plated', async () => {
    const result = await stampLogo({
      picture: await makeFlatPicture(MID_BACKDROP),
      logo: await makeLogo(),
      facts: MID_TONE_FAILS_FACTS,
      anchor: 'bottom-right',
      plate: PLATE,
    })
    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
    if (!result.ok) return
    expect(result.plated).toBe(true)
  })

  it('a bipolar (genuinely two-toned) mark still plates on a near-black backdrop, unchanged', async () => {
    const result = await stampLogo({
      picture: await makeFlatPicture(NEAR_BLACK_BACKDROP),
      logo: await makeLogo(),
      facts: BIPOLAR_FACTS,
      anchor: 'bottom-right',
      plate: PLATE,
    })
    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
    if (!result.ok) return
    expect(result.plated).toBe(true)
  })

  it('a bipolar mark still plates on a near-white backdrop too, unchanged', async () => {
    const result = await stampLogo({
      picture: await makeFlatPicture(NEAR_WHITE_BACKDROP),
      logo: await makeLogo(),
      facts: BIPOLAR_FACTS,
      anchor: 'bottom-right',
      plate: PLATE,
    })
    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
    if (!result.ok) return
    expect(result.plated).toBe(true)
  })

  it('a mixed mark with no ink measured plates unconditionally, never read as "safe to skip"', async () => {
    const result = await stampLogo({
      picture: await makeFlatPicture(NEAR_BLACK_BACKDROP),
      logo: await makeLogo(),
      facts: NO_INK_MIXED_FACTS,
      anchor: 'bottom-right',
      plate: PLATE,
    })
    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
    if (!result.ok) return
    expect(result.plated).toBe(true)
  })

  it('an old-shaped mixed LogoFacts with no meanInkLuminance field at all still plates unconditionally', async () => {
    // The literal has no `meanInkLuminance`, `darkInkShare` or `lightInkShare`
    // keys, not just `undefined` values: this is what a cached record from
    // before this change, or a hand-built fixture that never learned about the
    // new fields, actually looks like.
    const oldShapeFacts: LogoFacts = {
      hasAlpha: true,
      transparentBackground: true,
      trim: TRIM,
      inkPolarity: 'mixed',
      shapeClass: 'wide',
    }
    const result = await stampLogo({
      picture: await makeFlatPicture(NEAR_BLACK_BACKDROP),
      logo: await makeLogo(),
      facts: oldShapeFacts,
      anchor: 'bottom-right',
      plate: PLATE,
    })
    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
    if (!result.ok) return
    expect(result.plated).toBe(true)
  })
})

describe('stampLogo: the plate radius never exceeds half the plate’s own shorter side', () => {
  /**
   * A tall, narrow trim (2px wide, 400px tall inside a 410x410 file) drives
   * `logoAspect` down to 0.005, small enough that `markWidth` floors to 1px
   * while `markHeight` stays substantial at `large` on a 500x500 canvas, so
   * `plate.width` ends up far smaller than `plate.height`.
   *
   * MEASURED by hand from the constants at these inputs: markHeight 100,
   * markWidth 1, pad 25, plate 51x150. `PLATE_RADIUS_SHARE * 150` rounds to
   * 27, past `floor(51 / 2) = 25`, so this is a real case where the unclamped
   * formula would overshoot. SVG's own `rx` silently collapses an over-large
   * radius to a stadium rather than erroring (`rounded-rect.ts`'s own header),
   * so the clamp cannot be told apart from SVG's own by a pixel read; what
   * this test pins is that `stampLogo` still succeeds and still paints a real
   * plate for the tiniest reachable mark, rather than the extreme aspect
   * throwing or silently painting nothing.
   */
  it('still plates the tiniest reachable mark without throwing', async () => {
    const narrowFileSize = 410
    const narrowTrim: TrimBox = { x: 5, y: 5, width: 2, height: 400 }
    const narrowRaw = Buffer.alloc(narrowFileSize * narrowFileSize * 4, 0)
    for (let y = narrowTrim.y; y < narrowTrim.y + narrowTrim.height; y += 1) {
      for (let x = narrowTrim.x; x < narrowTrim.x + narrowTrim.width; x += 1) {
        const at = (y * narrowFileSize + x) * 4
        narrowRaw[at] = INK.r
        narrowRaw[at + 1] = INK.g
        narrowRaw[at + 2] = INK.b
        narrowRaw[at + 3] = 255
      }
    }
    const narrowLogo = new Uint8Array(
      await sharp(narrowRaw, {
        raw: { width: narrowFileSize, height: narrowFileSize, channels: 4 },
      })
        .png()
        .toBuffer(),
    )

    const raw = Buffer.alloc(500 * 500 * 3)
    for (let at = 0; at < raw.length; at += 3) {
      raw[at] = DARK_BASE.r
      raw[at + 1] = DARK_BASE.g
      raw[at + 2] = DARK_BASE.b
    }
    const squarePicture = new Uint8Array(
      await sharp(raw, { raw: { width: 500, height: 500, channels: 3 } })
        .png()
        .toBuffer(),
    )

    const result = await stampLogo({
      picture: squarePicture,
      logo: narrowLogo,
      facts: { ...DARK_INK_FACTS, trim: narrowTrim },
      anchor: 'bottom-right',
      sizeStep: 'large',
      plate: PLATE,
    })
    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
    if (!result.ok) return

    expect(result.plated).toBe(true)
    expect(result.placement.mark.width).toBe(1)
    expect(result.placement.plate.width).toBeLessThan(result.placement.plate.height)

    const out = await decode(result.png)
    const platePt = platePoint(result.placement.plate)
    expectColour(pixel(out, platePt.x, platePt.y), PLATE_RGB, 12, 'tiny-mark plate edge')
  })
})

describe('stampLogo: sizeStep changes the mark size, and threads through to placement', () => {
  it('a "large" sizeStep produces a bigger mark than the default, on the same picture', async () => {
    const picture = await makePicture(LIGHT_BASE)
    const logo = await makeLogo()

    const defaultResult = await stampLogo({
      picture,
      logo,
      facts: DARK_INK_FACTS,
      anchor: 'bottom-right',
    })
    const largeResult = await stampLogo({
      picture,
      logo,
      facts: DARK_INK_FACTS,
      anchor: 'bottom-right',
      sizeStep: 'large',
    })
    expect(defaultResult.ok, defaultResult.ok ? '' : defaultResult.reason).toBe(true)
    expect(largeResult.ok, largeResult.ok ? '' : largeResult.reason).toBe(true)
    if (!defaultResult.ok || !largeResult.ok) return

    expect(largeResult.placement.mark.height).toBeGreaterThan(defaultResult.placement.mark.height)
  })
})

describe('stampLogo: what it returns and what it refuses', () => {
  it('returns PNG bytes even when the picture came in as JPEG', async () => {
    const light = await makePicture(LIGHT_BASE)
    const jpeg = new Uint8Array(await sharp(light).jpeg({ quality: 92 }).toBuffer())
    expect(sniffImage(jpeg).ok && sniffImage(jpeg).ok).toBe(true)

    const result = await stampLogo({
      picture: jpeg,
      logo: await makeLogo(),
      facts: DARK_INK_FACTS,
      anchor: 'top-left',
    })
    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
    if (!result.ok) return

    const sniffed = sniffImage(result.png)
    expect(sniffed.ok).toBe(true)
    if (sniffed.ok) expect(sniffed.image.mime).toBe('image/png')
  })

  it('never modifies the picture it was given', async () => {
    const picture = await makePicture(LIGHT_BASE)
    const before = Uint8Array.from(picture)
    const result = await stampLogo({
      picture,
      logo: await makeLogo(),
      facts: DARK_INK_FACTS,
      anchor: 'bottom-right',
    })
    expect(result.ok).toBe(true)
    expect(
      Buffer.from(picture).equals(Buffer.from(before)),
      'the input picture bytes changed',
    ).toBe(true)
  })

  it('refuses a logo with no trim box, rather than throwing', async () => {
    const result = await stampLogo({
      picture: await makePicture(LIGHT_BASE),
      logo: await makeLogo(),
      facts: { ...DARK_INK_FACTS, trim: null },
      anchor: 'bottom-right',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/no ink/i)
  })

  it('refuses picture bytes that do not decode', async () => {
    const result = await stampLogo({
      picture: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
      logo: await makeLogo(),
      facts: DARK_INK_FACTS,
      anchor: 'bottom-right',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/picture bytes/i)
  })

  it('refuses logo bytes that do not decode', async () => {
    const result = await stampLogo({
      picture: await makePicture(LIGHT_BASE),
      logo: new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9]),
      facts: DARK_INK_FACTS,
      anchor: 'bottom-right',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/logo bytes/i)
  })

  it('refuses a trim box that lies outside the logo file', async () => {
    const result = await stampLogo({
      picture: await makePicture(LIGHT_BASE),
      logo: await makeLogo(),
      facts: { ...DARK_INK_FACTS, trim: { x: 180, y: 100, width: 100, height: 60 } },
      anchor: 'bottom-right',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/outside the logo image/i)
  })

  it('refuses a plate colour that is not six hex digits', async () => {
    const result = await stampLogo({
      picture: await makePicture(DARK_BASE),
      logo: await makeLogo(),
      facts: DARK_INK_FACTS,
      anchor: 'bottom-right',
      plate: 'brand accent',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/six hex digits/i)
  })
})

describe('stampLogo: two marks, and swapping beats plating', () => {
  const LIGHT_INK_FACTS: LogoFacts = { ...DARK_INK_FACTS, inkPolarity: 'light' }

  /**
   * ── WHY THIS IS THE TEST THAT MATTERS ─────────────────────────────────────
   * Plating is what a product does when it has ONE mark: it paints a rectangle
   * so the mark it has can be seen. Swapping is what a designer does when there
   * are two. A workspace that uploaded a second file and still got a rectangle
   * drawn behind the first would have paid attention for nothing.
   *
   * A dark picture with a DARK-ink primary is exactly the case that plated
   * before this existed, so it is the case that must stop plating now.
   */
  it('uses the other mark on a dark picture instead of drawing a plate', async () => {
    const picture = await makePicture(DARK_BASE)
    const result = await stampLogo({
      picture,
      logo: await makeLogo(),
      facts: DARK_INK_FACTS,
      alt: { bytes: await makeLogo(), facts: LIGHT_INK_FACTS },
      anchor: 'bottom-right',
      plate: PLATE,
    })
    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
    if (!result.ok) return

    // The mark that reads was chosen, so no rectangle was needed.
    expect(result.plated).toBe(false)
  })

  it('still plates when there is only one mark, because there is nothing to swap to', async () => {
    // The SAME picture and the SAME primary. The only difference is the absence
    // of a second file, which is what makes the assertion above meaningful.
    const picture = await makePicture(DARK_BASE)
    const result = await stampLogo({
      picture,
      logo: await makeLogo(),
      facts: DARK_INK_FACTS,
      anchor: 'bottom-right',
      plate: PLATE,
    })
    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
    if (!result.ok) return

    expect(result.plated).toBe(true)
  })

  it('keeps the primary on a light picture, where it already reads', async () => {
    const picture = await makePicture(LIGHT_BASE)
    const result = await stampLogo({
      picture,
      logo: await makeLogo(),
      facts: DARK_INK_FACTS,
      alt: { bytes: await makeLogo(), facts: LIGHT_INK_FACTS },
      anchor: 'bottom-right',
      plate: PLATE,
    })
    expect(result.ok, result.ok ? '' : result.reason).toBe(true)
    if (!result.ok) return

    // Swapping here would put light ink on a light picture: a swap for its own
    // sake is as wrong as never swapping.
    expect(result.plated).toBe(false)
  })
})
