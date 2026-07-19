import { describe, expect, test } from 'vitest'

import { contrastRatio, formatOklch, oklchToRgb, parseOklch, relativeLuminance, rgbToOklch } from './oklch'

describe('rgbToOklch', () => {
  test('formats a valid oklch() string', () => {
    expect(rgbToOklch(255, 75, 0)).toMatch(/^oklch\([\d.]+ [\d.]+ [\d.]+\)$/)
  })

  test('maps white to lightness 1 and zero chroma', () => {
    const { l, c } = parseOklch(rgbToOklch(255, 255, 255))
    expect(l).toBeCloseTo(1, 1)
    expect(c).toBeCloseTo(0, 1)
  })

  test('maps black to lightness 0', () => {
    const { l } = parseOklch(rgbToOklch(0, 0, 0))
    expect(l).toBeCloseTo(0, 1)
  })
})

describe('parseOklch + formatOklch roundtrip', () => {
  test('parses its own formatted output back to the same numbers', () => {
    const formatted = formatOklch(0.62, 0.18, 41.2)
    expect(parseOklch(formatted)).toEqual({ l: 0.62, c: 0.18, h: 41.2 })
  })
})

describe('oklchToRgb', () => {
  test('round-trips rgbToOklch for a saturated orange within tolerance', () => {
    const original = { r: 200, g: 60, b: 20 }
    const { l, c, h } = parseOklch(rgbToOklch(original.r, original.g, original.b))
    const roundTripped = oklchToRgb(l, c, h)
    expect(roundTripped.r).toBeGreaterThan(original.r - 6)
    expect(roundTripped.r).toBeLessThan(original.r + 6)
    expect(roundTripped.g).toBeGreaterThan(original.g - 6)
    expect(roundTripped.g).toBeLessThan(original.g + 6)
  })

  test('clamps channels to the 0–255 range', () => {
    const rgb = oklchToRgb(1.4, 0.4, 30) // deliberately out-of-gamut input
    for (const channel of [rgb.r, rgb.g, rgb.b]) {
      expect(channel).toBeGreaterThanOrEqual(0)
      expect(channel).toBeLessThanOrEqual(255)
    }
  })
})

describe('relativeLuminance', () => {
  test('white is 1 and black is 0', () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5)
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5)
  })
})

describe('contrastRatio', () => {
  test('black on white is the maximum 21:1', () => {
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 0)
  })

  test('a color against itself is exactly 1:1', () => {
    expect(contrastRatio({ r: 128, g: 64, b: 32 }, { r: 128, g: 64, b: 32 })).toBeCloseTo(1, 5)
  })

  test('is order-independent (contrast(a,b) === contrast(b,a))', () => {
    const a = { r: 20, g: 20, b: 200 }
    const b = { r: 250, g: 240, b: 230 }
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10)
  })
})
