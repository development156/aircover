import { describe, it, expect } from 'vitest'

import {
  nextSkinState,
  skinStateFromStored,
  skinToggleLabel,
  SKIN_ATTR,
  SKIN_KEY,
} from './skin-preference'

/**
 * The switch between the customer's colours and ours.
 *
 * Small and pure on purpose: it is the one decision Brand Skin turns on, and a
 * decision inside a click handler is a decision a browser is the only witness to.
 */
describe('the brand skin switch', () => {
  /** Off is the safe state, so every unrecognised value lands there. */
  it('is off unless the stored value says otherwise, exactly', () => {
    expect(skinStateFromStored('on')).toBe('on')

    for (const stored of [null, undefined, '', 'off', 'ON', 'true', '1', 'dark']) {
      expect(skinStateFromStored(stored), `${String(stored)} must not turn the brand on`).toBe(
        'off',
      )
    }
  })

  it('goes back and forth, which is the whole ruling', () => {
    expect(nextSkinState('off')).toBe('on')
    expect(nextSkinState('on')).toBe('off')
    expect(nextSkinState(nextSkinState('off'))).toBe('off')
  })

  /**
   * The label names the DESTINATION, like the moon and sun beside it. A control
   * labelled with its current state reads as a claim rather than as a button.
   */
  it('labels where the press goes, not where it is', () => {
    expect(skinToggleLabel('off')).toMatch(/your brand/i)
    expect(skinToggleLabel('on')).toMatch(/sahoda/i)
  })

  /**
   * ── THE SEPARATION, ASSERTED ───────────────────────────────────────────────
   * Founder's ruling, 2026-08-29: the moon and sun own light and dark, this owns
   * the brand, and neither touches the other. The failure this forbids is one
   * key or one attribute doing both jobs, which would make the two switches
   * fight and is how the ruling came to be needed.
   */
  it('does not share a key or an attribute with the theme switch', () => {
    expect(SKIN_KEY).not.toBe('sahoda-theme')
    expect(SKIN_ATTR).not.toBe('data-theme')
    expect(skinToggleLabel('on')).not.toMatch(/light|dark/i)
    expect(skinToggleLabel('off')).not.toMatch(/light|dark/i)
  })
})
