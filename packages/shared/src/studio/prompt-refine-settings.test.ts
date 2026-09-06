import { describe, expect, it } from 'vitest'

import {
  PromptRefineSettingsSchema,
  shapeFromDimensions,
  type PromptRefineSettings,
} from './prompt-refine-settings'

const BASE: PromptRefineSettings = {
  mode: 'on_brand',
  shape: 'square',
  hasReference: false,
  stampEnabled: false,
  stampAnchor: 'bottom-right',
}

describe('shapeFromDimensions', () => {
  it('reads an exactly equal canvas as square', () => {
    expect(shapeFromDimensions(1080, 1080)).toBe('square')
  })

  it('reads a taller-than-wide canvas as tall', () => {
    expect(shapeFromDimensions(1080, 1350)).toBe('tall')
    expect(shapeFromDimensions(1080, 1920)).toBe('tall')
  })

  it('reads a wider-than-tall canvas as wide', () => {
    expect(shapeFromDimensions(1600, 900)).toBe('wide')
    expect(shapeFromDimensions(1200, 628)).toBe('wide')
  })

  it('never returns a ratio or a pixel size, only one of the three shape words', () => {
    const shape = shapeFromDimensions(1200, 900)
    expect(['square', 'tall', 'wide']).toContain(shape)
  })
})

describe('PromptRefineSettingsSchema', () => {
  it('parses the minimal shape: no exclusion, no reference-follow', () => {
    const parsed = PromptRefineSettingsSchema.parse(BASE)
    expect(parsed.excludeText).toBeUndefined()
    expect(parsed.referenceFollow).toBeUndefined()
  })

  /**
   * MUTATION: swap `z.enum(REFERENCE_FOLLOW_STEPS).optional()` for the
   * exported `ReferenceFollowSchema` (which carries `.default('balanced')`)
   * and this goes red — an omitted `referenceFollow` would then silently
   * become `'balanced'` instead of staying absent, which is a different
   * fact: "no reference was picked" versus "balanced was chosen".
   */
  it('leaves referenceFollow absent rather than defaulting it', () => {
    const parsed = PromptRefineSettingsSchema.parse(BASE)
    expect('referenceFollow' in parsed && parsed.referenceFollow !== undefined).toBe(false)
  })

  it('accepts every declared shape, mode and stamp anchor', () => {
    for (const shape of ['square', 'tall', 'wide'] as const) {
      expect(PromptRefineSettingsSchema.safeParse({ ...BASE, shape }).success).toBe(true)
    }
    for (const mode of ['on_brand', 'explore', 'match', 'edit', 'series'] as const) {
      expect(PromptRefineSettingsSchema.safeParse({ ...BASE, mode }).success).toBe(true)
    }
    for (const stampAnchor of ['bottom-right', 'bottom-left', 'top-right', 'top-left'] as const) {
      expect(PromptRefineSettingsSchema.safeParse({ ...BASE, stampAnchor }).success).toBe(true)
    }
  })

  it('rejects an unknown shape rather than silently accepting it', () => {
    expect(PromptRefineSettingsSchema.safeParse({ ...BASE, shape: 'panoramic' }).success).toBe(
      false,
    )
  })

  it('bounds excludeText to the same length as LeaveOutSchema', () => {
    expect(
      PromptRefineSettingsSchema.safeParse({ ...BASE, excludeText: 'a'.repeat(121) }).success,
    ).toBe(false)
    expect(PromptRefineSettingsSchema.safeParse({ ...BASE, excludeText: 'birds' }).success).toBe(
      true,
    )
  })
})
