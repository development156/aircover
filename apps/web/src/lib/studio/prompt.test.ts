import { describe, expect, test } from 'vitest'

import type { BrandSignal } from '@sahoda/shared'

import { conditionPrompt, describeConditioning } from './prompt'

/**
 * WHAT THE PROMPT CLAIMS, AND WHAT IT MUST NEVER INVENT.
 *
 * Claims, not wording. Every sentence here can be rewritten; what may not change
 * is which facts reach the model and what the person is told about them.
 */

const confirmed: BrandSignal = { field: 'voice', certainty: 'confirmed', value: 'warm and direct' }
const guessed: BrandSignal = { field: 'audience', certainty: 'guessed', value: 'local families' }

describe('conditionPrompt', () => {
  test("the person's own words come first and are not rewritten", () => {
    const { prompt } = conditionPrompt({
      mode: 'on_brand',
      wanted: 'a plate of samosas',
      signals: [],
    })
    expect(prompt.startsWith('a plate of samosas')).toBe(true)
  })

  test('brand facts reach the model when there are any', () => {
    const { prompt, used } = conditionPrompt({
      mode: 'on_brand',
      wanted: 'a shopfront',
      signals: [confirmed, guessed],
    })
    expect(prompt).toContain('warm and direct')
    expect(prompt).toContain('local families')
    expect(used).toHaveLength(2)
  })

  /**
   * An empty field is ABSENT, never filled with something plausible. A signal
   * whose value is blank must not reach the model as an empty label, because
   * "voice:" with nothing after it is a instruction to invent one.
   */
  test('an empty brand fact is left out rather than sent as a blank', () => {
    const { prompt, used } = conditionPrompt({
      mode: 'on_brand',
      wanted: 'a shopfront',
      signals: [{ field: 'voice', certainty: 'confirmed', value: '   ' }],
    })
    expect(used).toEqual([])
    expect(prompt).not.toContain('voice')
  })

  /**
   * Explore is unconditioned ON PURPOSE. If it quietly used the brand it would
   * produce the same picture as On brand at a different price.
   */
  test('explore uses no brand facts at all, even when they exist', () => {
    const { prompt, used } = conditionPrompt({
      mode: 'explore',
      wanted: 'a shopfront',
      signals: [confirmed, guessed],
    })
    expect(used).toEqual([])
    expect(prompt).not.toContain('warm and direct')
  })

  test('on brand and explore give the model different directions', () => {
    const a = conditionPrompt({ mode: 'on_brand', wanted: 'x', signals: [] }).prompt
    const b = conditionPrompt({ mode: 'explore', wanted: 'x', signals: [] }).prompt
    expect(a).not.toBe(b)
  })

  test('a series is told the images belong together', () => {
    const { prompt } = conditionPrompt({ mode: 'series', wanted: 'x', signals: [] })
    expect(prompt).toMatch(/identical across the set/i)
  })

  /**
   * THE ONE THAT PROTECTS THE FEED. Text is a deterministic layer on top, never
   * generated inside the picture, because one garbled headline in fifty on a
   * public feed is not acceptable. Every mode carries this instruction.
   */
  test('every mode tells the model not to draw words', () => {
    for (const mode of ['on_brand', 'explore', 'match', 'series'] as const) {
      const { prompt } = conditionPrompt({ mode, wanted: 'x', signals: [confirmed] })
      expect(prompt, mode).toMatch(/do not render any words/i)
    }
  })

  test('the used list is what was actually folded in, not what was offered', () => {
    const { used } = conditionPrompt({
      mode: 'on_brand',
      wanted: 'x',
      signals: [confirmed, { field: 'hook', certainty: 'guessed', value: '' }],
    })
    expect(used.map((s) => s.field)).toEqual(['voice'])
  })
})

describe('describeConditioning', () => {
  test('explore says it ignored the brand on purpose, not that the brand is missing', () => {
    const said = describeConditioning({ mode: 'explore', used: [] })
    expect(said).toMatch(/on purpose/i)
    expect(said).not.toMatch(/nothing about your brand/i)
  })

  /**
   * An empty brain and an empty Explore are different situations and only one of
   * them has a remedy. Offering "fill in your Brand Brain" to an Explore user
   * would be a remedy for a problem they do not have.
   */
  test('an empty brain says so and names the remedy that works', () => {
    const said = describeConditioning({ mode: 'on_brand', used: [] })
    expect(said).toMatch(/nothing about your brand/i)
    expect(said).toMatch(/brand brain/i)
  })

  test('all confirmed says so and asks for nothing', () => {
    const said = describeConditioning({ mode: 'on_brand', used: [confirmed] })
    expect(said).toMatch(/confirmed/i)
    expect(said).not.toMatch(/guess/i)
  })

  test('all guessed says so and offers confirming as the improvement', () => {
    const said = describeConditioning({ mode: 'on_brand', used: [guessed] })
    expect(said).toMatch(/worked out/i)
    expect(said).toMatch(/confirming/i)
  })

  test('a mixture counts both, and the counts are the real ones', () => {
    const said = describeConditioning({ mode: 'on_brand', used: [confirmed, guessed, guessed] })
    expect(said).toContain('1 confirmed')
    expect(said).toContain('2 guessed')
  })

  test('one thing is singular and two are plural, because a person reads it', () => {
    expect(describeConditioning({ mode: 'on_brand', used: [confirmed] })).toContain('1 thing')
    expect(describeConditioning({ mode: 'on_brand', used: [confirmed, confirmed] })).toContain(
      '2 things',
    )
  })

  test('the copy carries no em dash, which is the standing ruling for prose', () => {
    for (const used of [[], [confirmed], [guessed], [confirmed, guessed]]) {
      for (const mode of ['on_brand', 'explore'] as const) {
        expect(describeConditioning({ mode, used })).not.toMatch(/[—–]/)
      }
    }
  })
})
