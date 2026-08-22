import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

import { buttonVariants } from '@/components/ui/button'

/**
 * A REFUSAL HAS TO BE READABLE, AND IT HAS TO LOOK LIKE A REFUSAL.
 *
 * ── THE DEFECT ───────────────────────────────────────────────────────────────
 * The primary button's disabled recipe was
 * `disabled:bg-line disabled:text-white disabled:opacity-100`, and the same one
 * line failed in opposite directions in the two themes.
 *
 *   light  `--line` is `#dcdcdc`, so white on it measures **1.37:1**. The label
 *          of every disabled primary in the product was effectively invisible,
 *          and `opacity-100` existed specifically to stop the base 45% dimming
 *          from applying — so nothing was left to rescue it.
 *   dark   `--line` is `rgba(255,255,255,.14)` over a near-black surface, which
 *          composites to a dark grey. White on THAT is high contrast, so the
 *          refusal read as a live, pressable button.
 *
 * Neither theme's screenshot alone would settle it: the light frame looks like a
 * blank button and the dark frame looks correct. Only grading the pair does.
 *
 * ── WHY THIS TEST GRADES TOKENS AND NOT A SCREENSHOT ─────────────────────────
 * `own-medicine.test.ts` established the pattern: read the SHIPPED token file
 * and put the real values through real contrast arithmetic. A visual test would
 * need a browser, a theme, and a rendered button; this needs none of them and
 * cannot be satisfied by a fixture that happens to be light.
 *
 * It is a `.tsx` despite containing no JSX. `vitest.config.ts` runs `*.test.ts`
 * in the `lib` project, which has no React plugin, so importing `button.tsx`
 * from a `.ts` test fails to transform its JSX and the file reports "no tests"
 * rather than a failure. The extension is what selects the project.
 */

const require_ = createRequire(import.meta.url)
const TOKENS = readFileSync(require_.resolve('@sahoda/shared/tokens.css'), 'utf8')

/**
 * Pull `--name: value;` from either the light `:root` block or the dark block.
 *
 * The dark block starts at the `[data-theme='dark']` selector, so "the last
 * declaration at or before that point" is light and "the first after it" is
 * dark. Written this way rather than with a CSS parser because a wrong answer
 * here would silently grade the light value twice and report a clean pass.
 */
const DARK_AT = TOKENS.indexOf("[data-theme='dark']")

function token(name: string, theme: 'light' | 'dark'): string {
  const re = new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'gm')
  let light: string | null = null
  let dark: string | null = null
  for (const m of TOKENS.matchAll(re)) {
    if (m.index === undefined) continue
    if (m.index < DARK_AT) light ??= m[1]!.trim()
    else dark ??= m[1]!.trim()
  }
  const value = theme === 'light' ? light : (dark ?? light)
  if (!value) throw new Error(`tokens.css has no ${name} for ${theme}`)
  return value
}

interface Rgb {
  r: number
  g: number
  b: number
}

function parseColour(value: string, over: Rgb): Rgb {
  const hex = value.match(/^#([0-9a-f]{6})$/i)
  if (hex) {
    const h = hex[1]!
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    }
  }
  const rgba = value.match(/^rgba?\(([^)]+)\)$/i)
  if (rgba) {
    const parts = rgba[1]!
      .split(/[,\s/]+/)
      .filter(Boolean)
      .map(Number)
    const [r, g, b] = parts as [number, number, number]
    const a = parts.length > 3 ? parts[3]! : 1
    // Composite onto the surface it is painted on. A translucent hairline is
    // NOT its own colour, and treating it as one is how a dark-mode contrast
    // check produces a number nothing on screen ever shows.
    return { r: r * a + over.r * (1 - a), g: g * a + over.g * (1 - a), b: b * a + over.b * (1 - a) }
  }
  throw new Error(`cannot parse colour: ${value}`)
}

function linear(v: number): number {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

function ratio(a: Rgb, b: Rgb): number {
  const la = 0.2126 * linear(a.r) + 0.7152 * linear(a.g) + 0.0722 * linear(a.b)
  const lb = 0.2126 * linear(b.r) + 0.7152 * linear(b.g) + 0.0722 * linear(b.b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

const AA_BODY = 4.5

/** The pair the disabled primary actually paints: --surface-2 under --ink-mute. */
function disabledPair(theme: 'light' | 'dark'): { fg: Rgb; bg: Rgb; contrast: number } {
  const canvas = parseColour(token('--canvas', theme), { r: 255, g: 255, b: 255 })
  const bg = parseColour(token('--surface-2', theme), canvas)
  const fg = parseColour(token('--ink-mute', theme), bg)
  return { fg, bg, contrast: ratio(fg, bg) }
}

describe('a disabled primary is legible AND looks inert, in both themes', () => {
  it('the class list still uses the graded pair rather than bg-line / text-white', () => {
    const classes = buttonVariants({ variant: 'primary' })
    // Named directly, because the whole defect was one token swapped for
    // another that happened to compile.
    expect(classes, 'white on --line measures 1.37:1 on light').not.toContain('disabled:bg-line')
    expect(classes, 'white on --line measures 1.37:1 on light').not.toContain('disabled:text-white')
    expect(classes).toContain('disabled:bg-s2')
    expect(classes).toContain('disabled:text-muted')
  })

  for (const theme of ['light', 'dark'] as const) {
    it(`${theme}: the disabled label clears AA against its own fill`, () => {
      const { contrast } = disabledPair(theme)
      console.log(
        `[disabled primary] ${theme} --ink-mute on --surface-2 = ${contrast.toFixed(2)}:1`,
      )
      expect(contrast).toBeGreaterThanOrEqual(AA_BODY)
    })
  }

  it('the OLD recipe still measures as the defect it was, so this test can fail', () => {
    // Calibration, in the same spirit as the detector self-test: a guard that
    // has never been shown the bad case is a guard nobody can trust. If
    // `--line` is ever changed to something that passes, this assertion breaks
    // and the comment above it should be revisited rather than the number.
    const canvasLight = parseColour(token('--canvas', 'light'), { r: 255, g: 255, b: 255 })
    const lineLight = parseColour(token('--line', 'light'), canvasLight)
    const white = { r: 255, g: 255, b: 255 }
    const old = ratio(white, lineLight)
    console.log(`[disabled primary] the OLD light pair, white on --line = ${old.toFixed(2)}:1`)
    expect(old).toBeLessThan(2)
  })

  it('dark does not make the refusal look pressable', () => {
    // The other half of the failure. White on the dark composite measured
    // ~17.9:1, which is BRIGHTER than the live secondary button — a disabled
    // control must never be the loudest thing in its row.
    const canvasDark = parseColour(token('--canvas', 'dark'), { r: 0, g: 0, b: 0 })
    const surfaceDark = parseColour(token('--surface-2', 'dark'), canvasDark)
    const white = { r: 255, g: 255, b: 255 }
    const asShipped = disabledPair('dark').contrast
    const ifWhite = ratio(white, surfaceDark)
    console.log(
      `[disabled primary] dark: shipped ${asShipped.toFixed(2)}:1 vs white ${ifWhite.toFixed(2)}:1`,
    )
    expect(asShipped).toBeLessThan(ifWhite)
  })
})
