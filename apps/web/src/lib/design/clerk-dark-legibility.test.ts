import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

import { clerkAppearance } from '@/lib/clerk-appearance'

/**
 * CLERK'S TEXT HAS TO BE READABLE IN DARK, AND THE ONLY WAY TO KNOW IS TO DO
 * THE ARITHMETIC ON THE TOKENS IT POINTS AT.
 *
 * ── THE DEFECT ───────────────────────────────────────────────────────────────
 * `clerk-appearance.ts` set `colorText`, `colorTextSecondary`,
 * `colorInputBackground` and `colorInputText`. None of those four is a member
 * of the appearance `Variables` type in the Clerk the app installs — they are
 * the v4 names, renamed under the v6 theming engine. Clerk ignored all four and
 * used its own light-card defaults: secondary text `#747686`, `colorNeutral`
 * black, and a WHITE input fill. On `--surface` in dark that is near-black text
 * on near-black card, and a white box in the middle of a dark form.
 *
 * ── WHY THE TYPE `satisfies` IS NOT ENOUGH ON ITS OWN ────────────────────────
 * `satisfies ClerkAppearance` catches a key Clerk does not know. It cannot
 * catch a key Clerk DOES know pointed at a token that is unreadable on the
 * background beside it, and it cannot catch a key being deleted. Both of those
 * are the same customer-visible failure, so they get arithmetic.
 *
 * ── AND WHY IT GRADES THE PAIR, NOT THE VALUE ────────────────────────────────
 * Pinning `--muted` would fail the day the palette is legitimately retuned.
 * What must stay true is the RATIO between the text and the thing behind it.
 */

const require_ = createRequire(import.meta.url)
const TOKENS = readFileSync(require_.resolve('@sahoda/shared/tokens.css'), 'utf8')
const DARK_AT = TOKENS.indexOf("[data-theme='dark']")

/**
 * The value a token holds in one theme. Declarations after the dark block are
 * the dark ones; a token the dark block does not redeclare keeps its light
 * value, which is how `--p` stays one brand orange in both themes.
 */
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

/**
 * Follows `--muted: var(--ink-mute)` through to a colour.
 *
 * An alias declared on `:root` resolves against whichever declaration of its
 * TARGET wins on that same element, and `[data-theme='dark']` matches the same
 * <html> the alias sits on — so `--muted` is the dark `--ink-mute` in dark.
 * tokens.css carries that reasoning at the L3 alias block; this follows it.
 */
function resolve(value: string, theme: 'light' | 'dark', depth = 0): string {
  if (depth > 8) throw new Error(`token alias loop at ${value}`)
  const alias = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(value.trim())
  if (!alias) return value.trim()
  return resolve(token(alias[1]!, theme), theme, depth + 1)
}

function linear(v: number): number {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

function luminance(hex: string): number {
  const h = hex.replace('#', '').trim()
  if (h.length !== 6) throw new Error(`expected plain hex, got ${hex}`)
  return (
    0.2126 * linear(parseInt(h.slice(0, 2), 16)) +
    0.7152 * linear(parseInt(h.slice(2, 4), 16)) +
    0.0722 * linear(parseInt(h.slice(4, 6), 16))
  )
}

function ratio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

const vars = clerkAppearance.variables as Record<string, string>

/** Reads one appearance variable through to the colour it actually paints. */
function paint(name: string, theme: 'light' | 'dark'): string {
  const value = vars[name]
  if (value === undefined) {
    throw new Error(
      `clerkAppearance.variables has no ${name} — Clerk falls back to its own ` +
        `light-card default, which is what made dark mode unreadable`,
    )
  }
  return resolve(value, theme)
}

/** AA for body text. Clerk paints real sentences with every one of these. */
const AA = 4.5

describe('the Clerk appearance names variables the installed SDK knows', () => {
  /**
   * The v4 names. Each was live in this file and each was silently discarded.
   * `satisfies` in the source now refuses them at compile time; this repeats it
   * at runtime so the failure names the customer-visible consequence.
   */
  const RENAMED: Record<string, string> = {
    colorText: 'colorForeground',
    colorTextSecondary: 'colorMutedForeground',
    colorInputBackground: 'colorInput',
    colorInputText: 'colorInputForeground',
    colorTextOnPrimaryBackground: 'colorPrimaryForeground',
  }

  for (const [dead, live] of Object.entries(RENAMED)) {
    it(`does not set ${dead}, which Clerk dropped in favour of ${live}`, () => {
      expect(vars).not.toHaveProperty(dead)
    })
  }

  /**
   * Clerk supplies a default for every one of these, and every default is
   * built for a white card. An absent key is therefore not a neutral absence,
   * it is a light-mode value shipped into dark.
   */
  const REQUIRED = [
    'colorNeutral',
    'colorForeground',
    'colorMutedForeground',
    'colorBackground',
    'colorInput',
    'colorInputForeground',
    'colorBorder',
  ]

  for (const name of REQUIRED) {
    it(`sets ${name} rather than inheriting Clerk's light default`, () => {
      expect(vars[name]).toMatch(/^var\(--[a-z0-9-]+\)$/)
    })
  }

  it('names tokens throughout and never a raw colour', () => {
    const raw = Object.entries(vars).filter(([, v]) => /#[0-9a-f]{3,8}\b|\brgba?\(/i.test(v))
    expect(raw).toEqual([])
  })
})

describe('every Clerk text pair clears AA, in both themes', () => {
  for (const theme of ['light', 'dark'] as const) {
    it(`${theme}: body text on the card`, () => {
      expect(
        ratio(paint('colorForeground', theme), paint('colorBackground', theme)),
      ).toBeGreaterThanOrEqual(AA)
    })

    /**
     * The account email under the workspace name, the "or" rule's label,
     * "Don't have an account?" and "Secured by Clerk" are all this pair.
     */
    it(`${theme}: secondary text on the card`, () => {
      expect(
        ratio(paint('colorMutedForeground', theme), paint('colorBackground', theme)),
      ).toBeGreaterThanOrEqual(AA)
    })

    it(`${theme}: what a customer types, on the field they type it in`, () => {
      expect(
        ratio(paint('colorInputForeground', theme), paint('colorInput', theme)),
      ).toBeGreaterThanOrEqual(AA)
    })

    /**
     * Clerk tints borders, dividers and its quietest text from `colorNeutral`
     * by alpha. Its default is black, so in dark every one of those landed on
     * near-black. The neutral has to sit on the far side of the card from the
     * card itself, which is what `--ink` is in each theme.
     */
    it(`${theme}: the neutral Clerk derives its shades from opposes the card`, () => {
      expect(
        ratio(paint('colorNeutral', theme), paint('colorBackground', theme)),
      ).toBeGreaterThanOrEqual(AA)
    })
  }
})

describe('the quiet chrome is still a real step', () => {
  for (const theme of ['light', 'dark'] as const) {
    it(`${theme}: a border is distinguishable from the card`, () => {
      expect(ratio(paint('colorBorder', theme), paint('colorBackground', theme))).toBeGreaterThan(
        1.02,
      )
    })

    it(`${theme}: the input well is distinguishable from the card`, () => {
      expect(ratio(paint('colorInput', theme), paint('colorBackground', theme))).toBeGreaterThan(
        1.02,
      )
    })
  }
})
