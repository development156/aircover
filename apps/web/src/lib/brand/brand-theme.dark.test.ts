import { describe, it, expect } from 'vitest'

import { brandSkinVars, type SkinSurface } from './brand-theme'
import { contrastRatio, oklchToRgb, parseOklch, rgbToOklch, type Rgb } from './oklch'

/**
 * Brand Skin, graded against the surface it will actually be painted on.
 *
 * ── THE SCREENSHOT THIS FILE EXISTS FOR ─────────────────────────────────────
 * Founder's report, 2026-08-29: the selected plan card on /wallet was a
 * near-white fill carrying near-white text, in dark mode. `brand-theme.ts`
 * graded everything against `#ffffff` and pinned the tints at lightness 0.97 /
 * 0.93 / 0.78. In dark, `--ink` is `#ffffff`. So the fill and the text were both
 * near-white and the card was blank.
 *
 * No component was wrong. The derivation answered a question about a light
 * surface and its answer was applied to a dark one, which is a class of defect
 * a single-surface test suite cannot see by construction. These run every claim
 * against BOTH surfaces.
 */

/** tokens.css: light `--surface` #ffffff, dark `--surface` #171717. */
const PAGE: Record<SkinSurface, Rgb> = {
  light: { r: 255, g: 255, b: 255 },
  dark: { r: 23, g: 23, b: 23 },
}

/** tokens.css: light `--ink` #000000, dark `--ink` #ffffff. */
const INK: Record<SkinSurface, Rgb> = {
  light: { r: 0, g: 0, b: 0 },
  dark: { r: 255, g: 255, b: 255 },
}

const SURFACES: SkinSurface[] = ['light', 'dark']

/** A spread wide enough that a rule which only works on one hue cannot pass. */
const BRANDS: Record<string, string> = {
  teal: rgbToOklch(0, 128, 128),
  crimson: rgbToOklch(190, 20, 40),
  navy: rgbToOklch(10, 30, 90),
  'neon yellow': rgbToOklch(240, 255, 20),
  'near-white': rgbToOklch(248, 248, 250),
  'near-black': rgbToOklch(8, 8, 10),
}

const rgbOf = (value: string): Rgb => {
  const { l, c, h } = parseOklch(value)
  return oklchToRgb(l, c, h)
}

describe.each(SURFACES)('on the %s surface', (surface) => {
  describe.each(Object.entries(BRANDS))('a %s brand', (_name, brand) => {
    const vars = brandSkinVars([brand], surface)

    /** The Readability Guard's whole promise, restated per surface. */
    it('carries readable text on the primary fill', () => {
      const fg = vars['--pfg'] === 'white' ? { r: 255, g: 255, b: 255 } : PAGE[surface].r > 128 ? INK.light : { r: 13, g: 13, b: 13 }
      expect(contrastRatio(rgbOf(vars['--p']), fg)).toBeGreaterThanOrEqual(4.5)
    })

    /**
     * `--acc` is link and accent TEXT. Darkening it until it read on white was
     * exactly the accent that cannot be read on `#171717`.
     */
    it('reads as text on the page it lands on', () => {
      expect(contrastRatio(rgbOf(vars['--acc']), PAGE[surface])).toBeGreaterThanOrEqual(4.5)
    })

    /**
     * ── THE INVISIBLE CARD, DIRECTLY ──────────────────────────────────────
     * A tint is a FILL, and body ink is painted on it. The screenshot was a
     * 1.0:1 pairing. 4.5:1 is the text threshold and the one that matters here,
     * because what sits on a tint fill is words.
     */
    it.each(['--t50', '--t100'] as const)('lets ink read on the %s fill', (token) => {
      expect(contrastRatio(rgbOf(vars[token]), INK[surface])).toBeGreaterThanOrEqual(4.5)
    })

    /** A tint that equals the page is not a tint; it is a card that vanished. */
    it.each(['--t50', '--t100'] as const)('separates the %s fill from the page', (token) => {
      expect(contrastRatio(rgbOf(vars[token]), PAGE[surface])).toBeGreaterThan(1.02)
    })
  })
})

describe('the guardrails on the extracted colour', () => {
  /**
   * THE FOUNDER'S OWN LOGO. It is mostly grey and white, the extractor
   * correctly reported grey as the most frequent colour, and the product went
   * washed out. A near-zero chroma is not a brand colour, it is the absence of
   * one, so Sahoda's own is kept rather than painting the interface a colour
   * nobody chose.
   */
  it('falls back to Sahoda orange for a colour with no chroma', () => {
    const grey = brandSkinVars([rgbToOklch(200, 200, 202)])
    const orange = brandSkinVars([])

    expect(grey).toEqual(orange)
  })

  /** And the fallback is a real one: it must not simply hand the grey back. */
  it('does not paint the product grey', () => {
    expect(parseOklch(brandSkinVars([rgbToOklch(200, 200, 202)])['--p']).c).toBeGreaterThan(0.03)
  })

  /** A neon logo must not give an interface that glows. */
  it('clamps a fluorescent brand into a usable band', () => {
    const neon = brandSkinVars([rgbToOklch(0, 255, 30)])
    expect(parseOklch(neon['--p']).c).toBeLessThanOrEqual(0.16)
  })

  /**
   * SPLIT-COMPLEMENTARY, NOT THE PRIMARY'S OWN HUE. With one extracted colour
   * the accent used to reuse the primary's hue, so the accent WAS the primary
   * and nothing popped. +150 rather than the strict 180 because exact
   * complements of saturated hues vibrate on a screen.
   */
  it('gives the accent a hue of its own when only one colour was found', () => {
    const { '--p': p, '--acc': acc } = brandSkinVars([rgbToOklch(0, 128, 128)])
    const gap = Math.abs(parseOklch(p).h - parseOklch(acc).h)

    expect(Math.min(gap, 360 - gap)).toBeGreaterThan(60)
  })

  /** Two extracted colours are the person's own answer and are kept. */
  it('uses the second extracted colour when there is one', () => {
    const paired = brandSkinVars([rgbToOklch(0, 128, 128), rgbToOklch(190, 20, 40)])
    const alone = brandSkinVars([rgbToOklch(0, 128, 128)])

    expect(paired['--acc']).not.toBe(alone['--acc'])
  })
})

describe('the two surfaces', () => {
  it('do not produce the same tokens', () => {
    const brand = rgbToOklch(0, 128, 128)
    expect(brandSkinVars([brand], 'light')).not.toEqual(brandSkinVars([brand], 'dark'))
  })

  /** Light is the default, so every existing caller keeps what it had. */
  it('default to light, which is what every existing caller assumed', () => {
    const brand = rgbToOklch(0, 128, 128)
    expect(brandSkinVars([brand])).toEqual(brandSkinVars([brand], 'light'))
  })

  /**
   * The hover step moves AWAY from the page. Darkening a dark-theme button on
   * hover moved it towards its own background, so the loudest control in the
   * product got quieter when you reached for it.
   */
  it('move the hover step away from the page, not into it', () => {
    const brand = rgbToOklch(0, 128, 128)

    const light = brandSkinVars([brand], 'light')
    expect(parseOklch(light['--pstrong']).l).toBeLessThan(parseOklch(light['--p']).l)

    const dark = brandSkinVars([brand], 'dark')
    expect(parseOklch(dark['--pstrong']).l).toBeGreaterThan(parseOklch(dark['--p']).l)
  })
})
