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
