import type { ThemeTokens } from '@sahoda/shared'

import { contrastRatio, formatOklch, oklchToRgb, parseOklch, rgbToOklch, type Rgb } from './oklch'

// Pure "colors extracted from a logo" -> Brand Skin mapper (docs/superpowers
// spec, "4. Theme"; Brand Skin contract: a workspace theme replaces exactly
// --p/--pfg/--pstrong/--acc/--t50/--t100/--t300 — neutrals and semantics are
// fixed). Every value here is computed math, never a hex literal (docs/08 §1).
//
// The decimal constants below MIRROR packages/shared/tokens.css, because this
// module cannot read CSS. `guard-neutrals.test.ts` reads the real token file and
// fails if any of them drift — they silently held the v2 cool greys through the
// v3 swap, which had the Guard grading tenant brands against surfaces the app
// had stopped painting.

/** The literal `white` keyword, used as a TEXT colour on a brand fill. */
export const WHITE_RGB: Rgb = { r: 255, g: 255, b: 255 }
/**
 * The card SURFACE accent text is graded against — tokens.css `--surface`.
 * Numerically equal to WHITE_RGB today but a different thing: one is ink, the
 * other is paper. --surface is the lighter of the two light surfaces, so it is
 * also the stricter of the two to read against.
 */
export const SURFACE_RGB: Rgb = { r: 255, g: 255, b: 255 }
/** tokens.css `--ink` (#000000) — headings, and the dark option for --pfg. */
export const INK_RGB: Rgb = { r: 0, g: 0, b: 0 }

const MIN_CONTRAST = 4.5
const DARKEN_STEP = 0.03
const MAX_DARKEN_ITERATIONS = 32

// Default brand orange (tokens.css --p: #FF6600 = rgb(255,102,0)) — the
// fallback primary when no logo/colors were extracted yet.
const DEFAULT_PRIMARY = parseOklch(rgbToOklch(255, 102, 0))

/**
 * The last-resort near-black both darkening loops fall back to.
 *
 * It drops CHROMA rather than carrying it through, because the fallback is only
 * ever reached with a non-finite component. At lightness 0 every finite
 * (chroma, hue) already clears 4.5:1 against white, so a finite colour returns
 * from the loop early and never lands here — pinned by a test. The one way in is
 * a NaN/Infinity component, and `NaN >= MIN_CONTRAST` is false forever, so the
 * loop exhausts its budget and the old code handed the NaN straight back out as
 * `oklch(0 NaN 20)`. That is invalid CSS: as a primary it threw when re-parsed,
 * and as `--acc` — which nothing re-parses — it reached the stylesheet silently.
 *
 * Hue is neutralised for the same reason. At zero chroma it has no visual
 * effect whatsoever, so pinning it costs nothing and closes the `oklch(0 0 NaN)`
 * case that dropping chroma alone leaves open.
 *
 * Reported by wt-pub while porting this math; their port drops chroma.
 */
function readableBlack(): string {
  return formatOklch(0, 0, 0)
}

export type BrandSkinVars = Record<
  '--p' | '--pfg' | '--pstrong' | '--acc' | '--t50' | '--t100' | '--t300',
  string
>

/**
 * Darken (l, c, h) in fixed steps until either white or --ink text clears
 * 4.5:1 against it, then pick whichever passes with the higher contrast.
 * Required Readability Guard: NEVER returns a --p/--pfg pair below 4.5:1.
 */
function guardPrimaryForeground(
  l: number,
  c: number,
  h: number,
): { primary: string; foreground: string } {
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
  return { primary: readableBlack(), foreground: 'white' }
}

/**
 * Darken (l, c, h) until it reads at >=4.5:1 as TEXT on the card surface.
 *
 * Graded against SURFACE_RGB rather than a bare white: --acc is link and
 * accent-text colour, and the surfaces it lands on are --surface and --canvas.
 * --surface is the lighter of the two, so clearing it clears both.
 */
function darkenForTextOnSurface(l: number, c: number, h: number): string {
  let lightness = l
  for (let step = 0; step <= MAX_DARKEN_ITERATIONS; step += 1) {
    const rgb = oklchToRgb(lightness, c, h)
    if (contrastRatio(rgb, SURFACE_RGB) >= MIN_CONTRAST) return formatOklch(lightness, c, h)
    lightness = Math.max(0, lightness - DARKEN_STEP)
  }
  return readableBlack()
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
  const { primary, foreground } = guardPrimaryForeground(
    primaryInput.l,
    primaryInput.c,
    primaryInput.h,
  )
  const { l, c, h } = parseOklch(primary)

  const pstrong = formatOklch(Math.max(0, l - 0.1), c, h)

  const accentInput = colors[1] ? parseOklch(colors[1]) : { l, c, h }
  const acc = darkenForTextOnSurface(accentInput.l, accentInput.c, accentInput.h)

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

// tokens.css v4 neutral/semantic hex, converted once to decimal RGB — never
// re-themed by Brand Skin, so these stay fixed regardless of `colors`. Keys keep
// their legacy names (`s1`, `muted`) while the values track the current tokens;
// the comment on each line is the mirror `guard-neutrals.test.ts` enforces.
//
// v4 made the palette achromatic and dropped red/green/amber entirely, so `ok`
// is black and `warn`/`danger` are both the brand orange. That is not a bug in
// the mirror: severity is carried by fill weight + glyph + label, never by hue
// (docs/ui-package/sahoda-labs/theme/RETHEME.md §5).
export const NEUTRAL_RGB = {
  bg: { r: 255, g: 255, b: 255 }, // --surface   #ffffff
  // v5: the page ground is NO LONGER white. A card is a card because it is
  // brighter than the page, not because it has a line around it.
  s1: { r: 250, g: 250, b: 250 }, // --canvas    #fafafa
  s2: { r: 242, g: 242, b: 243 }, // --surface-2 #f2f2f3
  line: { r: 233, g: 233, b: 236 }, // --line    #e9e9ec
  ink: { r: 0, g: 0, b: 0 }, // --ink            #000000
  muted: { r: 87, g: 87, b: 90 }, // --ink-mute  #57575a
  faint: { r: 140, g: 140, b: 140 }, // --ink-faint #8c8c8c
  ok: { r: 0, g: 0, b: 0 }, // --ok              #000000
  warn: { r: 255, g: 102, b: 0 }, // --warn      #ff6600
  danger: { r: 255, g: 102, b: 0 }, // --danger  #ff6600
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
    // tokens.css --r-lg (cards, nav items, wells). Pinned by guard-neutrals.test.ts.
    // v5: --r-lg. The card radius is load-bearing for the look, so it is
    // mirrored from tokens.css rather than frozen here — guard-neutrals.test.ts
    // asserts this equals `token('r-lg')` and caught it at 12px when the ladder
    // moved to 24px.
    radius: '24px',
    fontHeading: 'Plus Jakarta Sans',
    fontBody: 'Plus Jakarta Sans',
  }
}
