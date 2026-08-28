import { describe, expect, it } from 'vitest'

import { hexOf, isPaint, paintFrom, paintOf } from './paint'

/**
 * THE COLOUR STRINGS THAT RASTERISE TO PURE BLACK.
 *
 * Every entry was MEASURED through this repository's own sharp 0.35.3 /
 * libvips 8.18.3 on 2026-08-28: given as an SVG `fill`, each produced rgba
 * 0,0,0,255 with no error raised. `notacolour` is in the list on purpose, as
 * the control: the rasteriser cannot tell a modern colour function from a typo,
 * so neither may this parser.
 */
const RASTERISES_BLACK = [
  'oklch(0.63 0.17 33)',
  'oklch(1 0 0)',
  'color(srgb 0.894 0.341 0.180)',
  'notacolour',
]

describe('paintFrom refuses every colour string that would silently render black', () => {
  it.each(RASTERISES_BLACK)('refuses %s', (raw) => {
    expect(paintFrom(raw)).toBeNull()
  })

  it('refuses the OKLCH format that workspace_themes actually stores', () => {
    // `ThemeTokensSchema` types these as plain strings and `packages/sites`
    // writes them into live customer CSS, so this is the real shape a brand
    // colour arrives in, not a hypothetical one.
    expect(paintFrom('oklch(0.6657 0.225 36.6)')).toBeNull()
  })

  it('refuses rgb(), which the rasteriser DOES understand', () => {
    // Deliberate. See the header of paint.ts: one shape in, integers out. The
    // cost of accepting a second string format is that the next widening
    // reaches for the one that renders black.
    expect(paintFrom('rgb(228,87,46)')).toBeNull()
  })

  it('refuses a non-string', () => {
    expect(paintFrom(undefined)).toBeNull()
    expect(paintFrom(null)).toBeNull()
    expect(paintFrom(0x112233)).toBeNull()
    expect(paintFrom({ r: 1, g: 2, b: 3 })).toBeNull()
  })

  /**
   * These two used to sit under a name claiming they proved a LENGTH guard.
   * They never did: the patterns are anchored and match at most nine
   * characters, so both inputs were already refused by the regex and the guard
   * they were credited to could not be shown to fail. Caught by an adversarial
   * review; the guard is gone and the name now says what is actually proven.
   */
  it('refuses an empty string and an over-long one, by the anchoring', () => {
    expect(paintFrom('')).toBeNull()
    expect(paintFrom(`#${'a'.repeat(64)}`)).toBeNull()
  })

  it('refuses hex with anything appended, which is what the anchoring is for', () => {
    expect(paintFrom('#e4572e;}body{display:none')).toBeNull()
    expect(paintFrom('#e4572e #000000')).toBeNull()
    // A trailing newline is TRIMMED, not refused, which is why it is asserted
    // as accepted rather than left to look like it was covered above.
    expect(paintFrom('#e4572e\n')).toEqual({ r: 228, g: 87, b: 46, a: 1 })
    // But an interior newline is not whitespace the trim can reach.
    expect(paintFrom('#e4572e\n#000000')).toBeNull()
  })

  it('refuses hex that is the wrong length or not hex at all', () => {
    for (const raw of ['#12', '#1234', '#12345', '#1234567', '112233', '#gggggg']) {
      expect(paintFrom(raw), `${raw} should be refused`).toBeNull()
    }
  })
})

describe('paintFrom accepts the three hex shapes', () => {
  it('expands #rgb by doubling each digit', () => {
    expect(paintFrom('#f80')).toEqual({ r: 255, g: 136, b: 0, a: 1 })
  })

  it('reads #rrggbb', () => {
    expect(paintFrom('#E4572E')).toEqual({ r: 228, g: 87, b: 46, a: 1 })
  })

  it('is case-insensitive and tolerates surrounding space', () => {
    expect(paintFrom('  #e4572e  ')).toEqual(paintFrom('#E4572E'))
  })

  it('reads the alpha byte of #rrggbbaa as a 0-1 fraction', () => {
    expect(paintFrom('#00000080')?.a).toBeCloseTo(128 / 255, 5)
    expect(paintFrom('#000000ff')?.a).toBe(1)
    expect(paintFrom('#00000000')?.a).toBe(0)
  })
})

describe('paintOf refuses out-of-range numbers rather than clamping them', () => {
  it('accepts integers in range', () => {
    expect(paintOf(228, 87, 46)).toEqual({ r: 228, g: 87, b: 46, a: 1 })
  })

  it('refuses a channel above 255, below 0, or fractional', () => {
    expect(paintOf(256, 0, 0)).toBeNull()
    expect(paintOf(-1, 0, 0)).toBeNull()
    expect(paintOf(1.5, 0, 0)).toBeNull()
    expect(paintOf(Number.NaN, 0, 0)).toBeNull()
  })

  it('refuses an alpha outside 0-1', () => {
    expect(paintOf(0, 0, 0, 1.5)).toBeNull()
    expect(paintOf(0, 0, 0, -0.1)).toBeNull()
    expect(paintOf(0, 0, 0, Number.NaN)).toBeNull()
  })
})

describe('hexOf emits six-digit lowercase hex and nothing else', () => {
  it('round-trips through paintFrom', () => {
    const paint = paintFrom('#E4572E')
    expect(paint).not.toBeNull()
    expect(hexOf(paint!)).toBe('#e4572e')
    expect(paintFrom(hexOf(paint!))).toEqual(paint)
  })

  it('pads a single-digit channel', () => {
    expect(hexOf({ r: 0, g: 8, b: 16, a: 1 })).toBe('#000810')
  })

  it('never folds alpha into an eight-digit form', () => {
    expect(hexOf({ r: 0, g: 0, b: 0, a: 0.5 })).toBe('#000000')
    expect(hexOf({ r: 0, g: 0, b: 0, a: 0.5 })).toHaveLength(7)
  })

  it('emits nothing that could be mistaken for a colour function', () => {
    const out = hexOf({ r: 12, g: 34, b: 56, a: 1 })
    expect(out).toMatch(/^#[0-9a-f]{6}$/)
    expect(out).not.toContain('oklch')
    expect(out).not.toContain('color-mix')
  })
})

describe('hexOf refuses a paint that is not one, rather than painting it black', () => {
  it('returns null for a channel that is not a real number', () => {
    // MEASURED against the first commit: this returned the string "#NaN0000",
    // which the renderer emitted and the rasteriser painted pure black.
    expect(hexOf({ r: Number.NaN, g: 0, b: 0, a: 1 })).toBeNull()
    expect(hexOf({ r: Number.POSITIVE_INFINITY, g: 0, b: 0, a: 1 })).toBeNull()
  })

  it('returns null for a channel out of range, and does NOT clamp it', () => {
    // Clamping would invent a colour nobody chose and hide the caller's bug.
    expect(hexOf({ r: 300, g: 0, b: 0, a: 1 })).toBeNull()
    expect(hexOf({ r: -5, g: 0, b: 0, a: 1 })).toBeNull()
  })

  it('returns null for an alpha outside 0-1, and for a missing field', () => {
    expect(hexOf({ r: 0, g: 0, b: 0, a: 2 })).toBeNull()
    expect(hexOf({ r: 0, g: 0 } as never)).toBeNull()
  })

  it('accepts every paint that paintFrom and paintOf can produce', () => {
    for (const raw of ['#000000', '#ffffff', '#f80', '#12345678']) {
      expect(hexOf(paintFrom(raw)!), raw).toMatch(/^#[0-9a-f]{6}$/)
    }
    expect(hexOf(paintOf(0, 128, 255)!)).toBe('#0080ff')
  })
})

describe('isPaint', () => {
  it('accepts what paintOf makes and rejects the shapes that reached hexOf', () => {
    expect(isPaint(paintOf(1, 2, 3))).toBe(true)
    expect(isPaint({ r: Number.NaN, g: 0, b: 0, a: 1 })).toBe(false)
    expect(isPaint(null)).toBe(false)
    expect(isPaint('#000000')).toBe(false)
    expect(isPaint(undefined)).toBe(false)
  })
})
