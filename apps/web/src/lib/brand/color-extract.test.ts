import { describe, expect, test } from 'vitest'

import { parseOklch } from './oklch'
import { quantize } from './color-extract'

// Flat RGBA byte layout, matching CanvasRenderingContext2D#getImageData().data.
function pixel(r: number, g: number, b: number, a = 255): number[] {
  return [r, g, b, a]
}

function pixels(...rows: number[][]): number[] {
  return rows.flat()
}

describe('quantize', () => {
  test('ranks the most frequent color bucket first', () => {
    const fakePixels = pixels(
      ...Array.from({ length: 20 }, () => pixel(200, 30, 30)), // red-ish, majority
      ...Array.from({ length: 10 }, () => pixel(30, 30, 200)), // blue-ish, minority
    )

    const result = quantize(fakePixels)
    expect(result.length).toBe(2)

    const first = parseOklch(result[0]!)
    const second = parseOklch(result[1]!)
    // Red hues sit near 0-60deg, blue hues near 220-280deg on the OKLCH wheel.
    expect(first.h).toBeLessThan(60)
    expect(second.h).toBeGreaterThan(200)
  })

  test('excludes near-white and near-black pixels (typical logo padding)', () => {
    const fakePixels = pixels(
      ...Array.from({ length: 30 }, () => pixel(250, 250, 250)), // near-white bg
      ...Array.from({ length: 5 }, () => pixel(5, 5, 5)), // near-black bg
      ...Array.from({ length: 8 }, () => pixel(20, 140, 60)), // the actual logo color
    )

    const result = quantize(fakePixels)
    expect(result.length).toBe(1)
    const { h } = parseOklch(result[0]!)
    expect(h).toBeGreaterThan(100)
    expect(h).toBeLessThan(180)
  })

  test('excludes transparent pixels', () => {
    const fakePixels = pixels(
      ...Array.from({ length: 10 }, () => pixel(10, 10, 10, 0)), // fully transparent
      ...Array.from({ length: 6 }, () => pixel(80, 40, 160, 255)),
    )

    const result = quantize(fakePixels)
    expect(result.length).toBe(1)
  })

  test('returns an empty palette for an all-excluded (blank) image', () => {
    const fakePixels = pixels(...Array.from({ length: 12 }, () => pixel(255, 255, 255)))
    expect(quantize(fakePixels)).toEqual([])
  })

  test('caps the palette at 5 colors', () => {
    const distinctHues = [
      [200, 30, 30],
      [30, 200, 30],
      [30, 30, 200],
      [200, 200, 30],
      [30, 200, 200],
      [200, 30, 200],
    ]
    const fakePixels = pixels(...distinctHues.map(([r, g, b]) => pixel(r!, g!, b!)))
    expect(quantize(fakePixels).length).toBeLessThanOrEqual(5)
  })
})
