import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

/**
 * THE DARK SURFACE LADDER HAS TO HAVE RUNGS.
 *
 * ── THE DEFECT ───────────────────────────────────────────────────────────────
 * `--surface-2` shipped as `#17171a` in dark, which is `--surface` exactly. Not
 * close — identical. Every element that lifts itself off a card with a `bg-s2`
 * fill was painting the card's own colour, so it separated nothing:
 *
 *                       light        dark, as shipped
 *   surface -> s2       1.044:1      1.000:1      nothing at all
 *   s2 -> surface-3     1.054:1      1.089:1      a double step
 *
 * MEASURED across all forty routes in dark on 2026-08-22: 117 of 120 frames
 * carried at least one edgeless fill that was invisible, the commonest being
 * the workspace chip in the topbar — which is on every page in the product.
 * The pattern `apps/web/CLAUDE.md` prescribes for dark accent-on-tint,
 * `bg-tint-50 text-accent dark:bg-s2`, is what routed them all into it.
 *
 * ── WHY A TEST AND NOT A COMMENT ─────────────────────────────────────────────
 * Nothing failed when the two were equal. Typecheck passed, lint passed, the
 * design-lint ratchet passed, and every screenshot looked plausible because a
 * missing 4% fill reads as a design choice. The only thing that can catch a
 * rung going missing is arithmetic on the shipped file.
 *
 * ── AND WHY IT GRADES THE GAP, NOT THE VALUE ─────────────────────────────────
 * Pinning `#1b1b1f` would fail the day someone legitimately retunes the theme.
 * What must not change is that each rung is a real step and that dark's steps
 * stay in the neighbourhood of light's — which is the same standard
 * `scripts/design/dark-ladder.mjs` applied to the ink ladder.
 */

const require_ = createRequire(import.meta.url)
const TOKENS = readFileSync(require_.resolve('@sahoda/shared/tokens.css'), 'utf8')
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

function linear(v: number): number {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

function luminance(hex: string): number {
  const h = hex.replace('#', '').trim()
  if (h.length !== 6) throw new Error(`the surface ladder must be plain hex, got ${hex}`)
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

/** A step small enough to be chrome and large enough to exist. */
const FLOOR = 1.02

describe('every rung of the surface ladder is a real step, in both themes', () => {
  for (const theme of ['light', 'dark'] as const) {
    it(`${theme}: --surface and --surface-2 are not the same colour`, () => {
      const step = ratio(token('--surface', theme), token('--surface-2', theme))
      console.log(`[surface ladder] ${theme} surface -> surface-2 = ${step.toFixed(3)}:1`)
      expect(
        step,
        'a fill that equals the surface behind it separates nothing — this is the ' +
          'defect that made the topbar workspace chip invisible on every dark page',
      ).toBeGreaterThan(FLOOR)
    })

    it(`${theme}: --surface-2 and --surface-3 are not the same colour`, () => {
      const step = ratio(token('--surface-2', theme), token('--surface-3', theme))
      console.log(`[surface ladder] ${theme} surface-2 -> surface-3 = ${step.toFixed(3)}:1`)
      expect(step).toBeGreaterThan(FLOOR)
    })
  }

  it('dark spaces its rungs roughly the way light does', () => {
    const lightA = ratio(token('--surface', 'light'), token('--surface-2', 'light'))
    const lightB = ratio(token('--surface-2', 'light'), token('--surface-3', 'light'))
    const darkA = ratio(token('--surface', 'dark'), token('--surface-2', 'dark'))
    const darkB = ratio(token('--surface-2', 'dark'), token('--surface-3', 'dark'))
    console.log(
      `[surface ladder] light ${lightA.toFixed(3)} / ${lightB.toFixed(3)}  ` +
        `dark ${darkA.toFixed(3)} / ${darkB.toFixed(3)}`,
    )
    // Not equality: sRGB is compressed near black and dark will never match
    // light exactly. What must hold is that neither dark step collapses to
    // nothing while the other carries a double.
    expect(Math.max(darkA, darkB) / Math.min(darkA, darkB)).toBeLessThan(1.5)
  })
})
