import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { describe, expect, test } from 'vitest'
import { paintOf, renderSvg, type SvgScene } from '@sahoda/shared'

import { rasterisePng } from './raster'

/**
 * THE EXPORT PIPELINE, END TO END, THROUGH THE REAL RASTERISER.
 *
 * `raster.test.ts` beside this file proves things about renderSvg's OUTPUT as
 * pixels. This one proves the module that turns a design into the bytes that
 * reach the assets library: the size is what was asked for, the hash is of the
 * bytes actually produced, and a document that cannot be drawn is refused
 * rather than stored as something else.
 */

const PAPER = paintOf(255, 255, 255)!
const ACCENT = paintOf(255, 102, 0)!

function poster(width = 1080, height = 1350): SvgScene {
  return {
    width,
    height,
    background: PAPER,
    nodes: [
      { kind: 'rect', x: 0, y: height - 200, width, height: 200, fill: ACCENT },
      {
        kind: 'text',
        x: Math.round(width / 2),
        y: Math.round(height / 2),
        text: 'Fresh samosas',
        fontFamily: 'sans-serif',
        fontSize: 72,
        fontWeight: 700,
        fill: ACCENT,
        anchor: 'middle',
      },
    ],
  }
}

describe('rasterisePng', () => {
  test('produces a PNG at exactly the preset size', async () => {
    const markup = renderSvg(poster()) as string
    const result = await rasterisePng(markup, { width: 1080, height: 1350 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.width).toBe(1080)
    expect(result.height).toBe(1350)
    const meta = await sharp(Buffer.from(result.bytes)).metadata()
    expect(meta.format).toBe('png')
    expect(meta.width).toBe(1080)
    expect(meta.height).toBe(1350)
  })

  /**
   * THE SIZE GUARD, AND WHY IT IS NOT PARANOIA.
   *
   * Sharp rasterises an SVG at a density, so the pixels it lands on are not
   * guaranteed to be the width attribute. An export one pixel off the preset
   * passes every check in this module, reaches a channel, and is refused there
   * on a screen that cannot explain why. Refusing here keeps the reason in hand.
   */
  test('refuses a picture that is not the size the caller asked for', async () => {
    const markup = renderSvg(poster()) as string
    const result = await rasterisePng(markup, { width: 1080, height: 1351 })
    expect(result).toEqual({ ok: false, reason: 'wrong-size' })
  })

  test('the hash is of the bytes it returns, not of the markup', async () => {
    const markup = renderSvg(poster()) as string
    const result = await rasterisePng(markup, { width: 1080, height: 1350 })
    if (!result.ok) throw new Error('expected a raster')
    expect(result.sha256).toBe(createHash('sha256').update(result.bytes).digest('hex'))
    expect(result.sha256).not.toBe(createHash('sha256').update(markup).digest('hex'))
  })

  /**
   * THE DETERMINISM THE WHOLE EXPORT DESIGN RESTS ON.
   *
   * `studio_exports` exists because this is true: the same design exported
   * twice produces the same bytes, so the second press collides with the assets
   * library's duplicate refusal unless something answers for it. If this ever
   * stops being true, that table stops being necessary and a second press
   * quietly stores a second copy of the same picture instead.
   */
  test('the same design twice produces the same hash', async () => {
    const markup = renderSvg(poster()) as string
    const a = await rasterisePng(markup, { width: 1080, height: 1350 })
    const b = await rasterisePng(markup, { width: 1080, height: 1350 })
    if (!a.ok || !b.ok) throw new Error('expected two rasters')
    expect(a.sha256).toBe(b.sha256)
  })

  test('two different designs produce different hashes', async () => {
    const one = renderSvg(poster()) as string
    const two = renderSvg({ ...poster(), background: ACCENT }) as string
    const a = await rasterisePng(one, { width: 1080, height: 1350 })
    const b = await rasterisePng(two, { width: 1080, height: 1350 })
    if (!a.ok || !b.ok) throw new Error('expected two rasters')
    expect(a.sha256).not.toBe(b.sha256)
  })

  test('refuses markup that is not a drawable document, rather than storing something else', async () => {
    const result = await rasterisePng('this is not an svg', { width: 8, height: 8 })
    expect(result).toEqual({ ok: false, reason: 'unrenderable' })
  })

  test('a small canvas still comes out at its own size', async () => {
    const markup = renderSvg(poster(600, 600)) as string
    const result = await rasterisePng(markup, { width: 600, height: 600 })
    if (!result.ok) throw new Error('expected a raster')
    expect([result.width, result.height]).toEqual([600, 600])
  })
})
