import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * "Inverse" means inverted RELATIVE TO THE PAGE, in both themes.
 *
 * ── THE DEFECT THIS EXISTS FOR ───────────────────────────────────────────────
 * MEASURED 2026-09-04 on the running app: `[data-surface='inverse']` and
 * `[data-theme='dark']` declared the SAME six values. So in dark mode a panel
 * asking to stand out got painted the colour of the page behind it — the Studio
 * composer's `bg-surface` resolved to #171717 on a #0d0d0d ground, a 1.30:1
 * step. Three elements on one screen (composer, settings tray, result bar) went
 * flat at once, so the screen lost its structure rather than one card.
 *
 * ── WHY EVERY EXISTING GUARD PASSED ──────────────────────────────────────────
 * `own-medicine.test.ts` grades this scope's tokens against EACH OTHER: ink on
 * its surface, the hover fill on its own ground. Every one of those assertions
 * was correct, because INTERNALLY the scope is a well-formed dark ladder. What
 * nothing compared was the scope against the ground it lands on — and a scope
 * is only "inverse" in relation to something else, so a guard that never looks
 * outside it cannot check the one thing the name promises.
 *
 * That is the same shape as two other defects found the same day: a CI guard
 * that checked three secret names while the step below needed six, and a test
 * asserting a workflow MENTIONS a variable while the guard CHECKING it was
 * short. Grading a thing against itself is the recurring blind spot.
 *
 * ── WHAT THIS CANNOT SEE ─────────────────────────────────────────────────────
 * It reads declared token values out of the stylesheet. It does not render, so
 * it cannot see a component that hardcodes a fill instead of using the scope,
 * an element that lands on a ground no token names, or a nested inverse inside
 * an inverse. It checks that the SCOPE inverts, not that every use of it does.
 */

const TOKENS = readFileSync(
  resolve(import.meta.dirname, '../../../../../packages/shared/tokens.css'),
  'utf8',
)

/**
 * The declarations inside one top-level rule, by its exact selector text, or ''
 * when the rule is absent.
 *
 * IT RETURNS EMPTY RATHER THAN THROWING, and that is the whole point. The first
 * version threw at module scope, so deleting the rule under test made vitest
 * report `Test Files 1 failed` with `Tests  no tests` — a stack trace where a
 * named failure belongs, and the exact shape this repository already has a rule
 * about: a suite that ran nothing reads as passing to anyone skimming. Caught by
 * mutating the guard rather than by reading it.
 */
function blockFor(selector: string): string {
  const at = TOKENS.indexOf(selector)
  if (at < 0) return ''
  const open = TOKENS.indexOf('{', at)
  const close = TOKENS.indexOf('\n}', open)
  return TOKENS.slice(open + 1, close)
}

function tokenIn(block: string, name: string): string | null {
  const m = new RegExp(`^\\s*${name}\\s*:\\s*([^;]+);`, 'm').exec(block)
  return m ? m[1]!.trim() : null
}

/** sRGB relative luminance, Rec.709. Hex only — the ladder tokens are all hex. */
function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

const LIGHT_PAGE = blockFor(':root {')
const DARK_PAGE = blockFor("[data-theme='dark'],")
const INVERSE_ON_LIGHT = blockFor("[data-surface='inverse'] {")
const INVERSE_ON_DARK = blockFor("[data-theme='dark'] [data-surface='inverse'],")

/** The four rungs every scope must declare, plus the ink that sits on them. */
const LADDER = ['--canvas', '--surface', '--surface-2', '--surface-3'] as const

describe('the inverse scope is inverse in BOTH themes', () => {
  it('has a rule for each theme at all', () => {
    // THE MUTATION THIS ANSWERS: deleting the dark-mode rule outright, which is
    // the state the app actually shipped in. Asserted by name and first, so the
    // failure says which rule is gone instead of throwing a parse error.
    expect(INVERSE_ON_LIGHT, "tokens.css has no `[data-surface='inverse']` rule").not.toBe('')
    expect(
      INVERSE_ON_DARK,
      "tokens.css has no `[data-theme='dark'] [data-surface='inverse']` rule. Without it " +
        'the inverse scope is dark in a dark document: a panel painted the colour of the ' +
        'page behind it, which is what shipped and what a person had to spot by eye.',
    ).not.toBe('')
  })

  it('declares a full ladder in each theme, not a one-colour patch', () => {
    for (const [name, block] of [
      ['inverse on light', INVERSE_ON_LIGHT],
      ['inverse on dark', INVERSE_ON_DARK],
    ] as const) {
      for (const rung of LADDER) {
        expect(tokenIn(block, rung), `${name} is missing ${rung}`).not.toBeNull()
      }
      expect(tokenIn(block, '--ink'), `${name} is missing --ink`).not.toBeNull()
    }
  })

  it.each([
    ['light', LIGHT_PAGE, INVERSE_ON_LIGHT],
    ['dark', DARK_PAGE, INVERSE_ON_DARK],
  ])('in %s the panel separates from the page it sits on', (_theme, page, panel) => {
    const pageSurface = tokenIn(page, '--surface')
    const panelSurface = tokenIn(panel, '--surface')
    expect(pageSurface, 'the page rule declares no --surface').not.toBeNull()
    expect(panelSurface, 'the inverse rule for this theme is missing').not.toBeNull()
    if (pageSurface === null || panelSurface === null) return

    // THE ASSERTION THE OLD GUARDS COULD NOT MAKE. Not "is the panel legible
    // inside itself" but "can you see the panel at all". 1.30:1 was shipping.
    expect(
      contrast(panelSurface, pageSurface),
      `the inverse panel's surface reads ${contrast(panelSurface, pageSurface).toFixed(2)}:1 ` +
        `against the page's own surface. That is a panel nobody can see. The scope must ` +
        `invert relative to the DOCUMENT, not be dark in both themes.`,
    ).toBeGreaterThan(3)
  })

  it.each([
    ['light', LIGHT_PAGE, INVERSE_ON_LIGHT],
    ['dark', DARK_PAGE, INVERSE_ON_DARK],
  ])('in %s the panel goes the way the page does not', (_theme, page, panel) => {
    const pageValue = tokenIn(page, '--surface')
    const panelValue = tokenIn(panel, '--surface')
    expect(panelValue, 'the inverse rule for this theme is missing').not.toBeNull()
    if (pageValue === null || panelValue === null) return
    const pageIsDark = luminance(pageValue) < 0.5
    const panelIsDark = luminance(panelValue) < 0.5

    // Stated as a direction rather than a value, so the palette can be retuned
    // freely and the guarantee survives. A dark panel on a dark page and a
    // light panel on a light page are the same defect.
    expect(
      panelIsDark,
      `the page and the inverse panel are both ${pageIsDark ? 'dark' : 'light'}. ` +
        `"Inverse" is a relationship, not a colour.`,
    ).toBe(!pageIsDark)
  })

  it.each([
    ['light', INVERSE_ON_LIGHT],
    ['dark', INVERSE_ON_DARK],
  ])('in %s the ink inside the panel clears AA on the panel', (_theme, panel) => {
    const surface = tokenIn(panel, '--surface')
    const ink = tokenIn(panel, '--ink')
    expect(surface, 'the inverse rule for this theme is missing').not.toBeNull()
    expect(ink, 'the inverse rule declares no --ink').not.toBeNull()
    if (surface === null || ink === null) return
    expect(contrast(ink, surface)).toBeGreaterThanOrEqual(4.5)
  })

  it.each([
    ['light', INVERSE_ON_LIGHT],
    ['dark', INVERSE_ON_DARK],
  ])('in %s the primary hover fill still moves AWAY from the panel', (_theme, panel) => {
    // The rule --pstrong encodes, checked in the scope that now has two cases.
    // A hover that moves TOWARDS the ground makes the loudest control quieter at
    // the moment somebody reaches for it.
    const surface = tokenIn(panel, '--surface')
    const strong = tokenIn(panel, '--pstrong')
    const label = tokenIn(panel, '--pstrong-fg')
    expect(surface, 'the inverse rule for this theme is missing').not.toBeNull()
    expect(strong, 'the scope declares no --pstrong').not.toBeNull()
    expect(label, 'the scope declares no --pstrong-fg').not.toBeNull()
    if (surface === null || strong === null || label === null) return

    // Read from the scope, never written as a literal — design-lint refuses a
    // raw hex here and is right to: a value typed into a test rots silently the
    // day the palette moves. The dark rule does not re-declare `--acc`, so it
    // inherits the base inverse scope's on the same element; that fallback is
    // the inheritance, spelled out rather than assumed.
    const accent = tokenIn(panel, '--acc') ?? tokenIn(INVERSE_ON_LIGHT, '--acc')
    expect(accent, 'no --acc reachable for this scope').not.toBeNull()
    if (accent === null) return
    const resting = contrast(accent, surface)
    expect(
      contrast(strong, surface),
      `the hover fill reads ${contrast(strong, surface).toFixed(2)}:1 on this panel ` +
        `against a resting ${resting.toFixed(2)}:1 — it gets quieter when reached for`,
    ).toBeGreaterThan(resting)
    expect(contrast(label, strong)).toBeGreaterThanOrEqual(4.5)
  })
})
