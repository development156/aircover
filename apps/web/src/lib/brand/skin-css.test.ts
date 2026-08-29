import { describe, it, expect } from 'vitest'

import { skinCss, skinIsGlobal, skinVarNames, SKIN_SCOPE } from './skin-css'
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
   * THE RULE THAT KEEPS IT SAFE. Design System §2: seven tokens are themeable
   * and nothing else. A workspace whose brand is red must not have its delete
   * confirmation blend into its buttons, so danger stays crimson and every
   * neutral stays fixed.
   */
  it('emits the seven themeable tokens and no others', () => {
    expect(skinVarNames(TEAL).sort()).toEqual(
      ['--acc', '--p', '--pfg', '--pstrong', '--t100', '--t300', '--t50'].sort(),
    )
  })

  it('never DEFINES a neutral or a semantic token', () => {
    const defined = skinVarNames(TEAL)

    for (const forbidden of [
      '--danger',
      '--ok',
      '--warn',
      '--ink',
      '--surface',
      '--canvas',
      '--line',
    ]) {
      expect(defined, `${forbidden} is fixed by canon and must never be themed`).not.toContain(
        forbidden,
      )
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
   * ── THE RULING THIS FILE NOW EXISTS TO HOLD ───────────────────────────────
   * Founder's ruling, 2026-08-29: "Day/Night Theme Toggle should apply Sahoda
   * Brand Theme. Only the Left Brand Logo should apply Brand Skin."
   *
   * Brand Skin shipped as `:root:root` for a few hours and repainted every
   * button, link and tint in the product from an automatic read of one PNG. A
   * grey-and-white logo made the whole interface washed out. The regression is
   * ONE CHARACTER away at all times — `:root` compiles, renders, and silently
   * puts it back — so the guard names the failure rather than the rule text.
   */
  it('paints only what carries the scope, never the whole document', () => {
    const css = skinCss(TEAL)

    expect(css.startsWith(`${SKIN_SCOPE}{`)).toBe(true)
    expect(skinIsGlobal(css)).toBe(false)
  })

  /** And the guard itself is worth nothing if it cannot see the defect. */
  it('recognises the global rule it exists to forbid', () => {
    expect(skinIsGlobal(skinCss(TEAL, ':root:root'))).toBe(true)
    expect(skinIsGlobal(skinCss(TEAL, 'html'))).toBe(true)
  })

  /**
   * The attribute selector is 0,1,0 and `tokens.css`'s bare `:root` is 0,0,1, so
   * the brand wins inside the mark without an `!important` and without depending
   * on where a build puts a stylesheet.
   */
  it('names an attribute, which is what outranks the default palette', () => {
    expect(SKIN_SCOPE).toBe('[data-brand-skin]')
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
