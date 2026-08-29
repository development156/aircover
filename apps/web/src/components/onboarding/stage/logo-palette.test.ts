import { describe, it, expect } from 'vitest'

import { brandSkinVars } from '@/lib/brand/brand-theme'
import { DEFAULT_DATA, signalIds } from './store'

/**
 * What we ask for must be what we keep, and what we keep must be what we use.
 *
 * ── THE DEFECT THIS REPLACES ────────────────────────────────────────────────
 * Onboarding asked for three colours in hex fields. Two reached the theme; the
 * third, Background, reached nothing at all, because Brand Skin themes seven
 * tokens and the surface is not among them (Design System §2). It still counted
 * as a signal, so moving it raised the confidence meter for an answer the
 * product discarded.
 *
 * The fix was not to delete one field. The pickers went, and a logo upload took
 * their place: a shop owner knows their logo and does not know their hex codes.
 * These are the guards that keep the new shape honest, in the same two places
 * the old one failed.
 */

describe('the colours onboarding takes from a logo', () => {
  /**
   * `extractPalette` returns colours most frequent first, and `brandSkinVars`
   * reads `[0]` as the primary and `[1]` as the accent. If those two ever stop
   * agreeing, the colours a person watched Sahoda find are not the colours their
   * workspace gets.
   */
  it('feeds the first two extracted colours into the theme', () => {
    const palette = ['oklch(0.5 0.2 20)', 'oklch(0.6 0.2 140)']
    const base = brandSkinVars(palette)

    for (let i = 0; i < 2; i++) {
      const moved = [...palette]
      moved[i] = 'oklch(0.55 0.18 320)'
      expect(
        JSON.stringify(brandSkinVars(moved)),
        `extracted colour ${i} changed no theme token, so it goes nowhere`,
      ).not.toBe(JSON.stringify(base))
    }
  })

  /**
   * A logo Sahoda could read nothing from must count as nothing. Counting the
   * CHOOSING would be the same overstatement the old picker made: the number on
   * the result screen is a claim about how much Sahoda was told.
   */
  it('counts a colour signal only when colours actually came out', () => {
    expect(signalIds({ ...DEFAULT_DATA, palette: [] })).not.toContain('logo')
    expect(signalIds({ ...DEFAULT_DATA, palette: ['oklch(0.5 0.2 20)'] })).toContain('logo')
  })

  /**
   * Nothing chosen is not a theme of nothing. An empty palette must leave the
   * product free to fall back to the colours the door read off the website,
   * which is what `use-build.ts` does.
   */
  it('treats an empty palette as no answer rather than as black', () => {
    expect(signalIds({ ...DEFAULT_DATA, palette: [] }).filter((id) => id === 'logo')).toHaveLength(
      0,
    )
  })
})
