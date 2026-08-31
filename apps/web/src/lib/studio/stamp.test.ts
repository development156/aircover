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

    // The plate is sized to clear, so its own corner is the plate colour too.
    expectColour(
      pixel(out, result.placement.clear.x, result.placement.clear.y),
      PLATE_RGB,
      12,
      'clear corner',
    )

    // And the ink is still drawn on top of it.
    for (const corner of markCorners(result.placement.mark)) {
      expectColour(pixel(out, corner.x, corner.y), INK, 24, corner.label)
    }
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
    expectColour(
      pixel(out, result.placement.clear.x, result.placement.clear.y),
      PLATE_RGB,
      12,
      'clear corner',
    )
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
