import { describe, it, expect } from 'vitest'

import { colorName, colorNames } from './color-name'
import { rgbToOklch } from './oklch'

/**
 * A name for every swatch, because four buttons called "Use this colour" is one
 * button announced four times.
 *
 * These assert the CLAIM — that two colours a person would call different get
 * different names, and that no two names in a row are ever the same — not the
 * exact word. "teal" becoming "blue-green" is a copy decision; two swatches
 * sharing a name is the defect.
 */
describe('naming one colour', () => {
  it.each([
    ['red', 200, 30, 40],
    ['orange', 255, 102, 0],
    ['yellow', 255, 214, 0],
    ['green', 40, 170, 60],
    ['teal', 0, 128, 128],
    ['blue', 30, 111, 217],
    ['purple', 110, 40, 200],
    ['pink', 220, 40, 150],
  ])('calls a %s one that', (expected, r, g, b) => {
    expect(colorName(rgbToOklch(r, g, b))).toContain(expected)
  })

  /** A colour with no chroma has no hue worth naming, whatever atan2 returns. */
  it('calls a near-grey grey rather than guessing a hue', () => {
    expect(colorName(rgbToOklch(200, 200, 202))).toContain('grey')
  })

  it('separates two of the same hue by lightness', () => {
    const dark = colorName(rgbToOklch(8, 20, 70))
    const light = colorName(rgbToOklch(150, 190, 250))

    expect(dark).not.toBe(light)
    expect(dark).toContain('blue')
    expect(light).toContain('blue')
  })

  it('gives nothing back for a string that is not a colour', () => {
    expect(colorName('not a colour')).toBeNull()
  })
})

describe('naming a whole row', () => {
  it('leaves distinct names alone', () => {
    const names = colorNames([rgbToOklch(0, 128, 128), rgbToOklch(190, 20, 40)])

    expect(names).toEqual([...new Set(names)])
    expect(names[0]).not.toContain('1')
  })

  /**
   * ── THE COLLISION IS THE WHOLE POINT OF THIS FUNCTION ──────────────────────
   * The panel dedupes perceptually before it draws, so a collision is rare. Rare
   * is not never: two blues far enough apart to be worth offering can still land
   * in the same lightness band, and the moment they do the accessible names are
   * identical again and the naming has bought nothing.
   */
  it('numbers repeats so no two swatches are announced the same', () => {
    // Two blues in the same lightness band, written as OKLCH rather than routed
    // through RGB so the collision is the fixture rather than an accident of
    // whichever channels happened to round into the same word.
    const names = colorNames(['oklch(0.6 0.18 250)', 'oklch(0.65 0.18 262)'])

    expect(names).toHaveLength(2)
    expect(new Set(names).size, 'two swatches were announced identically').toBe(2)
  })

  /** Both of a pair are numbered: "blue" then "blue 2" reads as one real blue. */
  it('numbers the first of a repeated pair too', () => {
    const names = colorNames(['oklch(0.6 0.18 250)', 'oklch(0.65 0.18 262)'])

    expect(names[0]).toMatch(/1$/)
    expect(names[1]).toMatch(/2$/)
  })

  it('still names a row that carries something unparseable', () => {
    const names = colorNames(['not a colour', rgbToOklch(0, 128, 128)])

    expect(names[0]).toBeTruthy()
    expect(new Set(names).size).toBe(2)
  })
})
