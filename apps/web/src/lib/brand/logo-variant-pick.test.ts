import { describe, expect, it } from 'vitest'

import { pickLogoVariant } from './logo-variant-pick'
import type { LogoFacts } from './logo-facts'

/**
 * Choosing which logo file to stamp, given the backdrop it will sit on.
 *
 * Pure function, so every test is a plain call: no mocks, no bytes, no sharp.
 * `LogoFacts` fixtures below are constructed directly rather than measured,
 * because what is under test is the DECISION, not the measurement.
 */

function facts(overrides: Partial<LogoFacts> = {}): LogoFacts {
  return {
    hasAlpha: true,
    transparentBackground: true,
    trim: { x: 0, y: 0, width: 10, height: 10 },
    inkPolarity: 'dark',
    shapeClass: 'square',
    ...overrides,
  }
}

const DARK_INK = facts({ inkPolarity: 'dark' })
const LIGHT_INK = facts({ inkPolarity: 'light' })
const MIXED_INK = facts({ inkPolarity: 'mixed' })
const NO_INK = facts({ trim: null })

describe('pickLogoVariant', () => {
  it('picks the only file available, on a backdrop it would fail on', () => {
    // Dark ink on a dark backdrop (luminance 0) would normally need a plate.
    // With no second file to swap to, the light variant is still the answer:
    // plating it is `stamp.ts`'s job, not this function's.
    expect(pickLogoVariant({ light: DARK_INK, dark: null }, 0)).toEqual({
      ok: true,
      kind: 'light',
    })
  })

  it('picks the only dark-variant file when that is all there is', () => {
    expect(pickLogoVariant({ light: null, dark: LIGHT_INK }, 1)).toEqual({
      ok: true,
      kind: 'dark',
    })
  })

  it('says neither fits when neither file has ink', () => {
    expect(pickLogoVariant({ light: NO_INK, dark: NO_INK }, 0.5)).toEqual({
      ok: false,
      reason: expect.stringContaining('no logo file'),
    })
  })

  it('says neither fits when nothing was supplied at all', () => {
    expect(pickLogoVariant({ light: null, dark: null }, 0.5)).toEqual({
      ok: false,
      reason: expect.any(String),
    })
  })

  it('prefers whichever of two files clears contrast without a plate', () => {
    // Dark ink needs a backdrop >= ~0.175 to clear without a plate; light ink
    // needs one <= ~0.183. A near-black backdrop (0.02) clears for light ink
    // and fails for dark ink.
    const result = pickLogoVariant({ light: DARK_INK, dark: LIGHT_INK }, 0.02)
    expect(result).toEqual({ ok: true, kind: 'dark' })
  })

  it('prefers the light variant on a bright backdrop where only it clears', () => {
    const result = pickLogoVariant({ light: DARK_INK, dark: LIGHT_INK }, 0.9)
    expect(result).toEqual({ ok: true, kind: 'light' })
  })

  it('breaks a tie between two files that both clear by the backdrop brightness', () => {
    // Both dark ink files clear a mid-bright backdrop (>= 0.175); the tie goes
    // to the light variant on a bright backdrop.
    const result = pickLogoVariant({ light: DARK_INK, dark: DARK_INK }, 0.8)
    expect(result).toEqual({ ok: true, kind: 'light' })
  })

  it('breaks the same tie toward the dark variant on a dim backdrop', () => {
    // Light ink clears without a plate below ~0.183, so 0.1 clears for both
    // files and the tie goes to the dark variant below the midpoint.
    const result = pickLogoVariant({ light: LIGHT_INK, dark: LIGHT_INK }, 0.1)
    expect(result).toEqual({ ok: true, kind: 'dark' })
  })

  it('says neither fits when both files are mixed ink (always plated)', () => {
    const result = pickLogoVariant({ light: MIXED_INK, dark: MIXED_INK }, 0.5)
    // RETARGETED: a bare `.ok` check cannot tell "neither clears contrast"
    // from "no logo file has ink" — two different reasons this function can
    // return, and a regression that returned the WRONG one would pass. Pin
    // the specific sentence for the mixed-ink case.
    expect(result).toEqual({
      ok: false,
      reason: 'Neither logo variant clears contrast on this backdrop without a plate.',
    })
  })

  it('picks the light file when only it has ink, even if the dark file exists but is blank', () => {
    expect(pickLogoVariant({ light: DARK_INK, dark: NO_INK }, 0.9)).toEqual({
      ok: true,
      kind: 'light',
    })
  })
})
