import { describe, it, expect } from 'vitest'

import {
  currentSwatchIndex,
  distinctBrandColors,
  isUsableBrandColor,
  MIN_SWATCH_DISTANCE,
  themeTokensFrom,
} from './brand-theme'
import { rgbToOklch } from './oklch'

/**
 * The row of colours the brand panel offers, and which of them is in use.
 *
 * ── FOUR BLUES ─────────────────────────────────────────────────────────────
 * `isUsableBrandColor` removed the greys, which ended the five-decoys defect.
 * MEASURED on the founder's screenshot afterwards: four swatches, all blue, all
 * a shade apart. The chroma filter says nothing about whether the survivors
 * differ from EACH OTHER, and a logo drawn in one colour at four opacities
 * produces exactly that — four choices with one outcome, which is the same
 * defect wearing a different hat.
 */
describe('offering a colour only once', () => {
  it('keeps colours a person would call different', () => {
    const kept = distinctBrandColors([rgbToOklch(0, 128, 128), rgbToOklch(190, 20, 40)])

    expect(kept).toHaveLength(2)
  })

  /** One brand blue at four opacities, which is what a flat logo yields. */
  it('collapses four shades of one blue', () => {
    const kept = distinctBrandColors([
      rgbToOklch(30, 111, 217),
      rgbToOklch(34, 116, 220),
      rgbToOklch(28, 106, 213),
      rgbToOklch(32, 113, 218),
    ])

    expect(kept, 'four near-identical blues were offered as four choices').toHaveLength(1)
  })

  /** The first survives, so the most frequent colour stays the first offer. */
  it('keeps the first of a run, not the last', () => {
    const first = rgbToOklch(30, 111, 217)
    expect(distinctBrandColors([first, rgbToOklch(34, 116, 220)])[0]).toBe(first)
  })

  /**
   * TWO NEAR-GREYS ARE THE SAME COLOUR whatever the hue arc says. At chroma near
   * zero the hue is numerical noise, and a filter that compared hue would call
   * two indistinguishable greys ninety degrees apart two different colours.
   */
  it('treats two near-greys as one colour despite their hue gap', () => {
    const kept = distinctBrandColors([rgbToOklch(200, 200, 202), rgbToOklch(202, 200, 200)])

    expect(kept).toHaveLength(1)
  })

  it('drops a string that is not a colour rather than offering it', () => {
    expect(distinctBrandColors(['not a colour', rgbToOklch(0, 128, 128)])).toHaveLength(1)
  })

  it('is a low bar, not a taste ruling', () => {
    expect(MIN_SWATCH_DISTANCE).toBeLessThan(0.15)
  })
})

/**
 * ── WHICH ONE IS ON ─────────────────────────────────────────────────────────
 * The panel offers the colours EXTRACTED from the logo. What is stored is the
 * guard's output, and the guard moves lightness — sometimes a long way, which is
 * the whole point of the fill-on-page check. So string equality never matched
 * and the row carried no mark on any swatch.
 */
describe('marking the colour in use', () => {
  it('finds the swatch a stored theme was derived from', () => {
    const teal = rgbToOklch(0, 128, 128)
    const crimson = rgbToOklch(190, 20, 40)
    const stored = themeTokensFrom([crimson, teal])

    expect(currentSwatchIndex([teal, crimson], stored.primary)).toBe(1)
  })

  /**
   * ── THE LIGHTNESS MOVES AND THE MATCH MUST NOT CARE ───────────────────────
   * `brandSkinVars` re-derives on every render, and the fill-on-page guard
   * lightens a navy a long way before it is a visible button. The stored row is
   * only one of the two places the primary can differ from the extracted string,
   * and comparing anything but hue means the mark disappears the moment the
   * guard does its job.
   *
   * Written as OKLCH rather than routed through the guard so that the DIFFERENCE
   * is the fixture: a test that measured the guard's current output would go
   * green again by accident the day the guard stopped moving anything.
   */
  it('survives the lightness having been moved', () => {
    const navy = rgbToOklch(8, 20, 70)
    const lightened = 'oklch(0.68 0.0948 267.2)'

    expect(currentSwatchIndex([rgbToOklch(0, 128, 128), navy], lightened)).toBe(1)
  })

  /** And the same colour arriving back unmoved is still found. */
  it('finds a stored colour the guard left alone', () => {
    const navy = rgbToOklch(8, 20, 70)
    const stored = themeTokensFrom([navy])

    expect(currentSwatchIndex([rgbToOklch(0, 128, 128), navy], stored.primary)).toBe(1)
  })

  it('marks nothing when the stored colour is not in the row', () => {
    const stored = themeTokensFrom([rgbToOklch(190, 20, 40)])

    expect(currentSwatchIndex([rgbToOklch(0, 128, 128)], stored.primary)).toBe(-1)
  })

  it('marks nothing when no theme is stored', () => {
    expect(currentSwatchIndex([rgbToOklch(0, 128, 128)], null)).toBe(-1)
  })

  /** At most one mark, however close two swatches sit. */
  it('never marks two swatches', () => {
    const blue = rgbToOklch(30, 111, 217)
    const nearly = rgbToOklch(34, 116, 220)
    const stored = themeTokensFrom([blue])

    const marked = [blue, nearly].filter(
      (_, index) => index === currentSwatchIndex([blue, nearly], stored.primary),
    )
    expect(marked).toHaveLength(1)
  })

  it('is unmoved by a stored value it cannot read', () => {
    expect(currentSwatchIndex([rgbToOklch(0, 128, 128)], 'not a colour')).toBe(-1)
  })
})

/** The two filters compose in the order the panel uses them. */
describe('the row the panel actually draws', () => {
  it('drops the greys and then the duplicates', () => {
    const offered = distinctBrandColors(
      [
        rgbToOklch(200, 200, 202),
        rgbToOklch(30, 111, 217),
        rgbToOklch(34, 116, 220),
        rgbToOklch(0, 128, 128),
      ].filter(isUsableBrandColor),
    )

    expect(offered).toHaveLength(2)
  })
})
