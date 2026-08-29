import { describe, it, expect } from 'vitest'

import { THEME_SCRIPT_SOURCE } from './theme-script'
import { SKIN_ATTR, SKIN_KEY } from '@/lib/brand/skin-preference'

/**
 * The inline script that decides both switches before the first paint.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 * The script cannot import: it is a string emitted into <head> so it runs before
 * any module does. So the storage key and the attribute name exist twice, and
 * two copies of one name is exactly the thing that drifts. A rename on the
 * module side breaks nothing at build time and nothing at runtime either — the
 * script keeps writing the old attribute, the toggle keeps writing the new one,
 * and Brand Skin silently stops surviving a reload.
 *
 * These assert the copies agree, in the only way available: by looking.
 */
describe('the pre-paint script', () => {
  it('reads the same storage key the toggle writes', () => {
    expect(THEME_SCRIPT_SOURCE).toContain(`'${SKIN_KEY}'`)
  })

  it('writes the same attribute the brand rule is scoped to', () => {
    expect(THEME_SCRIPT_SOURCE).toContain(`'${SKIN_ATTR}'`)
  })

  /**
   * THE TWO SWITCHES STAY SEPARATE, and the script is where they could most
   * easily be joined by accident: it is the one place that touches both. A
   * script that wrote the brand attribute from the theme value, or the reverse,
   * would recreate the exact defect this whole design exists to end.
   */
  it('decides the theme from the theme key and the brand from the brand key', () => {
    expect(THEME_SCRIPT_SOURCE).toContain("localStorage.getItem('sahoda-theme')")
    expect(THEME_SCRIPT_SOURCE).toContain(`localStorage.getItem('${SKIN_KEY}')`)
  })

  /** Off is the default, so only the exact opt-in value turns it on. */
  it('turns the brand on for nothing but the explicit value', () => {
    expect(THEME_SCRIPT_SOURCE).toContain(`getItem('${SKIN_KEY}')==='on'`)
  })

  /**
   * The whole point of an inline script is that it runs before paint. A theme
   * applied after hydration is a theme the user watches arrive, and a BRAND
   * applied after hydration is worse: the product flips colour on every
   * navigation to a fresh document.
   */
  it('is self-executing, with nothing interpolated into it', () => {
    expect(THEME_SCRIPT_SOURCE.startsWith('(function(){')).toBe(true)
    expect(THEME_SCRIPT_SOURCE).not.toContain('${')
  })
})
