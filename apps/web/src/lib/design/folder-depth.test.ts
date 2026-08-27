import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

/**
 * A FOLDER'S LID MUST BE LIGHTER THAN ITS BODY, IN BOTH THEMES.
 *
 * ── THE DEFECT THIS EXISTS FOR ───────────────────────────────────────────────
 * `asset-folders.tsx` draws a physical folder: a BACK panel on `--surface-2`
 * and a FRONT panel that overlaps its lower two thirds. The front carried
 * `bg-surface` with no `dark:` variant, and its own header claimed "the two
 * steps hold in BOTH themes".
 *
 * They did not. `--surface` is the LIGHTEST rung in light and the DARKEST in
 * dark:
 *
 *   light  surface #ffffff · surface-2 #f2f2f3 · surface-3 #e9e9eb
 *   dark   surface #171717 · surface-2 #212121 · surface-3 #292929
 *
 * So in dark the lid sat one step BEHIND the body and the folder read as a pale
 * slab with a dark plate stuck on it.
 *
 * ── WHY NO EXISTING TEST COULD SEE IT ────────────────────────────────────────
 * `tonal-ladder.test.ts` asserts adjacent rungs clear a 1.03:1 floor. The broken
 * pair measured 1.113:1 and the fixed pair measures 1.107:1 — BOTH clear it, and
 * the broken one clears it by MORE. A contrast ratio is unsigned, so a gap test
 * is blind to which side is lighter. This asserts the ORDER instead.
 */

const require_ = createRequire(import.meta.url)
const TOKENS = readFileSync(require_.resolve('@sahoda/shared/tokens.css'), 'utf8')

/** Pull `--name: #value;` out of one scope of the real token file. */
function token(name: string, scope: 'light' | 'dark'): string {
  // `:root {` opens light; the dark block opens at the first `data-theme='dark'`.
  const darkAt = TOKENS.indexOf("[data-theme='dark']")
  const slice = scope === 'light' ? TOKENS.slice(0, darkAt) : TOKENS.slice(darkAt)
  const match = slice.match(new RegExp(`^\\s*${name}:\\s*(#[0-9a-fA-F]{6});`, 'm'))
  if (!match) throw new Error(`tokens.css has no ${name} in ${scope}`)
  return match[1]!
}

const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

/** Relative luminance. Higher = lighter. The SIGN is the whole point here. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!)
}

describe('the asset folder reads as a lid over a body', () => {
  it.each(['light', 'dark'] as const)(
    'in %s, the front panel is LIGHTER than the back it overlaps',
    (scope) => {
      const back = token('--surface-2', scope)
      // What the component paints on the front: --surface in light, --surface-3
      // in dark. Spelled out rather than parsed from the TSX, because a class
      // scanner would pass on a class Tailwind never generated.
      const front = scope === 'light' ? token('--surface', scope) : token('--surface-3', scope)

      expect(
        luminance(front),
        `${scope}: front ${front} must be lighter than back ${back} — a folder lid ` +
          `that recedes behind its own body is the defect this guards. Note the ` +
          `CONTRAST between them is fine either way; only the order is wrong.`,
      ).toBeGreaterThan(luminance(back))
    },
  )

  it('proves the detector by measuring the pair that shipped broken', () => {
    // The exact values `bg-surface` gave the front in dark, before the fix.
    const brokenFront = token('--surface', 'dark')
    const back = token('--surface-2', 'dark')

    expect(luminance(brokenFront)).toBeLessThan(luminance(back))
    // …and it cleared the ladder floor while being wrong, which is why a gap
    // test could not catch it.
    const [hi, lo] = [luminance(back), luminance(brokenFront)]
    expect((hi + 0.05) / (lo + 0.05)).toBeGreaterThan(1.03)
  })
})
