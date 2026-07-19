import type { ThemeTokens } from '@sahoda/shared'

import { contrastRatio, formatOklch, oklchToRgb, parseOklch, rgbToOklch, type Rgb } from './oklch'

// Pure "colors extracted from a logo" -> Brand Skin mapper (docs/superpowers
// spec, "4. Theme"; Design System §2 Brand Skin contract: a workspace theme
// replaces exactly --p/--pfg/--pstrong/--acc/--t50/--t100/--t300 — neutrals
// and semantics are fixed). Every value here is computed math, never a hex
// literal (docs/08 §1).

export const WHITE_RGB: Rgb = { r: 255, g: 255, b: 255 }
// docs/08 §2 --ink:#131313 -> rgb(19,19,19). A decimal constant, not a hex
// literal, kept here purely so the guard can compute real WCAG contrast.
export const INK_RGB: Rgb = { r: 19, g: 19, b: 19 }

const MIN_CONTRAST = 4.5
const DARKEN_STEP = 0.03
const MAX_DARKEN_ITERATIONS = 32

// docs/08 §2 default brand orange (--p:#FF4B00 = rgb(255,75,0)) — the
// fallback primary when no logo/colors were extracted yet.
const DEFAULT_PRIMARY = parseOklch(rgbToOklch(255, 75, 0))

export type BrandSkinVars = Record<
  '--p' | '--pfg' | '--pstrong' | '--acc' | '--t50' | '--t100' | '--t300',
  string
>

/**
 * Darken (l, c, h) in fixed steps until either white or --ink text clears
 * 4.5:1 against it, then pick whichever passes with the higher contrast.
 * Required Readability Guard: NEVER returns a --p/--pfg pair below 4.5:1.
 */
function guardPrimaryForeground(l: number, c: number, h: number): { primary: string; foreground: string } {
  let lightness = l
  for (let step = 0; step <= MAX_DARKEN_ITERATIONS; step += 1) {
    const rgb = oklchToRgb(lightness, c, h)
    const contrastWhite = contrastRatio(rgb, WHITE_RGB)
    const contrastInk = contrastRatio(rgb, INK_RGB)
    if (contrastWhite >= MIN_CONTRAST || contrastInk >= MIN_CONTRAST) {
      const foreground = contrastInk >= contrastWhite ? 'var(--ink)' : 'white'
      return { primary: formatOklch(lightness, c, h), foreground }
    }
    lightness = Math.max(0, lightness - DARKEN_STEP)
  }
  // Exhausted the darkening budget on a pathological input — force a
  // near-black primary with white text, which always clears 4.5:1.
  return { primary: formatOklch(0, c, h), foreground: 'white' }
}

/** Darken (l, c, h) until it reads at >=4.5:1 as TEXT on a white surface. */
function darkenForTextOnWhite(l: number, c: number, h: number): string {
  let lightness = l
  for (let step = 0; step <= MAX_DARKEN_ITERATIONS; step += 1) {
    const rgb = oklchToRgb(lightness, c, h)
    if (contrastRatio(rgb, WHITE_RGB) >= MIN_CONTRAST) return formatOklch(lightness, c, h)
    lightness = Math.max(0, lightness - DARKEN_STEP)
  }
  return formatOklch(0, c, h)
}

/**
 * Map extracted logo colors onto the 7 CSS custom properties Brand Skin
 * overrides. `colors[0]` becomes primary (guarded for readable --pfg);
 * `colors[1]` (or the primary hue, if only one color was extracted) becomes
 * --acc, darkened until it reads as text on a light surface. Tints are
 * light/pale steps along the primary's hue.
 */
export function brandSkinVars(colors: string[]): BrandSkinVars {
  const primaryInput = colors[0] ? parseOklch(colors[0]) : DEFAULT_PRIMARY
  const { primary, foreground } = guardPrimaryForeground(primaryInput.l, primaryInput.c, primaryInput.h)
  const { l, c, h } = parseOklch(primary)

  const pstrong = formatOklch(Math.max(0, l - 0.1), c, h)

  const accentInput = colors[1] ? parseOklch(colors[1]) : { l, c, h }
  const acc = darkenForTextOnWhite(accentInput.l, accentInput.c, accentInput.h)

  const t50 = formatOklch(0.97, Math.min(c, 0.02), h)
  const t100 = formatOklch(0.93, Math.min(c, 0.05), h)
  const t300 = formatOklch(0.78, Math.min(Math.max(c, 0.08), 0.16), h)

  return {
    '--p': primary,
    '--pfg': foreground,
    '--pstrong': pstrong,
    '--acc': acc,
    '--t50': t50,
    '--t100': t100,
    '--t300': t300,
  }
}

// docs/08 §2 canonical neutral/semantic hex, converted once to decimal RGB —
// never re-themed by Brand Skin, so these stay fixed regardless of `colors`.
const NEUTRAL_RGB = {
  bg: { r: 255, g: 255, b: 255 }, // --bg
  s1: { r: 250, g: 250, b: 249 }, // --s1
  s2: { r: 244, g: 244, b: 243 }, // --s2
  line: { r: 229, g: 229, b: 228 }, // --line
  ink: { r: 19, g: 19, b: 19 }, // --ink
  muted: { r: 82, g: 82, b: 82 }, // --muted
  faint: { r: 163, g: 163, b: 162 }, // --faint
  ok: { r: 21, g: 128, b: 61 }, // --ok
  warn: { r: 180, g: 83, b: 9 }, // --warn
  danger: { r: 200, g: 30, b: 30 }, // --danger
} as const satisfies Record<string, Rgb>

function oklchOf(rgb: Rgb): string {
  return rgbToOklch(rgb.r, rgb.g, rgb.b)
}

/**
 * Full `ThemeTokens` snapshot for future persistence (`workspace_themes`,
 * deferred — see docs/superpowers spec). Brand-derived fields reuse
 * `brandSkinVars`'s guarded output; neutrals/semantics are the fixed
 * Design System palette, per the Brand Skin contract.
 */
export function themeTokensFrom(colors: string[]): ThemeTokens {
  const vars = brandSkinVars(colors)
  const primaryFgRgb = vars['--pfg'] === 'white' ? WHITE_RGB : INK_RGB

  return {
    primary: vars['--p'],
    primaryFg: oklchOf(primaryFgRgb),
    secondary: oklchOf(NEUTRAL_RGB.s2),
    accent: vars['--acc'],
    surface: [NEUTRAL_RGB.bg, NEUTRAL_RGB.s1, NEUTRAL_RGB.s2, NEUTRAL_RGB.line].map(oklchOf),
    text: {
      hi: oklchOf(NEUTRAL_RGB.ink),
      mid: oklchOf(NEUTRAL_RGB.muted),
      low: oklchOf(NEUTRAL_RGB.faint),
    },
    border: oklchOf(NEUTRAL_RGB.line),
    success: oklchOf(NEUTRAL_RGB.ok),
    warning: oklchOf(NEUTRAL_RGB.warn),
    danger: oklchOf(NEUTRAL_RGB.danger),
    radius: '12px',
    fontHeading: 'Outfit',
    fontBody: 'Outfit',
  }
}
