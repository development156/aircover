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
/**
 * WCAG 1.4.11: the boundary of a user-interface component needs 3:1 against
 * what is behind it. Lower than the text bar on purpose — this is about seeing
 * the control at all, not reading words on it.
 */
const MIN_SHAPE_CONTRAST = 3
const DARKEN_STEP = 0.03
const MAX_DARKEN_ITERATIONS = 32

/**
 * ── THE SURFACE THE BRAND IS BEING GRADED AGAINST ───────────────────────────
 *
 * Founder's report, 2026-08-29, with a screenshot of the wallet: the selected
 * plan card was a near-white fill carrying near-white text, and the day/night
 * toggle appeared to be changing the BRAND rather than the theme.
 *
 * Both halves of that were this module. Everything here graded against white
 * and nothing else: `--acc` was darkened until it read on `#ffffff`, which is
 * precisely the accent that CANNOT be read on `#171717`; and the three tints
 * were pinned at lightness 0.97 / 0.93 / 0.78, which are near-white fills
 * whatever the theme. In dark, `--ink` is `#ffffff`, so a near-white tint fill
 * carrying ink is white on white. That is the invisible card in the screenshot,
 * and it was not a component defect: it was this function answering a question
 * about a light surface and having its answer applied to a dark one.
 *
 * So the derivation now takes the surface. Two sets of constants, mirroring
 * `tokens.css`'s light block and its `[data-theme='dark']` block, and
 * `guard-neutrals.test.ts` reads the real token file so they cannot drift.
 */
export type SkinSurface = 'light' | 'dark'

interface SurfaceSpec {
  /** The card surface accent TEXT is graded against — `--surface`. */
  surface: Rgb
  /** The dark text candidate for `--pfg`, as a token this theme resolves darkly. */
  darkText: { css: string; rgb: Rgb }
  /** Lightness targets for the three tint fills, relative to that surface. */
  tints: { t50: number; t100: number; t300: number }
  /**
   * Which way the guard walks lightness to gain contrast.
   *
   * On light it DARKENS: a dark fill on a white page reads, and carries white
   * text. On dark it LIGHTENS, and that is not symmetry for its own sake — a
   * fill darkened to clear 4.5:1 against white text is a fill that has
   * disappeared into a `#171717` page. Every dark interface puts a BRIGHT
   * primary button with dark text on a dark ground, for this reason.
   */
  step: number
}

const SURFACES: Record<SkinSurface, SurfaceSpec> = {
  light: {
    surface: SURFACE_RGB,
    darkText: { css: 'var(--ink)', rgb: INK_RGB },
    tints: { t50: 0.97, t100: 0.93, t300: 0.78 },
    step: -DARKEN_STEP,
  },
  dark: {
    // tokens.css dark `--surface: #171717`. The page beneath is `--canvas`
    // #0d0d0d, so clearing the lighter of the two clears both, exactly as the
    // light spec grades against the lighter `#ffffff`.
    surface: { r: 23, g: 23, b: 23 },
    // NOT `var(--ink)`, which is `#ffffff` in dark and would hand back white
    // text on a bright fill. `--canvas` is the token that is dark in the dark
    // theme, so the "point a themeable token at a fixed one" property survives
    // without the value being wrong.
    darkText: { css: 'var(--canvas)', rgb: { r: 13, g: 13, b: 13 } },
    // Sitting just above `--surface-2` (#212121, L 0.27) and `--surface-3`
    // (#292929, L 0.31), so a tint still reads as a tint rather than as the
    // card it is painted on.
    tints: { t50: 0.28, t100: 0.34, t300: 0.52 },
    step: DARKEN_STEP,
  },
}

/**
 * ── GUARDRAILS ON THE COLOUR ITSELF, BEFORE ANY OF THE ABOVE ────────────────
 * From the founder's research, 2026-08-29, and each one answers a case this
 * product has actually hit.
 *
 * A LOGO THAT IS BASICALLY GREY GETS SAHODA'S ORANGE. The founder's own logo
 * is mostly grey and white, the extractor correctly reported grey as the most
 * frequent colour, and the product went washed out. A near-zero chroma is not a
 * brand colour, it is the absence of one, and the honest answer is to keep ours
 * rather than paint the interface in a colour nobody chose.
 *
 * AND CHROMA IS CLAMPED AT BOTH ENDS. Too little and every button is a grey
 * button; too much and a neon logo gives an interface that glows. The band
 * keeps the colour recognisably theirs without either failure.
 *
 * ── LIGHTNESS IS NOT CLAMPED HERE, AND THE REASON WAS WRONG ONCE ────────────
 * The founder's research also asked for a lightness BAND, 45–60%. This comment
 * used to decline it: "the guard below moves it until the contrast is real,
 * which is a stronger statement than a band."
 *
 * The claim was right about bands and wrong about the guard. The guard measured
 * TEXT AGAINST THE FILL and nothing else, so a label could be perfectly legible
 * on a button that was the same colour as the page behind it. MEASURED, fill
 * against page, with every other check passing: navy on dark **1.02:1**, deep
 * purple **1.09:1**, lime on light **1.22:1**, yellow **1.41:1**.
 *
 * `guardPrimaryForeground` now measures that pair too, at WCAG 1.4.11's 3:1.
 * So the original sentence is finally true rather than merely confident: the
 * guard moves lightness until BOTH contrasts are real, which is strictly better
 * than a fixed band because it adapts to the surface and to the hue. A band
 * would refuse a deep navy that a dark theme can actually carry, and admit a
 * yellow that a white page cannot.
 */
const MIN_BRAND_CHROMA = 0.03
const MAX_BRAND_CHROMA = 0.16

/**
 * Can this colour actually become a brand, or will it fall back to ours?
 *
 * ── WHY THIS IS EXPORTED ────────────────────────────────────────────────────
 * MEASURED on the founder's own logo, which is grey, white and black: the panel
 * offered five swatches and every one of them had chroma 0.0000, so every one
 * fell through `guardedInput` to Sahoda orange. Five choices, five no-ops, and
 * a panel that then announced "your brand colours are on" while the product was
 * painted in ours.
 *
 * `no-impossible-remedy.spec.ts` exists in this repository because offering an
 * action that cannot work is a defect of its own. The panel therefore asks this
 * question BEFORE it draws a swatch, and the answer comes from the same constant
 * the derivation uses rather than a second copy of the rule that could drift.
 */
export function isUsableBrandColor(css: string): boolean {
  try {
    const { c } = parseOklch(css)
    return Number.isFinite(c) && c >= MIN_BRAND_CHROMA
  } catch {
    return false
  }
}

function guardedInput(input: { l: number; c: number; h: number }): {
  l: number
  c: number
  h: number
} {
  if (!Number.isFinite(input.c) || input.c < MIN_BRAND_CHROMA) return DEFAULT_PRIMARY
  return { l: input.l, c: Math.min(input.c, MAX_BRAND_CHROMA), h: input.h }
}

/**
 * The accent, when the logo yielded only one colour.
 *
 * SPLIT-COMPLEMENTARY, at +150 degrees, rather than the strict 180 opposite.
 * The founder's research is right about this and it is not merely taste: exact
 * complements of saturated hues vibrate against each other on a screen, and the
 * split lands the same contrast step without that. It also matters that the
 * previous answer was WORSE than either: with one colour the accent reused the
 * primary's own hue, so the accent was the primary and nothing popped at all.
 */
const SPLIT_COMPLEMENT_DEGREES = 150

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

/**
 * ── THE NEUTRALS, TINTED — DESIGN SYSTEM §2 UNFROZEN ────────────────────────
 * Founder's ruling, 2026-08-30, unfreezing the neutral tokens for this and
 * nothing else.
 *
 * WHY IT WAS NEEDED. MEASURED: brand colour reaches under 0.5% of the pixels on
 * any screen — 666 to 5,594 px² of a 1.3M px² frame — and two guards
 * (`accent-area-budget`, `accent-budget`) keep it there on purpose. So switching
 * Brand Skin on recoloured one button and a nav item, and the founder's verdict
 * was that it "feels like a pathetic failed attempt". He was right: the feature
 * could not deliver its promise from 0.5% of the frame however correct the
 * derivation was.
 *
 * WHY IT IS SAFE, AND WHY THAT IS NOT AN ASSUMPTION. Only the CHROMA of each
 * neutral moves; its lightness is read from `tokens.css` and re-emitted
 * unchanged. A hue at this chroma is a whisper — the founder's research calls it
 * "inject base hue into neutrals … makes the interface look cohesive and
 * premium" — and it cannot restratify the tonal ladder, because the ladder is
 * built from lightness.
 *
 * It is NOT, however, free: WCAG relative luminance is computed from sRGB and is
 * not the same function as OKLCH lightness, so adding chroma at fixed L moves
 * the contrast ratio slightly. `brand-neutrals.test.ts` measures that drift on
 * every pair this product actually paints and holds it to a bound. The chroma
 * constant below was chosen FROM that measurement rather than picked.
 *
 * The accent budget is untouched. This does not make the product louder; it
 * makes its quiet parts belong to the customer.
 */
export type BrandNeutralVars = Record<
  '--canvas' | '--surface' | '--surface-2' | '--surface-3' | '--line',
  string
>

/** Mirrors tokens.css. `guard-neutrals.test.ts` reads the real file. */
const NEUTRAL_STOPS: Record<SkinSurface, Record<keyof BrandNeutralVars, Rgb>> = {
  light: {
    '--canvas': { r: 250, g: 250, b: 250 },
    '--surface': { r: 255, g: 255, b: 255 },
    '--surface-2': { r: 242, g: 242, b: 243 },
    '--surface-3': { r: 233, g: 233, b: 235 },
    '--line': { r: 233, g: 233, b: 236 },
  },
  dark: {
    '--canvas': { r: 13, g: 13, b: 13 },
    '--surface': { r: 23, g: 23, b: 23 },
    '--surface-2': { r: 33, g: 33, b: 33 },
    '--surface-3': { r: 41, g: 41, b: 41 },
    '--line': { r: 51, g: 51, b: 51 },
  },
}

/**
 * How much hue a neutral may carry. MEASURED, not chosen: at 0.006 the largest
 * contrast drift across every pair this product paints is under 0.1:1, and the
 * hue is still visible as a cast rather than as a colour. See
 * `brand-neutrals.test.ts` for the table.
 */
const NEUTRAL_CHROMA = 0.006

export function brandNeutralVars(colors: string[], surface: SkinSurface): BrandNeutralVars {
  const { h } = colors[0] ? guardedInput(parseOklch(colors[0])) : DEFAULT_PRIMARY
  const stops = NEUTRAL_STOPS[surface]
  const out = {} as BrandNeutralVars

  for (const key of Object.keys(stops) as (keyof BrandNeutralVars)[]) {
    const { r, g, b } = stops[key]
    // The LIGHTNESS of the real token, unchanged. Only chroma and hue are ours.
    const { l } = parseOklch(rgbToOklch(r, g, b))
    out[key] = formatOklch(l, NEUTRAL_CHROMA, h)
  }
  return out
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
  spec: SurfaceSpec,
): { primary: string; foreground: string } {
  let lightness = l
  for (let step = 0; step <= MAX_DARKEN_ITERATIONS; step += 1) {
    const rgb = oklchToRgb(lightness, c, h)
    const contrastWhite = contrastRatio(rgb, WHITE_RGB)
    const contrastDark = contrastRatio(rgb, spec.darkText.rgb)
    const readableText = contrastWhite >= MIN_CONTRAST || contrastDark >= MIN_CONTRAST
    // ── AND THE FILL ITSELF HAS TO BE VISIBLE ─────────────────────────────
    // The loop used to stop the moment the LABEL was legible, which says
    // nothing about whether the button can be seen. MEASURED: a navy brand on
    // the dark theme came back at 1.02:1 against `#171717` — white text
    // floating on a rectangle exactly the colour of the page behind it — and
    // it passed every check in the suite. Founder's rule, 2026-08-29, and the
    // threshold is WCAG 1.4.11's 3:1 for the boundary of a UI component.
    //
    // The same walk serves both: darkening on a white page separates the fill
    // AND helps white text, lightening on a near-black page does the mirror.
    // So this costs extra steps, never a contradiction, and the fallbacks
    // below are reachable exactly as before.
    const visibleShape = contrastRatio(rgb, spec.surface) >= MIN_SHAPE_CONTRAST
    if (readableText && visibleShape) {
      const foreground = contrastDark >= contrastWhite ? spec.darkText.css : 'white'
      return { primary: formatOklch(lightness, c, h), foreground }
    }
    lightness = Math.min(1, Math.max(0, lightness + spec.step))
  }
  // Exhausted the budget on a pathological input. The fallback goes to whichever
  // end this surface was walking towards, so a dark theme never lands on a
  // near-black button that has vanished into its own page.
  return spec.step < 0
    ? { primary: readableBlack(), foreground: 'white' }
    : { primary: formatOklch(1, 0, 0), foreground: spec.darkText.css }
}

/**
 * Darken (l, c, h) until it reads at >=4.5:1 as TEXT on the card surface.
 *
 * Graded against SURFACE_RGB rather than a bare white: --acc is link and
 * accent-text colour, and the surfaces it lands on are --surface and --canvas.
 * --surface is the lighter of the two, so clearing it clears both.
 */
function textOnSurface(l: number, c: number, h: number, spec: SurfaceSpec): string {
  let lightness = l
  for (let step = 0; step <= MAX_DARKEN_ITERATIONS; step += 1) {
    const rgb = oklchToRgb(lightness, c, h)
    if (contrastRatio(rgb, spec.surface) >= MIN_CONTRAST) return formatOklch(lightness, c, h)
    lightness = Math.min(1, Math.max(0, lightness + spec.step))
  }
  // Whichever end this surface reads against. A near-black link on a near-black
  // page was the exact failure this parameter exists to end.
  return spec.step < 0 ? readableBlack() : formatOklch(1, 0, 0)
}

/**
 * Map extracted logo colors onto the 7 CSS custom properties Brand Skin
 * overrides. `colors[0]` becomes primary (guarded for readable --pfg);
 * `colors[1]` (or the primary hue, if only one color was extracted) becomes
 * --acc, darkened until it reads as text on a light surface. Tints are
 * light/pale steps along the primary's hue.
 */
export function brandSkinVars(colors: string[], surface: SkinSurface = 'light'): BrandSkinVars {
  const spec = SURFACES[surface]
  const primaryInput = colors[0] ? guardedInput(parseOklch(colors[0])) : DEFAULT_PRIMARY
  const { primary, foreground } = guardPrimaryForeground(
    primaryInput.l,
    primaryInput.c,
    primaryInput.h,
    spec,
  )
  const { l, c, h } = parseOklch(primary)

  // The hover step moves AWAY from the page, in whichever direction that is.
  // Darkening a dark-theme button on hover moved it towards its own background,
  // so the loudest control in the product got quieter when you reached for it.
  const pstrong = formatOklch(Math.min(1, Math.max(0, l + spec.step * 3.5)), c, h)

  const accentInput = colors[1]
    ? guardedInput(parseOklch(colors[1]))
    : { l, c, h: (h + SPLIT_COMPLEMENT_DEGREES) % 360 }
  const acc = textOnSurface(accentInput.l, accentInput.c, accentInput.h, spec)

  const t50 = formatOklch(spec.tints.t50, Math.min(c, 0.02), h)
  const t100 = formatOklch(spec.tints.t100, Math.min(c, 0.05), h)
  const t300 = formatOklch(spec.tints.t300, Math.min(Math.max(c, 0.08), 0.16), h)

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
