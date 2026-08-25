import { describe, expect, it } from 'vitest'

import { hslHex, isLight, parseHex, SWATCH_ROWS, SWATCHES } from './palette'

describe('parseHex', () => {
  /**
   * THE WHOLE POINT OF THE FIELD.
   *
   * A person copying a brand colour out of a brand book, Figma or a stylesheet
   * gets one of these five shapes. Refusing four of them would be the product
   * being fussy about punctuation on the one field where somebody is doing
   * exactly what was asked.
   */
  it.each([
    ['#0068D6', '#0068D6'],
    ['0068d6', '#0068D6'],
    ['  #0068D6  ', '#0068D6'],
    ['#06d', '#0066DD'],
    ['06D', '#0066DD'],
  ])('accepts %s', (input, expected) => {
    expect(parseHex(input)).toBe(expected)
  })

  it('normalises to one shape, because two cases of one colour look like two colours', () => {
    expect(parseHex('0068d6')).toBe(parseHex('#0068D6'))
  })

  it.each(['', '#', 'blue', '#12345', '#1234567', '#GGGGGG', '0068 D6'])(
    'refuses %s rather than guessing',
    (input) => {
      expect(parseHex(input)).toBeNull()
    },
  )
})

describe('the swatch grid', () => {
  it('holds no duplicates, so no two cells are the same colour', () => {
    expect(new Set(SWATCHES).size).toBe(SWATCHES.length)
  })

  it('is every one a valid hex the store and the theme action can take', () => {
    for (const swatch of SWATCHES) expect(parseHex(swatch)).toBe(swatch)
  })

  it('opens with a neutral ramp, for a brand that is not colourful', () => {
    // White through black. A grid of only hues serves nobody whose mark is grey.
    expect(SWATCH_ROWS[0]).toHaveLength(7)
    expect(SWATCH_ROWS[0]![0]).toBe('#FFFFFF')
    expect(SWATCH_ROWS[0]![6]).toBe('#000000')
  })

  it('gives every hue row the same width, so the grid has no holes', () => {
    for (const row of SWATCH_ROWS.slice(1)) expect(row).toHaveLength(11)
  })
})

describe('hslHex', () => {
  it.each([
    [0, 1, 0.5, '#FF0000'],
    [120, 1, 0.5, '#00FF00'],
    [240, 1, 0.5, '#0000FF'],
    [0, 0, 1, '#FFFFFF'],
    [0, 0, 0, '#000000'],
  ])('h=%s s=%s l=%s is %s', (h, s, l, expected) => {
    expect(hslHex(h, s, l)).toBe(expected)
  })
})

describe('isLight', () => {
  /**
   * The selected swatch carries a tick, and a white tick on white is an
   * invisible selection — the same defect the dark accent-on-tint rule exists
   * for, one layer down.
   */
  it('calls white light and black dark', () => {
    expect(isLight('#FFFFFF')).toBe(true)
    expect(isLight('#000000')).toBe(false)
  })

  it('weights green the way an eye does, not the way an average does', () => {
    // Pure blue and pure yellow have the same channel sum and are nowhere near
    // the same brightness. A naive mean would call both mid.
    expect(isLight('#FFFF00')).toBe(true)
    expect(isLight('#0000FF')).toBe(false)
  })

  it('decides for every swatch in the grid without throwing', () => {
    for (const swatch of SWATCHES) expect(typeof isLight(swatch)).toBe('boolean')
  })
})
