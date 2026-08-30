import { describe, it, expect } from 'vitest'

import { skinCss, skinIsUnconditional, skinVarNames, SKIN_SCOPE } from './skin-css'
import { SKIN_ATTR } from './skin-preference'
import type { ThemeTokens } from '@sahoda/shared'

/**
 * Brand Skin, at the point where it finally reaches a screen.
 *
 * The whole mechanism existed for months with no caller: extraction, the
 * Readability Guard, the derivation, the stored rows and the reader. A workspace
 * could upload a logo and watch the product stay Sahoda orange for ever. These
 * guard the connection, and the rule that keeps it from doing harm.
 */

const theme = (primary: string, accent: string): ThemeTokens =>
  ({
    primary,
    primaryFg: 'oklch(1 0 0)',
    secondary: 'oklch(0.2 0 0)',
    accent,
    surface: ['oklch(1 0 0)', 'oklch(0.99 0 0)', 'oklch(0.98 0 0)', 'oklch(0.9 0 0)'],
    text: { hi: 'oklch(0.2 0 0)', mid: 'oklch(0.5 0 0)', low: 'oklch(0.7 0 0)' },
    border: 'oklch(0.9 0 0)',
    success: 'oklch(0.6 0.15 145)',
    warning: 'oklch(0.75 0.15 80)',
    danger: 'oklch(0.55 0.2 25)',
    radius: '24px',
    fontHeading: 'Plus Jakarta Sans',
    fontBody: 'Plus Jakarta Sans',
  }) as ThemeTokens

const TEAL = theme('oklch(0.55 0.12 195)', 'oklch(0.6 0.14 190)')

describe('skinCss', () => {
  /**
   * The assertion names the customer's hue rather than ours, deliberately: the
   * design lint forbids a raw hex anywhere under `apps/web/src`, including in a
   * test asserting that the hex is absent, and it is right to. Checking that the
   * emitted primary carries the workspace's own hue is the stronger claim
   * anyway — "not orange" would pass on any colour at all.
   */
  it('paints the workspace brand rather than ours', () => {
    const css = skinCss(TEAL)

    expect(css).toContain('--p:')
    // 195 is the teal hue this theme was built with; the guard may move its
    // lightness for contrast but must never repaint it in another hue.
    expect(css).toMatch(/--p:oklch\([^)]*19[0-9]/)
  })

  /**
   * ── SEVEN BECAME TWELVE, AND THE FIVE ARE NAMED ───────────────────────────
   * Founder's ruling, 2026-08-30, unfreezing the NEUTRALS in Design System §2
   * and nothing else. The seven brand tokens reach under 0.5% of the pixels on
   * any screen — two guards hold them there deliberately — so Brand Skin
   * recoloured one button and his verdict was "a pathetic failed attempt".
   *
   * The list is exhaustive on purpose. A token added here without a ruling is
   * the drift this assertion exists to catch, and the count in `skin-css.ts`'s
   * header moves in the same commit as this line.
   */
  it('emits exactly the twelve tokens the rulings allow', () => {
    expect(skinVarNames(TEAL).sort()).toEqual(
      [
        '--acc',
        '--p',
        '--pfg',
        '--pstrong',
        '--t100',
        '--t300',
        '--t50',
        '--canvas',
        '--surface',
        '--surface-2',
        '--surface-3',
        '--line',
      ].sort(),
    )
  })

  /**
   * ── THE HALF OF §2 THAT WAS ALWAYS LOAD BEARING ───────────────────────────
   * The neutrals were unfrozen. The SEMANTICS were not, and never will be by
   * this route: a workspace whose brand is red must not have its delete
   * confirmation blend into its buttons. `--ink` stays fixed for the same
   * reason — it is what every tinted surface is read against, so theming it
   * would move both sides of every pair at once.
   */
  it('never DEFINES a semantic token, whatever the brand', () => {
    for (const surface of ['light', 'dark'] as const) {
      const defined = skinVarNames(TEAL, surface)

      for (const forbidden of ['--danger', '--ok', '--warn', '--ink', '--ink-mute']) {
        expect(defined, `${forbidden} is fixed by canon and must never be themed`).not.toContain(
          forbidden,
        )
      }
    }
  })

  /**
   * REFERENCING a fixed token is not theming it, and the distinction is the
   * point: the guarded foreground resolves to `var(--ink)` when ink reads better
   * on the brand colour than white does. A guard that forbade the substring
   * would forbid the correct answer.
   */
  it('may point a themeable token at a fixed one', () => {
    const light = theme('oklch(0.9 0.05 90)', 'oklch(0.9 0.05 90)')
    expect(skinCss(light)).toContain('var(--ink)')
    expect(skinVarNames(light)).not.toContain('--ink')
  })

  /**
   * A workspace with no theme must emit NOTHING, so the defaults stand as the
   * absence of a rule rather than as a second rule overriding the first.
   */
  it('emits nothing at all when there is no theme', () => {
    expect(skinCss(null)).toBe('')
    expect(skinVarNames(null)).toEqual([])
  })

  /**
   * ── THE RULING THIS FILE EXISTS TO HOLD ───────────────────────────────────
   * Founder's ruling, 2026-08-29: Brand Skin is separate from the platform theme
   * and switches back and forth, "because it will give the user more options if
   * Brand Skin breaks the readability."
   *
   * Two shipped attempts got it wrong in opposite directions on the same day.
   * `:root:root` repainted everything from an automatic read of one PNG with no
   * way out. Scoping to the logo mark painted nothing, so there was nothing to
   * switch. The rule must paint the DOCUMENT and be GATED on the attribute, and
   * dropping the attribute leaves `:root`, which compiles and renders and
   * silently restores attempt one.
   */
  it('paints the document, and only while the switch is on', () => {
    const css = skinCss(TEAL)

    expect(css.startsWith(`${SKIN_SCOPE}{`)).toBe(true)
    expect(SKIN_SCOPE).toContain(SKIN_ATTR)
    expect(skinIsUnconditional(css)).toBe(false)
  })

  /** And the guard itself is worth nothing if it cannot see the defect. */
  it('recognises the ungated rule it exists to forbid', () => {
    expect(skinIsUnconditional(skinCss(TEAL, ':root:root'))).toBe(true)
    expect(skinIsUnconditional(skinCss(TEAL, 'html'))).toBe(true)
  })

  /**
   * ── THE INVISIBLE CARD, WHICH IS WHY THIS FILE GAINED A DARK HALF ─────────
   * Founder's report, 2026-08-29, with a screenshot of the wallet: the selected
   * plan card was a near-white fill carrying near-white text.
   *
   * `brand-theme.ts` graded everything against white, so `--t50` came back at
   * lightness 0.97 whatever the theme — and in dark, `--ink` is `#ffffff`. A
   * near-white fill under white text is an invisible card, and no component was
   * at fault: the derivation answered a question about a light surface and its
   * answer was applied to a dark one.
   *
   * So the tints in the dark rule must actually be DARK. Asserting the lightness
   * is asserting the defect, which a "the two strings differ" check would not.
   */
  it('paints dark tints on the dark theme, not near-white ones', () => {
    const dark = skinCss(TEAL).split(`${SKIN_SCOPE}[data-theme='dark']`)[1] ?? ''

    for (const token of ['--t50', '--t100'] as const) {
      const lightness = Number(new RegExp(`${token}:oklch\\(([0-9.]+)`).exec(dark)?.[1])
      expect(lightness, `${token} must not be a near-white fill in dark`).toBeLessThan(0.5)
    }
  })

  /**
   * AND IT WINS BY SPECIFICITY, NOT BY LUCK. `:root[data-brand-skin='on']` is
   * (0,1,1) and so is `tokens.css`'s `:root[data-theme='dark']` — a tie, broken
   * by document order, and this style is inlined AFTER the stylesheet. That is
   * how light-only brand values came to beat the dark block, which is what "the
   * day/night toggle is getting applied on the Brand Skin" described. Carrying
   * both attributes makes the dark rule (0,2,1) and settles it outright.
   */
  it('gives the dark rule both attributes, so it outranks the dark block', () => {
    const css = skinCss(TEAL)
    const darkSelector = `${SKIN_SCOPE}[data-theme='dark']`

    expect(css).toContain(darkSelector)
    // And AFTER the light rule, so the two are never the same rule by accident.
    expect(css.indexOf(darkSelector)).toBeGreaterThan(css.indexOf(`${SKIN_SCOPE}{`))
  })

  /**
   * THE SEPARATION SURVIVES. Reading `data-theme` is not owning it: the skin
   * still never SETS the theme and still never touches a neutral, so the moon
   * and sun remain the only thing that decides light against dark. What changed
   * is that the brand now answers the question per surface instead of assuming
   * one.
   */
  it('reads the theme without defining anything the theme owns', () => {
    for (const surface of ['light', 'dark'] as const) {
      // Same token SET on both surfaces; only the values differ. A surface that
      // emitted an extra key would be a rule the other theme cannot undo.
      expect(skinVarNames(TEAL, surface).sort()).toEqual(skinVarNames(TEAL, 'light').sort())
      expect(skinVarNames(TEAL, surface)).not.toContain('--ink')
    }
  })

  /**
   * The guard runs on every render, not once at upload. A theme stored under an
   * older guard is corrected by today's, rather than carrying an old ruling
   * about contrast for ever. A near-white brand is the case that proves it: the
   * foreground must not come back as white on white.
   */
  it('re-guards a stored theme instead of replaying it', () => {
    const nearWhite = theme('oklch(0.97 0.02 90)', 'oklch(0.97 0.02 90)')
    const css = skinCss(nearWhite)

    expect(css).toContain('--pfg:')
    expect(css).not.toContain('--pfg:white')
  })

  it('produces different css for different brands', () => {
    const red = theme('oklch(0.55 0.2 25)', 'oklch(0.6 0.2 25)')
    expect(skinCss(TEAL)).not.toBe(skinCss(red))
  })
})
