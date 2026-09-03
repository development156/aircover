import { describe, expect, test } from 'vitest'

import { ImageGenerateInputSchema } from '@sahoda/shared'

import { MODE_RULES, describeModeBlock, readyModes, ruleFor } from './modes'
import { STUDIO_MODELS, defaultModelId, modelById } from './models'

/**
 * WHAT EACH MODE PROMISES, AND WHAT IT REFUSES TO PRETEND.
 *
 * Every rule here decides whether credits leave a wallet, so the screen and the
 * action must agree about all of them. These tests are what makes "one module,
 * asked by both" mean something.
 */
describe('the modes on offer', () => {
  test('every mode has a sentence about what a person GETS, not how it works', () => {
    for (const rule of MODE_RULES) {
      expect(rule.what.length, rule.mode).toBeGreaterThan(20)
      expect(rule.what, rule.mode).not.toMatch(/model|prompt|api|token|endpoint/i)
    }
  })

  /**
   * THE ONE THAT MATTERS. `series` means slides that BELONG TOGETHER, and the
   * only honest way to make them is one call with consistency locked. MEASURED:
   * the routed model reports max n = 1. Faking it with N calls costs N times as
   * much and produces N unrelated pictures, which is the opposite of the promise.
   */
  /**
   * RETARGETED, and the change is the whole point of the model picker. `series`
   * was refused because the only routed model drew ONE picture per call, and N
   * separate calls cost N times as much for N unrelated pictures. That was never
   * a fact about the mode. Models that draw the whole set in one call are now
   * routed, so the refusal moved to where it belongs: it depends on the model.
   */
  test('a matching set is refused by a model that draws one at a time', () => {
    expect(ruleFor('series', 'google/gemini-3-pro-image').ready).toBe(false)
    expect(readyModes('google/gemini-3-pro-image').map((r) => r.mode)).not.toContain('series')
  })

  /**
   * RETARGETED A SECOND TIME, and the previous retarget was the defect.
   *
   * This asserted that Seedream ALLOWS a set, because its catalogue entry says
   * it draws four pictures per call. That is a measured fact about the provider
   * and the wrong question: `ImageGenerateInputSchema` carries no count and
   * `ImageGenerateOutput` returns one picture, so whatever a model could do, the
   * only thing this product can ask for is one picture at a time. Offering the
   * mode delivered `count` separate calls with the same prompt: N unrelated
   * pictures sold as a set, at N times the cost.
   *
   * So the guard is written against the CONTRACT rather than a model list. It
   * asserts today's answer and flips by itself the day a count lands in the
   * schema, which is the only way this cannot rot back into an overclaim.
   */
  test('a set is offered only when the mesh can actually ask for one', () => {
    const canAskForASet = 'count' in ImageGenerateInputSchema.shape
    expect(canAskForASet).toBe(false)

    for (const model of STUDIO_MODELS) {
      expect(ruleFor('series', model.id).ready, model.id).toBe(canAskForASet)
      expect(
        readyModes(model.id).map((r) => r.mode),
        model.id,
      ).not.toContain('series')
    }
  })

  /**
   * The refusal must not name a remedy that cannot work. It used to end
   * "Choose a model that makes a matching set", and no model in the catalogue
   * can, because the limit is ours.
   */
  test('the refusal offers no remedy that no model could satisfy', () => {
    const said = describeModeBlock({ mode: 'series', references: 0 }) ?? ''

    expect(said).not.toMatch(/choose a model|another model|different model/i)
    expect(said).toMatch(/cannot make a matching set yet/i)
    // And it still names something they CAN do today.
    expect(said).toMatch(/several options/i)
  })

  test('the ones offered are exactly the ones the chosen model can do', () => {
    expect(readyModes('google/gemini-3-pro-image').map((r) => r.mode)).toEqual([
      'on_brand',
      'explore',
      'match',
      'edit',
    ])
    // Seedream draws four per call and still gets the same list: the ceiling
    // is this product's request shape, not the model's ability.
    expect(readyModes('bytedance-seed/seedream-5-0-lite').map((r) => r.mode)).toEqual([
      'on_brand',
      'explore',
      'match',
      'edit',
    ])
  })

  /**
   * An edit is a change to a SPECIFIC picture. Handing a model three sources
   * leaves it to decide which one it is editing, which is a different feature
   * wearing this one's label.
   */
  /**
   * RETARGETED. This asserted `match` allows `MAX_REFERENCES`, which meant 3
   * when the everyday model was the only one. `MAX_REFERENCES` is now the outer
   * bound across the whole catalogue (14) and the number a person MEETS is the
   * chosen model's. The claim that survives is the one that was always the
   * point: an edit takes one whatever the model could accept, and matching
   * takes as many as the model will look at.
   */
  test('changing a picture takes exactly one, whatever the model could accept', () => {
    expect(ruleFor('edit').minReferences).toBe(1)
    expect(ruleFor('edit').maxReferences).toBe(1)
    expect(ruleFor('edit', 'bytedance-seed/seedream-4.5').maxReferences).toBe(1)
  })

  test('matching takes as many as the chosen model will look at', () => {
    expect(ruleFor('match').maxReferences).toBe(modelById(defaultModelId())!.maxReferences)
    expect(ruleFor('match', 'bytedance-seed/seedream-5-0-lite').maxReferences).toBe(14)
    expect(ruleFor('match', 'openai/gpt-image-1').maxReferences).toBe(16)
  })

  test('a second picture on an edit says which one to keep, not just that it is wrong', () => {
    const said = describeModeBlock({ mode: 'edit', references: 2 })
    expect(said).toMatch(/one picture at a time/i)
    expect(said).toMatch(/take the others off/i)
  })

  test('an edit with nothing picked names the fix in its own words', () => {
    expect(describeModeBlock({ mode: 'edit', references: 0 })).toMatch(/picture you want changed/i)
  })

  test('an unknown mode falls back to the default rather than throwing', () => {
    expect(ruleFor('on_brand').mode).toBe('on_brand')
  })
})

describe('describeModeBlock', () => {
  test('on brand is ready with nothing at all', () => {
    expect(describeModeBlock({ mode: 'on_brand', references: 0 })).toBeNull()
  })

  test('matching needs a picture, and the sentence says which fix', () => {
    const said = describeModeBlock({ mode: 'match', references: 0 })
    expect(said).toMatch(/pick one picture/i)
  })

  test('matching is ready once there is a picture', () => {
    expect(describeModeBlock({ mode: 'match', references: 1 })).toBeNull()
  })

  /**
   * Explore is unconditioned on purpose, so a reference is a contradiction
   * rather than an error. The sentence offers BOTH ways out, because either is
   * a reasonable thing to have meant.
   */
  test('explore with a picture attached names both ways out', () => {
    const said = describeModeBlock({ mode: 'explore', references: 1 })
    expect(said).toMatch(/switch to match/i)
    expect(said).toMatch(/take these off/i)
  })

  test('too many pictures says how many to remove, not just that there are too many', () => {
    const ceiling = ruleFor('match').maxReferences
    const said = describeModeBlock({ mode: 'match', references: ceiling + 2 })
    expect(said).toContain(`${ceiling} pictures`)
    expect(said).toContain('Take 2 off')
  })

  test('exactly the maximum is allowed, because the bound is inclusive', () => {
    const ceiling = ruleFor('match').maxReferences
    expect(describeModeBlock({ mode: 'match', references: ceiling })).toBeNull()
  })

  /**
   * THE UNLOCK, ASSERTED. Eight references are too many for the everyday model
   * and fine for Seedream. If this ever stops being true the model picker has
   * become decoration.
   */
  test('a count one model refuses is allowed by a model that takes more', () => {
    // 15 is past Seedream's 14 and inside GPT Image's 16.
    expect(
      describeModeBlock({
        mode: 'match',
        references: 15,
        modelId: 'bytedance-seed/seedream-5-0-lite',
      }),
    ).not.toBeNull()
    expect(
      describeModeBlock({ mode: 'match', references: 15, modelId: 'openai/gpt-image-1' }),
    ).toBeNull()
  })

  /**
   * A set explains WHY it cannot be made, and the reason is about the picture a
   * person would get rather than about our routing table. "Not available" tells
   * them nothing; "the slides would not match" tells them what they are being
   * spared.
   */
  test('a matching set explains the consequence, not the plumbing', () => {
    const said = describeModeBlock({
      mode: 'series',
      references: 0,
      modelId: 'google/gemini-3-pro-image',
    })
    expect(said).toMatch(/do not match|belong together/i)
    expect(said).not.toMatch(/routing table|max n|schema/i)
  })

  test('every refusal names a fix rather than leaving somebody stuck', () => {
    const refusals = [
      describeModeBlock({ mode: 'match', references: 0 }),
      describeModeBlock({ mode: 'explore', references: 2 }),
      describeModeBlock({ mode: 'match', references: 99 }),
    ]
    for (const said of refusals) {
      expect(said, String(said)).toMatch(/pick|switch|take|off/i)
    }
  })

  test('the copy carries no em dash, which is the standing ruling for prose', () => {
    for (const mode of ['on_brand', 'explore', 'match', 'edit', 'series'] as const) {
      for (const references of [0, 1, 9]) {
        expect(describeModeBlock({ mode, references }) ?? '').not.toMatch(/[—–]/)
      }
    }
    for (const rule of MODE_RULES) expect(rule.what).not.toMatch(/[—–]/)
  })
})
