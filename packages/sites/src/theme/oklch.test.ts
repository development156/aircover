import { describe, it, expect } from 'vitest'
import {
  contrastRatio,
  formatOklch,
  oklchToRgb,
  parseOklch,
  relativeLuminance,
  rgbToOklch,
  type Oklch,
  type Rgb,
} from './oklch'

const WHITE: Rgb = { r: 255, g: 255, b: 255 }
const BLACK: Rgb = { r: 0, g: 0, b: 0 }
// docs/08 §2 brand orange --p:#FF4B00. Decimal, never a hex literal.
const BRAND_ORANGE: Rgb = { r: 255, g: 75, b: 0 }
const PURE_RED: Rgb = { r: 255, g: 0, b: 0 }
const INK: Rgb = { r: 0x13, g: 0x13, b: 0x13 }

describe('parseOklch — accepts ONLY `oklch(L C H)`, returns null instead of throwing', () => {
  it('parses a canonical space-separated triple into numeric l, c and h', () => {
    expect(parseOklch('oklch(0.62 0.14 250)')).toEqual({ l: 0.62, c: 0.14, h: 250 })
  })

  it('tolerates surrounding and extra internal whitespace, which CSS authors emit freely', () => {
    expect(parseOklch('  oklch(  0.62   0.14   250  )  ')).toEqual({ l: 0.62, c: 0.14, h: 250 })
  })

  it('accepts a negative lightness because the guard and the sRGB encoder both clamp downstream', () => {
    expect(parseOklch('oklch(-0.1 0.14 250)')).toEqual({ l: -0.1, c: 0.14, h: 250 })
  })

  // Strictness IS the security control: these values land inside a `:root{...}` block
  // on a customer's live domain, so anything not exactly `oklch(L C H)` is refused.
  const REJECTED_STRINGS: Array<{ raw: string; why: string }> = [
    { raw: 'oklch(62% 0.14 250)', why: 'a percentage lightness is a syntax we never emit' },
    { raw: 'oklch(0.62 14% 250)', why: 'a percentage chroma is a syntax we never emit' },
    { raw: 'oklch(0.62 0.14 250 / 0.5)', why: 'alpha would make --pfg contrast unprovable' },
    { raw: 'oklch(0.62 0.14 250/0.5)', why: 'alpha without spaces must fail the same way' },
    {
      raw: '#ff4b00',
      why: 'hex is banned by docs/08 §1 and carries no chroma to derive tints from',
    },
    { raw: 'rgb(255 75 0)', why: 'another colour space cannot feed the OKLCH derivations' },
    { raw: 'oklch(0.62 0.14)', why: 'a missing hue would silently become NaN' },
    { raw: 'oklch(0.62 0.14 250 1)', why: 'a fourth token means the string is not what we think' },
    {
      raw: 'oklch(0.5 0.1 20); } body{display:none',
      why: 'a CSS-injection payload must be rejected by the parse, not escaped later',
    },
    { raw: 'oklch(.62 .14 250)', why: 'leading-dot decimals are outside the accepted grammar' },
    {
      raw: 'OKLCH(0.62 0.14 250)',
      why: 'we only ever write lowercase; uppercase means foreign input',
    },
    {
      raw: 'oklch(0.62, 0.14, 250)',
      why: 'comma separation is the legacy grammar we do not accept',
    },
    { raw: 'oklch()', why: 'an empty function has no components' },
    { raw: '', why: 'an empty string is the commonest junk value from a jsonb column' },
    { raw: 'not a color at all', why: 'free text must not throw on a render path' },
  ]

  for (const { raw, why } of REJECTED_STRINGS) {
    it(`returns null for ${JSON.stringify(raw)} because ${why}`, () => {
      expect(parseOklch(raw)).toBeNull()
    })
  }

  const NON_STRINGS: Array<{ label: string; raw: unknown }> = [
    { label: 'null', raw: null },
    { label: 'undefined', raw: undefined },
    { label: 'a number', raw: 42 },
    { label: 'a boolean', raw: true },
    { label: 'an object', raw: { l: 0.6, c: 0.1, h: 20 } },
    { label: 'an array', raw: [0.6, 0.1, 20] },
  ]

  for (const { label, raw } of NON_STRINGS) {
    it(`returns null for ${label}, since tokens arrive from untyped jsonb`, () => {
      expect(parseOklch(raw)).toBeNull()
    })
  }
})

describe('formatOklch — the only place rounding happens', () => {
  it('rounds lightness and chroma to 4dp and hue to 1dp, matching the apps/web output byte for byte', () => {
    expect(formatOklch({ l: 0.123456789, c: 0.987654321, h: 123.456789 })).toBe(
      'oklch(0.1235 0.9877 123.5)',
    )
  })

  it('produces a string parseOklch accepts, so format/parse are a closed loop', () => {
    const formatted = formatOklch({ l: 0.6657, c: 0.225, h: 36.6 })
    expect(formatted).toBe('oklch(0.6657 0.225 36.6)')
    expect(parseOklch(formatted)).toEqual({ l: 0.6657, c: 0.225, h: 36.6 })
  })
})

describe('rgbToOklch / oklchToRgb — known values from the ported matrices', () => {
  const KNOWN: Array<{ label: string; rgb: Rgb; expected: string }> = [
    { label: 'pure white', rgb: WHITE, expected: 'oklch(1 0 89.9)' },
    { label: 'pure black', rgb: BLACK, expected: 'oklch(0 0 0)' },
    { label: 'brand orange #FF4B00', rgb: BRAND_ORANGE, expected: 'oklch(0.6657 0.225 36.6)' },
    { label: 'pure red #FF0000', rgb: PURE_RED, expected: 'oklch(0.628 0.2577 29.2)' },
    { label: 'ink #131313', rgb: INK, expected: 'oklch(0.1867 0 89.9)' },
  ]

  for (const { label, rgb, expected } of KNOWN) {
    it(`converts ${label} to ${expected}`, () => {
      expect(formatOklch(rgbToOklch(rgb))).toBe(expected)
    })
  }

  it('reproduces #FF4B00 exactly on the return trip, proving the inverse matrix is the true inverse', () => {
    expect(oklchToRgb(rgbToOklch(BRAND_ORANGE))).toEqual(BRAND_ORANGE)
  })

  it('is lossless for rgb→oklch→rgb across a channel grid, so no colour drifts on a re-theme', () => {
    const drifted: Array<{ input: Rgb; output: Rgb }> = []
    for (let r = 0; r <= 255; r += 17) {
      for (let g = 0; g <= 255; g += 17) {
        for (let b = 0; b <= 255; b += 17) {
          const input: Rgb = { r, g, b }
          const output = oklchToRgb(rgbToOklch(input))
          if (output.r !== r || output.g !== g || output.b !== b) drifted.push({ input, output })
        }
      }
    }
    expect(drifted).toEqual([])
  })

  const ROUND_TRIP: Array<{ label: string; value: Oklch }> = [
    { label: 'brand orange', value: { l: 0.6657, c: 0.225, h: 36.6 } },
    { label: 'a soft green', value: { l: 0.8, c: 0.05, h: 120 } },
    { label: 'a deep violet', value: { l: 0.3, c: 0.08, h: 300 } },
  ]

  for (const { label, value } of ROUND_TRIP) {
    it(`round-trips ${label} oklch→rgb→oklch inside the 8-bit quantisation tolerance`, () => {
      const back = rgbToOklch(oklchToRgb(value))
      expect(Math.abs(back.l - value.l)).toBeLessThanOrEqual(0.01)
      expect(Math.abs(back.c - value.c)).toBeLessThanOrEqual(0.005)
      expect(Math.abs(back.h - value.h)).toBeLessThanOrEqual(0.6)
    })
  }

  it('clamps an out-of-gamut chroma into 0–255 rather than emitting negative or >255 channels', () => {
    expect(oklchToRgb({ l: 0.9, c: 2, h: 120 })).toEqual({ r: 0, g: 255, b: 0 })
  })
})

describe('relativeLuminance — WCAG, the basis of every contrast claim we make', () => {
  it('is exactly 1 for pure white', () => {
    expect(relativeLuminance(WHITE)).toBe(1)
  })

  it('is exactly 0 for pure black', () => {
    expect(relativeLuminance(BLACK)).toBe(0)
  })

  it('is ~0.2159 for mid grey, confirming the sRGB transfer curve is applied and not a linear ramp', () => {
    expect(relativeLuminance({ r: 128, g: 128, b: 128 })).toBeCloseTo(0.21586, 5)
  })
})

describe('contrastRatio — order-independent, 1..21', () => {
  it('is exactly 21 for white against black, the WCAG maximum', () => {
    expect(contrastRatio(WHITE, BLACK)).toBe(21)
  })

  it('is symmetric, so the Readability Guard may pass the pair in either order', () => {
    expect(contrastRatio(BRAND_ORANGE, WHITE)).toBe(contrastRatio(WHITE, BRAND_ORANGE))
    expect(contrastRatio(INK, BRAND_ORANGE)).toBe(contrastRatio(BRAND_ORANGE, INK))
  })

  it('is exactly 1 for a colour against itself, the WCAG minimum', () => {
    expect(contrastRatio(BRAND_ORANGE, BRAND_ORANGE)).toBe(1)
  })
})
