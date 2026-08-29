import { describe, expect, test } from 'vitest'

import { STUDIO_PRESETS } from '@sahoda/shared'

import { describeDesignCard } from './card-copy'

/**
 * WHAT A GALLERY CARD CLAIMS ABOUT A DESIGN.
 *
 * Claims, not wording: the numbers and the null cases are what may not change.
 * The word "slide" is asserted in the component test rather than here, because
 * this module returns the parts and the screen assembles the sentence.
 */
describe('describeDesignCard', () => {
  const square = STUDIO_PRESETS.find((preset) => preset.id === 'square')!

  test('a single design counts nothing, because one slide is a post', () => {
    expect(describeDesignCard({ pageCount: 1, presetId: square.id }).slides).toBeNull()
  })

  test('a carousel says how many, because the preview shows only the first', () => {
    expect(describeDesignCard({ pageCount: 3, presetId: square.id }).slides).toBe(3)
    expect(describeDesignCard({ pageCount: 2, presetId: square.id }).slides).toBe(2)
  })

  test('the size is the fact a preview at gallery scale cannot carry', () => {
    expect(describeDesignCard({ pageCount: 1, presetId: square.id }).size).toBe(square.label)
  })

  /**
   * A design saved under a retired size still opens and still belongs to
   * somebody. Naming a size that no longer exists would be inventing a fact
   * about their design; saying nothing about the size is the honest half.
   */
  test('a size Sahoda no longer offers is left unnamed rather than invented', () => {
    const line = describeDesignCard({ pageCount: 4, presetId: 'a-size-from-2019' })
    expect(line.size).toBeNull()
    expect(line.slides).toBe(4)
  })

  test('every shipped size has a line, so no card is left blank by accident', () => {
    for (const preset of STUDIO_PRESETS) {
      const line = describeDesignCard({ pageCount: 1, presetId: preset.id })
      expect(line.size, preset.id).not.toBeNull()
      expect(line.size, preset.id).not.toBe('')
    }
  })

  test('no size label is the word this module exists to remove', () => {
    for (const preset of STUDIO_PRESETS) {
      expect(preset.label.toLowerCase(), preset.id).not.toMatch(/\bpages?\b/)
    }
  })
})
