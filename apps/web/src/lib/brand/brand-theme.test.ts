import { ThemeTokensSchema } from '@sahoda/shared'
import { describe, expect, test } from 'vitest'

import { contrastRatio, oklchToRgb, parseOklch } from './oklch'
import { brandSkinVars, INK_RGB, themeTokensFrom, WHITE_RGB } from './brand-theme'

const MIN_CONTRAST = 4.5

function foregroundRgb(pfg: string) {
  if (pfg === 'white') return WHITE_RGB
  if (pfg === 'var(--ink)') return INK_RGB
  throw new Error(`Unexpected --pfg value: "${pfg}"`)
}

function primaryForegroundContrast(colors: string[]): number {
  const vars = brandSkinVars(colors)
  const { l, c, h } = parseOklch(vars['--p'])
  const primaryRgb = oklchToRgb(l, c, h)
  return contrastRatio(primaryRgb, foregroundRgb(vars['--pfg']))
}

describe('brandSkinVars', () => {
  test('returns exactly the seven Brand Skin CSS variables', () => {
    const vars = brandSkinVars(['oklch(0.6 0.2 40)'])
    expect(Object.keys(vars).sort()).toEqual(
      ['--acc', '--p', '--pfg', '--pstrong', '--t100', '--t300', '--t50'].sort(),
    )
  })

  test('falls back to the default brand orange when no colors were extracted', () => {
    const vars = brandSkinVars([])
    expect(vars['--p']).toMatch(/^oklch\(/)
    expect(primaryForegroundContrast([])).toBeGreaterThanOrEqual(MIN_CONTRAST)
  })

  // REQUIRED readability guard (docs/superpowers spec, "4. Theme"): --pfg must
  // be white or --ink, whichever clears 4.5:1 against --p; if the extracted
  // primary is too light for either, the guard darkens --p until one does.
  // This must hold across a spread of inputs, including a near-white logo.
  test.each([
    ['near-white pale logo tone', 'oklch(0.98 0.01 95)'],
    ['very light saturated tone', 'oklch(0.95 0.05 100)'],
    ['pure white edge case', 'oklch(1 0 0)'],
    ['mid-lightness saturated orange', 'oklch(0.7 0.19 41)'],
    ['already-dark tone', 'oklch(0.3 0.15 30)'],
    ['saturated blue', 'oklch(0.6 0.2 250)'],
    ['bright light vivid tone', 'oklch(0.88 0.25 130)'],
    ['near-black tone', 'oklch(0.05 0.02 10)'],
  ])('never ships an unreadable --p/--pfg pair for a %s', (_label, color) => {
    expect(primaryForegroundContrast([color])).toBeGreaterThanOrEqual(MIN_CONTRAST)
  })

  test('--pfg is always either "white" or "var(--ink)"', () => {
    const vars = brandSkinVars(['oklch(0.98 0.01 95)'])
    expect(['white', 'var(--ink)']).toContain(vars['--pfg'])
  })
})

describe('themeTokensFrom', () => {
  test('produces a payload the frozen ThemeTokensSchema accepts', () => {
    expect(() => ThemeTokensSchema.parse(themeTokensFrom(['oklch(0.62 0.2 40)']))).not.toThrow()
  })

  test('produces a valid payload even with no extracted colors', () => {
    expect(() => ThemeTokensSchema.parse(themeTokensFrom([]))).not.toThrow()
  })

  test('surface has exactly 4 entries (schema requirement)', () => {
    expect(themeTokensFrom(['oklch(0.62 0.2 40)']).surface).toHaveLength(4)
  })
})

/**
 * Reported by wt-pub while porting this math, and confirmed here before fixing.
 *
 * The Readability Guard's last-resort fallback returned `formatOklch(0, c, h)`,
 * preserving chroma and hue. Two facts make that a live bug rather than dead
 * defensive code:
 *
 *  1. The fallback is UNREACHABLE for finite input — at lightness 0 every
 *     (chroma, hue) clears 4.5:1 against white, so the loop always returns
 *     early. Pinned below.
 *  2. Therefore the ONLY way in is a non-finite component, and NaN >= 4.5 is
 *     false forever — so the loop exhausts and the fallback emits the NaN
 *     straight back out, e.g. `oklch(0 NaN 20)`.
 *
 * `parseOklch` accepts `[\d.+-]+` per component, so `oklch(0.5 . 20)` parses to
 * a NaN chroma — this is reachable from a real extracted-colour string, not only
 * from a hand-built number.
 */
describe('Readability Guard — non-finite components', () => {
  const NON_FINITE_INPUTS = [
    { label: 'chroma', color: 'oklch(0.5 . 20)' },
    { label: 'hue', color: 'oklch(0.5 0.1 .)' },
    { label: 'lightness', color: 'oklch(. 0.1 20)' },
  ] as const

  /** Every var must be a value CSS can actually use. */
  function expectRenderable(value: string, label: string) {
    expect(value, `${label} must not carry NaN`).not.toMatch(/NaN/)
    expect(value, `${label} must not carry Infinity`).not.toMatch(/Infinity/i)
    if (value.startsWith('oklch(')) {
      const { l, c, h } = parseOklch(value)
      for (const [name, n] of [
        ['l', l],
        ['c', c],
        ['h', h],
      ] as const) {
        expect(Number.isFinite(n), `${label} ${name} must be finite`).toBe(true)
      }
    }
  }

  for (const { label, color } of NON_FINITE_INPUTS) {
    test(`survives a non-finite ${label} without emitting NaN in any variable`, () => {
      const vars = brandSkinVars([color])
      for (const [name, value] of Object.entries(vars)) expectRenderable(value, name)
    })

    test(`survives a non-finite ${label} in the accent colour too`, () => {
      // --acc goes through darkenForTextOnWhite, whose fallback has the same
      // shape but is NEVER re-parsed downstream — so a NaN there reaches CSS
      // silently instead of throwing.
      const vars = brandSkinVars(['oklch(0.6 0.2 40)', color])
      for (const [name, value] of Object.entries(vars)) expectRenderable(value, name)
    })
  }

  test('still produces a readable primary/foreground pair from a non-finite input', () => {
    // Degrading must not cost the guarantee the guard exists for.
    expect(primaryForegroundContrast(['oklch(0.5 . 20)'])).toBeGreaterThanOrEqual(MIN_CONTRAST)
  })

  test('pins that the fallback is unreachable for finite input', () => {
    // If this ever fails, the fallback became load-bearing for real colours and
    // its "near-black" assumption needs revisiting — not just its NaN handling.
    let exhausted = 0
    for (let c = 0; c <= 0.5; c += 0.01) {
      for (let h = 0; h < 360; h += 5) {
        if (contrastRatio(oklchToRgb(0, c, h), WHITE_RGB) < MIN_CONTRAST) exhausted += 1
      }
    }
    expect(exhausted).toBe(0)
  })
})
