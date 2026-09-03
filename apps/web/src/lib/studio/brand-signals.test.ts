import { describe, expect, test } from 'vitest'

import { paletteSignal } from './brand-signals'

/**
 * THE PALETTE IS THE ONE BRAND FACT WITH NO CERTAINTY AVAILABLE.
 *
 * MEASURED: `workspace_themes.source` is a ROW-level 'default' | 'extracted' |
 * 'manual', and the reader this module uses, `activeThemeTokens`, returns
 * RESOLVED tokens that do not carry it. So from here a colour the owner chose
 * and a colour Sahoda pulled out of their logo are indistinguishable.
 *
 * The rule that follows is the whole file: colour is reported as a GUESS, never
 * as confirmed, because confirmed would be a certainty the reader cannot
 * support. These tests exist so that a later change which starts claiming
 * confirmed has to argue with them first.
 */
describe('paletteSignal', () => {
  // Deliberately not hex. `paletteSignal` passes colour strings through
  // untouched, so the fixture only has to be a string, and the design ratchet
  // forbids a raw hex anywhere in this app including its tests.
  const theme = { primary: 'brand-primary', secondary: 'brand-deep', accent: 'brand-accent' }

  test('the colours reach the prompt', () => {
    const signal = paletteSignal(theme)
    expect(signal?.value).toContain('brand-primary')
    expect(signal?.field).toBe('colours')
  })

  /** THE ONE THAT MATTERS. Colour can never claim to be confirmed from here. */
  test('colour is always a guess, because its certainty is not knowable here', () => {
    expect(paletteSignal(theme)?.certainty).toBe('guessed')
  })

  /**
   * No theme row is nothing to say. It is NOT the default palette dressed up as
   * a brand fact: Sahoda's defaults are Sahoda's, and sending them would paint
   * every workspace the same colours while the screen reported that the brand
   * had conditioned the picture.
   */
  test('no theme at all contributes no colour signal', () => {
    expect(paletteSignal(null)).toBeNull()
  })

  test('a theme with no usable colours is left out rather than sent as a blank', () => {
    expect(paletteSignal({ primary: '', secondary: '   ', accent: null })).toBeNull()
  })

  test('a partly filled theme sends only what it has', () => {
    expect(paletteSignal({ primary: 'brand-primary' })?.value).toBe('brand-primary')
  })

  test('surrounding space is trimmed rather than sent to the model', () => {
    expect(paletteSignal({ primary: '  brand-primary  ' })?.value).toBe('brand-primary')
  })
})
