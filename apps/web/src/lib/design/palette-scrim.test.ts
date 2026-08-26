import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * THE COMMAND PALETTE'S SCRIM DARKENS THE PAGE, IN BOTH THEMES.
 *
 * ── THE DEFECT THIS EXISTS FOR ───────────────────────────────────────────────
 * The overlay was `bg-ink/30`. `--ink` is the theme's FOREGROUND: `#000000` on
 * light and `#ffffff` on dark. So the scrim inverted with the theme, and nothing
 * anywhere said so — it reads, in a diff, exactly like a dark scrim.
 *
 * MEASURED 2026-08-25 in Chromium against the real tokens:
 *
 *   light   page rgb(250) -> rgb(175)   luminance 0.956 -> 0.429   (dims)
 *   dark    page rgb(13)  -> rgb(86)    luminance 0.004 -> 0.093   (LIFTS, 23x)
 *
 * In dark the page came out BRIGHTER than the panel sitting over it — rgb(86)
 * behind an rgb(23) panel — so the palette read as a hole in a washed-out page
 * rather than as a sheet above it. That is the "no difference contrast between
 * background and foreground" this was reported as, and the cause was the scrim,
 * not the panel.
 *
 * ── AND A SECOND RULE NOBODY READ ────────────────────────────────────────────
 * Tailwind compiles an alpha utility as a PAIR, verified in this app's own
 * built CSS:
 *
 *   .bg-ink\/30{background-color:var(--ink)}
 *   @supports (color:color-mix(in lab,red,red)){ .bg-ink\/30{…var(--ink) 30%…} }
 *
 * A browser without `color-mix` therefore got a FULLY OPAQUE `fixed inset-0`
 * fill — solid black on light, solid white on dark. `modal.tsx` already carries
 * this ruling at its own backdrop, for the same reason and in the same words;
 * this overlay was the one that ignored it.
 *
 * ── WHY THIS GUARD IS ARITHMETIC OVER TOKENS AND NOT A SCREENSHOT ────────────
 * Because the claim is about a COMPOSITE that exists only once a scrim is laid
 * over a canvas, and both sides are theme-dependent tokens. Asserting the class
 * string alone would pass on `bg-ink/40`, which is the same bug one digit later.
 * So this composites the real values and asserts the direction of the change.
 *
 * `palette-legibility.spec.ts` measures the rendered pixels and the focus ring's
 * geometry, which this cannot see. This one runs in the unit gate, on every
 * commit, with no browser and no auth — the same split `glass-fallback.test.ts`
 * uses.
 *
 * ── WHAT THIS GUARD CANNOT SEE ───────────────────────────────────────────────
 * Whether the panel is actually PAINTED over the scrim, the focus ring, the
 * shadow, or anything about layout. It reads two files and does colour
 * arithmetic. A panel moved outside the overlay would still pass here.
 */

const HERE = dirname(fileURLToPath(import.meta.url))

function webRoot(): string {
  return resolve(HERE, '../../..')
}

function read(relative: string): string {
  return readFileSync(join(webRoot(), relative), 'utf8')
}

const PALETTE = read('src/components/shell/command-palette.tsx')
const TOKENS = readFileSync(join(webRoot(), '../../packages/shared/tokens.css'), 'utf8')

/** sRGB relative luminance, 0-1. */
function luminance([r, g, b]: readonly number[]): number {
  const c = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * c(r!) + 0.7152 * c(g!) + 0.0722 * c(b!)
}

/** A token's colour, whichever spelling tokens.css used for it. */
function parseColour(value: string): { rgb: number[]; alpha: number } {
  const v = value.trim()
  if (v.startsWith('#')) {
    const h = v.slice(1)
    const full = h.length === 3 ? [...h].map((ch) => ch + ch).join('') : h
    return { rgb: [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)), alpha: 1 }
  }
  return parseRgb(v)
}

/** `rgb(0 0 0 / 0.4)` and `rgba(0,0,0,0.4)` alike. */
function parseRgb(value: string): { rgb: number[]; alpha: number } {
  const m = /rgba?\(([^)]+)\)/.exec(value)
  if (!m) throw new Error(`not an rgb colour: ${value}`)
  // Both spellings: `rgba(0, 0, 0, 0.4)` and the space/slash form `rgb(0 0 0 / 0.4)`.
  const parts = m[1]!
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map((n) => parseFloat(n))
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`could not parse an rgb colour from: ${value}`)
  }
  return { rgb: parts.slice(0, 3), alpha: parts.length > 3 ? parts[3]! : 1 }
}

/**
 * A token's value in one theme.
 *
 * tokens.css declares the light values on `:root` and the dark ones in later
 * blocks, so the LAST declaration before the theme's boundary wins. Reading the
 * final occurrence for dark and the first for light matches the cascade closely
 * enough for these five tokens, and every one of them is asserted below to have
 * been found rather than defaulted — a guard that silently reads a missing token
 * as black would pass on nothing at all.
 */
function tokenValue(name: string, theme: 'light' | 'dark'): string {
  const all = [...TOKENS.matchAll(new RegExp(`${name}:\\s*([^;]+);`, 'g'))].map((m) => m[1]!.trim())
  if (all.length === 0) throw new Error(`token ${name} is not declared in tokens.css`)
  // The first declaration is the light one on :root; dark redeclares it later.
  return theme === 'light' ? all[0]! : all[all.length - 1]!
}

function ratio(a: readonly number[], b: readonly number[]): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** `over` composited onto opaque `under`. */
function composite(over: { rgb: number[]; alpha: number }, under: number[]): number[] {
  return over.rgb.map((c, i) => Math.round(c * over.alpha + under[i]! * (1 - over.alpha)))
}

function overlayClasses(): string {
  const m = /data-palette-overlay[\s\S]*?className="([^"]+)"/.exec(PALETTE)
  if (!m) throw new Error('no element carries data-palette-overlay')
  return m[1]!
}

/**
 * WHAT THE OVERLAY ACTUALLY PAINTS, resolved from its own class in one theme.
 *
 * Reading `--scrim` directly would have made the assertions below vacuous: they
 * would state that the scrim token darkens the page, which is true no matter
 * what the palette uses, and would have passed unchanged on the `bg-ink/30`
 * that caused the bug. So the class is the input, exactly as the browser takes
 * it, and both spellings resolve here:
 *
 *   bg-[var(--scrim)]   the token, alpha included
 *   bg-ink/30           the token at 30% — the shape of the defect
 */
function scrimPaintedBy(theme: 'light' | 'dark'): { rgb: number[]; alpha: number } {
  const classes = overlayClasses()

  const arbitrary = /bg-\[var\((--[a-z0-9-]+)\)\]/.exec(classes)
  if (arbitrary) return parseColour(tokenValue(arbitrary[1]!, theme))

  const alpha = /(?:^|\s)bg-([a-z0-9-]+)\/(\d+)(?:\s|$)/.exec(classes)
  if (alpha) {
    const base = parseColour(tokenValue(`--${alpha[1]}`, theme))
    return { rgb: base.rgb, alpha: Number(alpha[2]) / 100 }
  }

  const plain = /(?:^|\s)bg-([a-z0-9-]+)(?:\s|$)/.exec(classes)
  if (plain) return parseColour(tokenValue(`--${plain[1]}`, theme))

  throw new Error(`could not tell what the overlay paints from: ${classes}`)
}

function dialogClasses(): string {
  const m = /role="dialog"[\s\S]*?className="([^"]+)"/.exec(PALETTE)
  if (!m) throw new Error('the palette renders no dialog with a className')
  return m[1]!
}

/**
 * WHAT THE PANEL ACTUALLY PAINTS in one theme, from its own class.
 *
 * Same reason `scrimPaintedBy` exists: naming `--surface-3` in the test would
 * assert that the token is bright enough, which it is regardless of whether the
 * panel uses it. Removing `dark:bg-surface-3` from the component has to fail
 * here, and reading the class is what makes it.
 */
function panelFillFor(theme: 'light' | 'dark'): number[] {
  const classes = dialogClasses()
  const dark = /(?:^|\s)dark:bg-([a-z0-9-]+)(?:\s|$)/.exec(classes)
  const base = /(?:^|\s)bg-([a-z0-9-]+)(?:\s|$)/.exec(classes)
  const token = theme === 'dark' && dark ? dark[1]! : base?.[1]
  if (!token) throw new Error(`could not tell what the panel paints from: ${classes}`)
  return parseColour(tokenValue(`--${token}`, theme)).rgb
}

describe('the palette overlay', () => {
  test('paints the scrim token, not an alpha of the theme’s foreground', () => {
    expect(overlayClasses()).toContain('bg-[var(--scrim)]')
    // The bug, and every one-digit variant of it. `--ink` is #000 on light and
    // #fff on dark, so ANY alpha of it inverts with the theme.
    expect(overlayClasses()).not.toMatch(/\bbg-ink(-body)?\/\d+/)
  })

  test('the scrim is a plain colour, so it compiles to ONE rule', () => {
    // A `bg-<token>/<alpha>` utility compiles to an unconditional opaque
    // declaration plus a `color-mix` override inside @supports. The opaque half
    // is a full-viewport black (or white) rectangle wherever color-mix is
    // missing. A token that already carries its own alpha has no such pair.
    for (const theme of ['light', 'dark'] as const) {
      const scrim = scrimPaintedBy(theme)
      expect(scrim.alpha, `the overlay must be translucent in ${theme}`).toBeLessThan(1)
      expect(scrim.alpha, `the overlay must actually dim in ${theme}`).toBeGreaterThan(0.2)
    }
  })
})

describe('opening the palette darkens the page', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`in ${theme}`, () => {
      const canvas = parseColour(tokenValue('--canvas', theme)).rgb
      const scrimmed = composite(scrimPaintedBy(theme), canvas)

      expect(
        luminance(scrimmed),
        `the scrim must DARKEN the page in ${theme}: rgb(${canvas}) -> rgb(${scrimmed})`,
      ).toBeLessThan(luminance(canvas))
    })
  }
})

describe('the panel is never darker than the page it floats over', () => {
  /**
   * The failure this catches is not low contrast — it is INVERTED elevation. A
   * sheet above the page that is darker than the page reads as a hole, and the
   * eye stops treating it as the foreground however sharp its edge is.
   *
   * The panel is `bg-surface dark:bg-surface-3`: the top of the elevation ladder
   * in each theme. In light that is `--surface` (#ffffff, already the brightest
   * thing there); in dark `--surface` is rgb(23) and the ladder goes on to
   * rgb(41), which is why the two themes name different tokens for one job.
   */
  for (const theme of ['light', 'dark'] as const) {
    test(`in ${theme}`, () => {
      const canvas = parseColour(tokenValue('--canvas', theme)).rgb
      const scrimmed = composite(scrimPaintedBy(theme), canvas)
      const panel = panelFillFor(theme)

      expect(
        luminance(panel),
        `the panel rgb(${panel}) must not be darker than the scrimmed page rgb(${scrimmed})`,
      ).toBeGreaterThan(luminance(scrimmed))

      // ── AND IT MUST OUT-SEPARATE AN ORDINARY CARD ────────────────────────
      // A NEW RULING, not a docs/37 citation, so the arithmetic is written out
      // rather than cited. A card is `--surface` on `--canvas`; in dark that is
      // rgb(23) on rgb(13), which measures 1.09:1. A modal is meant to read as
      // further above the page than a card, so it has to beat that by a clear
      // margin rather than tie it.
      //
      // MEASURED over the corrected scrim, dark:
      //   panel --surface   rgb(23) over rgb(5)   1.14:1   barely a card
      //   panel --surface-3 rgb(41) over rgb(5)   1.40:1
      //
      // Hence `dark:bg-surface-3`. 1.25 sits between the two: it fails the fill
      // this panel used to carry and passes the one it carries now, which is the
      // only way this line means anything.
      const cardStep = ratio(
        parseColour(tokenValue('--surface', theme)).rgb,
        parseColour(tokenValue('--canvas', theme)).rgb,
      )
      const panelStep = ratio(panel, scrimmed)
      expect(
        panelStep,
        `the palette must lift further off the page than a card does in ${theme}: ` +
          `panel ${panelStep.toFixed(2)}:1 against the page, card ${cardStep.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(1.25)
    })
  }

  test('and the panel carries its own EDGE, because in dark the fill cannot', () => {
    // MEASURED: panel --surface-3 over the scrimmed dark page is 1.40:1. That is
    // a step, not a separation, and darkening the scrim further cannot help —
    // black minus more black is still black. apps/web/CLAUDE.md's standing rule
    // is that anything which must read as a distinct object in dark carries a
    // ring, so the palette's separation lives on its edge and its shadow.
    expect(dialogClasses()).toMatch(/surface-ring-firm/)
    expect(dialogClasses()).toMatch(/shadow-lg/)
  })
})
