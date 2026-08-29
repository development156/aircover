import { describe, expect, it } from 'vitest'
import type { ThemeTokens } from '@sahoda/shared'

import { contrastRatio } from '@/lib/brand/oklch'
import { describePaletteFallback, inkOn, studioPalette } from './palette'

/** A theme as `workspace_themes.tokens` actually stores one. */
const THEME: ThemeTokens = {
  primary: 'oklch(0.45 0.12 155)',
  primaryFg: 'oklch(1 0 0)',
  secondary: 'oklch(0.6 0.05 155)',
  accent: 'oklch(0.7 0.15 60)',
  surface: [
    'oklch(0.99 0.005 90)',
    'oklch(0.96 0.01 90)',
    'oklch(0.92 0.01 90)',
    'oklch(0.88 0.01 90)',
  ],
  text: { hi: 'oklch(0.2 0.02 155)', mid: 'oklch(0.5 0.02 155)', low: 'oklch(0.7 0.01 155)' },
  border: 'oklch(0.85 0.01 90)',
  success: 'oklch(0.6 0.15 145)',
  warning: 'oklch(0.75 0.15 80)',
  danger: 'oklch(0.55 0.2 25)',
  radius: '12px',
  fontHeading: 'Outfit',
  fontBody: 'Inter',
}

/**
 * THE FAILURE THIS MODULE EXISTS TO PREVENT.
 *
 * MEASURED through this repository's own sharp 0.35.3 / libvips 8.18.3: an SVG
 * fill of `oklch(0.63 0.17 33)` rasterises to rgba 0,0,0,255, indistinguishable
 * from a fill of `notacolour`, with nothing thrown. Brand colours ARE stored as
 * OKLCH, so without this conversion every export would be black.
 */
describe('the studio palette is integers, never a colour string', () => {
  it('turns every OKLCH token into whole numbers in range', () => {
    const { palette } = studioPalette(THEME)
    for (const [role, paint] of Object.entries(palette)) {
      expect(typeof paint.r, role).toBe('number')
      expect(Number.isInteger(paint.r), role).toBe(true)
      expect(paint.r, role).toBeGreaterThanOrEqual(0)
      expect(paint.r, role).toBeLessThanOrEqual(255)
      expect(paint.a, role).toBe(1)
    }
  })

  it('does not hand back black for a colour that is not black', () => {
    // The exact shape of the silent failure: a green brand rendering as ink.
    const { palette } = studioPalette(THEME)
    expect(palette.accent).not.toEqual({ r: 0, g: 0, b: 0, a: 1 })
    expect(palette.accent.g).toBeGreaterThan(palette.accent.r)
  })
})

describe('a theme that cannot be read falls back per role, and says so', () => {
  it('reports nothing when every role converts', () => {
    const resolved = studioPalette(THEME)
    expect(resolved.fellBack).toEqual([])
    expect(describePaletteFallback(resolved)).toBeNull()
  })

  it('falls back only the broken role, not the whole palette', () => {
    const resolved = studioPalette({ ...THEME, primary: 'not-a-colour' })
    expect(resolved.fellBack).toEqual(['accent'])
    // The roles that DID convert are still the customer's.
    expect(resolved.palette.ink).not.toEqual(studioPalette(null).palette.ink)
  })

  it('does not throw on any malformed token, whatever shape it is', () => {
    for (const bad of ['', 'oklch(', 'hsl(1 2% 3%)', 'oklch(a b c)', 'rgb(1,2,3)']) {
      expect(() => studioPalette({ ...THEME, primary: bad }), bad).not.toThrow()
      expect(studioPalette({ ...THEME, primary: bad }).fellBack, bad).toContain('accent')
    }
  })

  /**
   * "No theme" and "a theme we could not read" are different facts. A workspace
   * that never set a brand has not had anything fall back, and telling them
   * their colours failed would be a claim about a thing they never did.
   */
  it('treats no theme at all as no fallback, because nothing was there to read', () => {
    const resolved = studioPalette(null)
    expect(resolved.fellBack).toEqual([])
    expect(describePaletteFallback(resolved)).toBeNull()
  })

  it('says how many colours failed and where to fix them, without naming our fields', () => {
    const said = describePaletteFallback(
      studioPalette({ ...THEME, primary: 'x', text: { ...THEME.text, hi: 'y' } }),
    )
    expect(said).toContain('2 of your brand colours')
    expect(said).toContain('Brand Brain')
    expect(said).not.toContain('primary')
    expect(said).not.toContain('text.hi')
  })

  it('uses the singular for one failed colour', () => {
    const said = describePaletteFallback(studioPalette({ ...THEME, primary: 'x' }))
    expect(said).toContain('One of your brand colours')
  })
})

/**
 * The ink on the accent is CHOSEN by contrast, never read from `primaryFg`.
 * `packages/sites` made the same ruling: a stored foreground can be wrong.
 */
describe('the ink on a brand colour is legible by construction', () => {
  it('picks white on a dark colour and black on a light one', () => {
    expect(inkOn({ r: 10, g: 40, b: 20 })).toEqual({ r: 255, g: 255, b: 255 })
    expect(inkOn({ r: 250, g: 245, b: 200 })).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('always clears 4.5:1 against the accent it sits on', () => {
    // Every hue at a few lightnesses, so this is a property rather than a sample.
    for (let h = 0; h < 360; h += 30) {
      for (const l of [0.25, 0.45, 0.65, 0.85]) {
        const resolved = studioPalette({ ...THEME, primary: `oklch(${l} 0.15 ${h})` })
        const accent = resolved.palette.accent
        const ink = resolved.palette.accentInk
        const ratio = contrastRatio(
          { r: ink.r, g: ink.g, b: ink.b },
          { r: accent.r, g: accent.g, b: accent.b },
        )
        expect(ratio, `oklch(${l} 0.15 ${h}) got ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('ignores a stored primaryFg that would be illegible', () => {
    // A theme claiming white text on near-white. The guard must override it.
    const resolved = studioPalette({
      ...THEME,
      primary: 'oklch(0.97 0.01 90)',
      primaryFg: 'oklch(1 0 0)',
    })
    expect(resolved.palette.accentInk).toEqual({ r: 0, g: 0, b: 0, a: 1 })
  })
})
