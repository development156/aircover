import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { describe, expect, test } from 'vitest'
import {
  fitDesignToChannels,
  paintFrom,
  paintOf,
  renderSvg,
  type SvgScene,
  type TextNode,
} from '@sahoda/shared'

/**
 * THE ONE TEST THAT PUTS THE RENDERER THROUGH THE REAL RASTERISER.
 *
 * `packages/shared` cannot do this: it has no `sharp` and must stay pure. So the
 * serialiser is proven there as a string, and proven HERE as pixels, using the
 * same sharp that produces every derivative this product already ships.
 *
 * ── WHAT THIS EXISTS TO CATCH ───────────────────────────────────────────────
 * A design can be perfectly valid SVG, rasterise without error, produce exactly
 * the right pixel dimensions, pass `sniffImage`, satisfy the Constraint Engine
 * and reach a customer's feed as a black rectangle. MEASURED 2026-08-28 through
 * this repository's own sharp 0.35.3 / libvips 8.18.3: an SVG whose fill is
 * `oklch(0.63 0.17 33)` renders rgba 0,0,0,255, byte for byte the same as a fill
 * of `notacolour`, with nothing thrown and nothing logged.
 *
 * Brand colours in this product ARE OKLCH: `workspace_themes.tokens` stores
 * them that way. So the failure is not hypothetical, and it is invisible to
 * every check downstream of the renderer. The assertions below read pixels back
 * out, because reading pixels back out is the only thing that can see it.
 */

/**
 * Built from integers rather than hex, and not only to satisfy the design
 * linter: integers are the shape the renderer actually takes, so a test written
 * this way exercises the contract instead of a convenience parser. The values
 * are the paper, accent and ink of the token set.
 */
const PAPER = paintOf(255, 255, 255)!
const ACCENT = paintOf(255, 102, 0)!
const INK = paintOf(23, 23, 23)!

function poster(): SvgScene {
  return {
    width: 1080,
    height: 1350,
    background: PAPER,
    nodes: [
      { kind: 'rect', x: 0, y: 1150, width: 1080, height: 200, fill: ACCENT },
      {
        kind: 'text',
        x: 540,
        y: 600,
        text: 'Fresh samosas',
        fontFamily: 'sans-serif',
        fontSize: 72,
        fontWeight: 700,
        fill: INK,
        anchor: 'middle',
      },
    ],
  }
}

/** Read one pixel's RGB out of a rasterised PNG. */
async function pixelAt(png: Buffer, x: number, y: number): Promise<[number, number, number]> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
  const i = (y * info.width + x) * info.channels
  return [data[i] as number, data[i + 1] as number, data[i + 2] as number]
}

describe('a design rendered by renderSvg and rasterised by sharp', () => {
  test('comes out at exactly the pixels the preset asked for', async () => {
    const svg = renderSvg(poster())
    expect(svg).not.toBeNull()
    const png = await sharp(Buffer.from(svg as string))
      .png()
      .toBuffer()
    const meta = await sharp(png).metadata()
    expect(meta.width).toBe(1080)
    expect(meta.height).toBe(1350)
  })

  /**
   * THE BLACK-RENDER GUARD.
   *
   * If a colour ever reaches the markup as a function rather than as hex, this
   * pixel is 0,0,0 and every other assertion in this file still passes.
   */
  test('paints the brand colour, and not black', async () => {
    const svg = renderSvg(poster()) as string
    const png = await sharp(Buffer.from(svg)).png().toBuffer()
    expect(await pixelAt(png, 540, 1250)).toEqual([255, 102, 0])
    expect(await pixelAt(png, 10, 10)).toEqual([255, 255, 255])
  })

  test('the same scene twice produces byte-identical PNGs', async () => {
    const svg = renderSvg(poster()) as string
    const a = await sharp(Buffer.from(svg)).png().toBuffer()
    const b = await sharp(Buffer.from(svg)).png().toBuffer()
    expect(createHash('sha256').update(a).digest('hex')).toBe(
      createHash('sha256').update(b).digest('hex'),
    )
  })

  /**
   * The control that gives the guard above its meaning: this is what the
   * failure LOOKS like, asserted directly against the rasteriser rather than
   * described in a comment.
   */
  test('an OKLCH fill really does rasterise to black, which is why paint.ts refuses one', async () => {
    const hand = `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="oklch(0.63 0.17 33)"/></svg>`
    const png = await sharp(Buffer.from(hand)).png().toBuffer()
    expect(await pixelAt(png, 4, 4)).toEqual([0, 0, 0])
    // And the parser refuses that exact string, which is what stops it here.
    expect(paintFrom('oklch(0.63 0.17 33)')).toBeNull()
  })

  /**
   * ── WHAT THIS DOES AND DOES NOT PROVE. THE NAME USED TO OVERCLAIM ──────────
   * It was called "a missing typeface cannot pass as a blank canvas". It cannot
   * catch a missing typeface, and an adversarial review proved it: pointing
   * `fontFamily` at a family installed nowhere leaves all seven tests green,
   * because fontconfig SUBSTITUTES silently and ink still appears.
   *
   * MEASURED in this sandbox: an installed family and an invented one produce
   * indistinguishable ink. So this asserts only that text produces ink at all,
   * which catches a renderer that drops text entirely and nothing finer.
   *
   * Catching substitution needs a fingerprint: committed ink-width constants
   * for known strings in the font this product actually SHIPS, which cannot be
   * written until a font is chosen and bundled. That is the feature's largest
   * unproven assumption and it is recorded in svg.ts's header too.
   */
  test('text produces ink, which catches a renderer that drops text but NOT a substituted font', async () => {
    const withText = renderSvg(poster()) as string
    const withoutText = renderSvg({ ...poster(), nodes: [poster().nodes[0]!] }) as string
    const inked = await sharp(Buffer.from(withText)).greyscale().stats()
    const blank = await sharp(Buffer.from(withoutText)).greyscale().stats()
    expect(inked.channels[0]!.mean).not.toBeCloseTo(blank.channels[0]!.mean, 3)
  })

  test('and the substitution really is invisible here, which is why the name above is narrow', async () => {
    const real = renderSvg(poster()) as string
    const invented = renderSvg({
      ...poster(),
      nodes: [
        poster().nodes[0]!,
        { ...(poster().nodes[1] as TextNode), fontFamily: 'ThisFamilyIsInstalledNowhere' },
      ],
    }) as string
    const a = await sharp(Buffer.from(real)).greyscale().stats()
    const b = await sharp(Buffer.from(invented)).greyscale().stats()
    // Identical ink from two different families. If this ever STOPS being true,
    // a fingerprint guard has become possible and should be written.
    expect(b.channels[0]!.mean).toBeCloseTo(a.channels[0]!.mean, 5)
  })

  /**
   * THE ROUND TRIP THE WHOLE FEATURE RESTS ON: a design becomes bytes, and the
   * Constraint Engine judges those bytes exactly as it judges an uploaded photo.
   */
  test('the exported bytes are then judged by the Constraint Engine, not by the studio', async () => {
    const svg = renderSvg(poster()) as string
    const png = await sharp(Buffer.from(svg)).png().toBuffer()
    const meta = await sharp(png).metadata()

    const fits = fitDesignToChannels(
      {
        width: meta.width as number,
        height: meta.height as number,
        mime: 'image/png',
        bytes: png.length,
      },
      ['instagram', 'facebook', 'linkedin'],
    )
    for (const fit of fits) {
      expect(fit.violations, `${fit.channel} refused a 1080x1350 export`).toEqual([])
    }
  })

  test('and a design too heavy for a channel is refused on its real byte count', async () => {
    // Noise does not compress, so this produces a genuinely large PNG rather
    // than a number typed into a test.
    const noise = await sharp({
      create: {
        width: 2000,
        height: 2000,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
        noise: { type: 'gaussian', mean: 128, sigma: 90 },
      },
    })
      .png()
      .toBuffer()
    expect(noise.length).toBeGreaterThan(5 * 1024 * 1024)

    const [fit] = fitDesignToChannels(
      { width: 2000, height: 2000, mime: 'image/png', bytes: noise.length },
      ['x'],
    )
    expect(fit?.violations.map((v) => v.code)).toContain('MEDIA_SIZE')
  })
})
