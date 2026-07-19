// ThemeTokens -> the seven CSS custom properties a Brand Skin overrides
// (Design System §2). Two facts shape this file:
//
//   1. ThemeTokens is LOSSY against the CSS layer — it has no field for
//      --pstrong/--t50/--t100/--t300 — so those are re-derived from the guarded
//      primary with the formulas ported from apps/web/src/lib/brand/brand-theme.ts.
//   2. workspace_themes is NEVER seeded (the seed migration has zero rows), so
//      `themeCss(null)` is the path most renders take, not an edge case.
//
// EXACTLY SEVEN vars are themeable (--p --pfg --pstrong --acc --t50 --t100 --t300).
// Neutrals (--ink --bg --s1 --line --muted) and every semantic (--success --warning
// --danger; danger stays crimson, never brand orange) are FIXED and MUST NOT appear
// in this override. tokens.primaryFg, secondary, surface, text, border, the semantics,
// radius, fontHeading and fontBody are DELIBERATELY NOT consumed here — the contract is
// holding, not a bug. --pfg comes from the Readability Guard, never from stored primaryFg.
//
// SECURITY: ThemeTokens' ColorToken is a bare z.string(), so a jsonb column can
// hold anything — 'oklch(0.5 0.1 20); } body{display:none' is a legal value. Every
// value emitted here is either machine-formatted by formatOklch (numeric fields only,
// structurally incapable of carrying ';', '}', '<', 'url(' or '</style>') or one of two
// hard-coded foreground literals. A token that fails the strict parse omits the WHOLE
// block rather than being written through — the input-side gate. The output-side gate
// (2026-07-19 amendment) then re-validates every value about to be emitted, so a future
// edit that weakened an input guard still cannot ship NaN/Infinity into a live stylesheet.

import type { ThemeTokens } from '@sahoda/shared'

import { formatOklch, parseOklch } from './oklch'
import { guardPrimaryForeground } from './readability'

export const BRAND_VAR_NAMES = [
  '--p',
  '--pfg',
  '--pstrong',
  '--acc',
  '--t50',
  '--t100',
  '--t300',
] as const

const PSTRONG_LIGHTNESS_DELTA = 0.1
const T50_LIGHTNESS = 0.97
const T50_MAX_CHROMA = 0.02
const T100_LIGHTNESS = 0.93
const T100_MAX_CHROMA = 0.05
const T300_LIGHTNESS = 0.78
const T300_MIN_CHROMA = 0.08
const T300_MAX_CHROMA = 0.16
const MIN_LIGHTNESS = 0

/** The two literals --pfg may legally be; both resolve against the inlined tokens.css. */
const FOREGROUND_LITERALS: ReadonlySet<string> = new Set<string>(['var(--ink)', 'white'])

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

/**
 * `null` ⇒ the theme is unusable and the caller omits the override block, leaving
 * the inlined tokens.css defaults in place.
 */
export const brandSkinVars = (tokens: ThemeTokens): Record<string, string> | null => {
  const parsedPrimary = parseOklch(tokens.primary)
  if (parsedPrimary === null) return null

  const guarded = guardPrimaryForeground(parsedPrimary)
  const { l, c, h } = guarded.primary

  // An unparseable accent reuses the guarded primary — a duller site beats a
  // broken declaration, and it is the only value already proven safe here.
  const accent = parseOklch(tokens.accent) ?? guarded.primary

  const tint = (lightness: number, chroma: number): string =>
    formatOklch({ l: lightness, c: chroma, h })

  return {
    '--p': formatOklch(guarded.primary),
    // NOT a colour: the literal 'var(--ink)' or 'white'. Valid only because
    // tokens.css, which defines --ink, is inlined into the same document.
    '--pfg': guarded.fg,
    '--pstrong': formatOklch({
      l: Math.max(MIN_LIGHTNESS, l - PSTRONG_LIGHTNESS_DELTA),
      c,
      h,
    }),
    '--acc': formatOklch(accent),
    '--t50': tint(T50_LIGHTNESS, Math.min(c, T50_MAX_CHROMA)),
    '--t100': tint(T100_LIGHTNESS, Math.min(c, T100_MAX_CHROMA)),
    '--t300': tint(T300_LIGHTNESS, clamp(c, T300_MIN_CHROMA, T300_MAX_CHROMA)),
  }
}

/**
 * The output-side validation gate (2026-07-19 amendment). A value is emittable only
 * if it is one of the two foreground literals OR round-trips through `parseOklch` —
 * which accepts only the anchored `oklch(L C H)` shape with all three components
 * finite. Reusing parseOklch here rather than forking a third regex means the gate
 * cannot drift from the parse the tints were built with.
 */
const isEmittable = (value: string | undefined): boolean =>
  value !== undefined && (FOREGROUND_LITERALS.has(value) || parseOklch(value) !== null)

/** `''` when there is no active theme (the common case) or the theme is unusable. */
export const themeCss = (tokens: ThemeTokens | null): string => {
  if (tokens === null) return ''

  const vars = brandSkinVars(tokens)
  if (vars === null) return ''

  // Re-validate what we are ABOUT TO EMIT, not only what we read. If any value is
  // not provably safe, omit the whole block — a themeless site is correct; a site
  // with NaN/Infinity or a stray `{` in its stylesheet is not.
  for (const name of BRAND_VAR_NAMES) {
    if (!isEmittable(vars[name])) return ''
  }

  const declarations = BRAND_VAR_NAMES.map((name) => `${name}:${vars[name]};`).join('')
  return `:root{${declarations}}`
}
