import { describe, expect, test } from 'vitest'

import { CONSTRAINTS, STUDIO_PRESETS } from '@sahoda/shared'

import {
  GENERATABLE_MAX,
  GENERATABLE_MIN,
  aspectRatioLabel,
  canGenerate,
  channelPermits,
  formatById,
  formatsForChannel,
  generatableFormats,
  publishableChannels,
} from './formats'

/**
 * WHAT THE STUDIO MAY OFFER.
 *
 * Two rules, and both fail silently rather than loudly, which is why they are
 * tested rather than commented:
 *
 *   A format the product cannot PUBLISH must not be offered.
 *   A shape the model cannot DRAW must not be offered for generation.
 *
 * Every number below is derived from `STUDIO_PRESETS` or from the Constraint
 * Engine. Nothing is typed in, because a hard-coded 1080 here would be the exact
 * defect this module exists to prevent, reproduced in its own guard.
 */
describe('generatableFormats', () => {
  test('offers only sizes the model can be asked for', () => {
    for (const format of generatableFormats()) {
      expect(format.width, format.id).toBeGreaterThanOrEqual(GENERATABLE_MIN)
      expect(format.width, format.id).toBeLessThanOrEqual(GENERATABLE_MAX)
      expect(format.height, format.id).toBeGreaterThanOrEqual(GENERATABLE_MIN)
      expect(format.height, format.id).toBeLessThanOrEqual(GENERATABLE_MAX)
    }
  })

  test('keeps the presets in the order a person meets them', () => {
    const offered = generatableFormats().map((f) => f.id)
    const declared = STUDIO_PRESETS.filter(canGenerate).map((p) => p.id)
    expect(offered).toEqual(declared)
  })

  test('invents no dimension: every size traces back to a preset', () => {
    for (const format of generatableFormats()) {
      const preset = STUDIO_PRESETS.find((p) => p.id === format.id)
      expect(preset, format.id).toBeDefined()
      expect([format.width, format.height]).toEqual([preset!.width, preset!.height])
    }
  })

  test('the aspect is the short side over the long one, whichever way round it is', () => {
    for (const format of generatableFormats()) {
      expect(format.aspect, format.id).toBeGreaterThan(0)
      expect(format.aspect, format.id).toBeLessThanOrEqual(1)
    }
  })

  /**
   * THE ONE THAT MATTERS. Offered must be a SUBSET of permitted. A preset may
   * legitimately offer fewer channels than the engine allows, because offering
   * is a product choice; it may never offer one the engine would refuse,
   * because that is a post that fails at publish time after somebody paid to
   * make the picture.
   */
  test('every channel a format is offered for is one the engine permits', () => {
    for (const format of generatableFormats()) {
      for (const channel of format.channels) {
        expect(channelPermits(channel, format), `${format.id} on ${channel}`).toBe(true)
      }
    }
  })
})

describe('formatsForChannel', () => {
  test('a channel is offered only sizes that name it', () => {
    for (const channel of publishableChannels()) {
      for (const format of formatsForChannel(channel)) {
        expect(format.channels, `${format.id} for ${channel}`).toContain(channel)
      }
    }
  })

  test('every publishable channel has at least one size, so no channel is a dead end', () => {
    for (const channel of publishableChannels()) {
      expect(formatsForChannel(channel).length, channel).toBeGreaterThan(0)
    }
  })

  test('publishable channels come from the engine, not from a list here', () => {
    for (const channel of publishableChannels()) {
      expect(CONSTRAINTS[channel].publishable, channel).toBe(true)
    }
  })
})

describe('formatById', () => {
  test('a known size resolves', () => {
    const first = generatableFormats()[0]!
    expect(formatById(first.id)?.id).toBe(first.id)
  })

  test('a size Sahoda does not offer resolves to nothing rather than a guess', () => {
    expect(formatById('a-size-from-2019')).toBeNull()
  })

  /**
   * NOT A GUARD TODAY, AND SAYING SO IS THE POINT.
   *
   * `formatById` also refuses a preset that exists but is outside the provider's
   * bounds, so the picker and the action that spends credits ask one question
   * through one function. MEASURED: removing that refusal leaves all 31 tests
   * green, because every shipped preset is currently generatable and the branch
   * has no reachable trigger. An earlier version of this test carried an
   * early-return escape hatch that made it look guarded when it was not.
   *
   * The branch stays: presets are data, and the first one added outside 512 to
   * 2048 pixels would otherwise be offered, spent on, and refused by the
   * provider after the credits were gone. What this test asserts is the
   * PRECONDITION that makes the branch unreachable, so the day it stops holding
   * is the day this line fails and somebody writes the real guard.
   */
  test('every shipped preset is generatable, which is why the refusal is unreachable', () => {
    expect(STUDIO_PRESETS.filter((p) => !canGenerate(p)).map((p) => p.id)).toEqual([])
  })
})

describe('canGenerate', () => {
  test('refuses a canvas below the provider floor', () => {
    expect(canGenerate({ width: GENERATABLE_MIN - 1, height: 1024 })).toBe(false)
    expect(canGenerate({ width: 1024, height: GENERATABLE_MIN - 1 })).toBe(false)
  })

  test('refuses a canvas above the provider ceiling', () => {
    expect(canGenerate({ width: GENERATABLE_MAX + 1, height: 1024 })).toBe(false)
    expect(canGenerate({ width: 1024, height: GENERATABLE_MAX + 1 })).toBe(false)
  })

  test('accepts the bounds themselves, because they are inclusive', () => {
    expect(canGenerate({ width: GENERATABLE_MIN, height: GENERATABLE_MAX })).toBe(true)
  })
})

describe('aspectRatioLabel', () => {
  /**
   * REDUCED, NOT RETYPED. 1080x1920 is 9:16, and the wrong version of this
   * function returns "1080:1920" — technically a ratio, unreadable as one.
   *
   * MUTATION: return `${format.width}:${format.height}` unreduced and this
   * goes red on the story case.
   */
  test('reduces a clean shape to its smallest whole numbers', () => {
    expect(aspectRatioLabel({ width: 1080, height: 1080 })).toBe('1:1')
    expect(aspectRatioLabel({ width: 1080, height: 1920 })).toBe('9:16')
    expect(aspectRatioLabel({ width: 1600, height: 900 })).toBe('16:9')
    expect(aspectRatioLabel({ width: 1200, height: 900 })).toBe('4:3')
    expect(aspectRatioLabel({ width: 1080, height: 1350 })).toBe('4:5')
  })

  /**
   * NEVER ROUNDED TO LOOK TIDY. 1200x628 (the link card) reduces to 300:157,
   * which nobody would recognise as a shape. This proves the function shows
   * the pixel dimensions instead of inventing a clean-looking ratio the
   * format is not.
   *
   * MUTATION: raise `CLEAN_CEILING` so 300:157 passes through and this goes
   * red, asserting a ratio nobody could read at a glance.
   */
  test('shows pixel dimensions instead of a ratio that would not reduce cleanly', () => {
    expect(aspectRatioLabel({ width: 1200, height: 628 })).toBe('1200 × 628px')
  })

  /**
   * Every size the Studio actually offers reduces to SOMETHING: this only
   * proves the function never throws or returns an empty string across the
   * real catalogue, not that every one of them is a clean ratio (the link
   * card above already proves one of them is not).
   */
  test('every offered format gets a label', () => {
    for (const format of generatableFormats()) {
      expect(aspectRatioLabel(format).length, format.id).toBeGreaterThan(0)
    }
  })
})

describe('channelPermits', () => {
  test('a channel that cannot publish permits nothing', () => {
    const format = generatableFormats()[0]!
    const unpublishable = Object.values(CONSTRAINTS).find((s) => !s.publishable)
    if (unpublishable === undefined) return
    expect(channelPermits(unpublishable.channel, format)).toBe(false)
  })

  test('a canvas under a channel floor is refused', () => {
    const withFloor = Object.values(CONSTRAINTS).find(
      (s) => s.publishable && s.imageDims !== undefined && s.imageDims.minW > 8,
    )
    if (withFloor === undefined) return
    const tiny = {
      id: 't',
      label: 't',
      width: withFloor.imageDims!.minW - 1,
      height: withFloor.imageDims!.minH - 1,
      channels: [],
      aspect: 1,
    }
    expect(channelPermits(withFloor.channel, tiny)).toBe(false)
  })
})
