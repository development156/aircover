import { describe, expect, test } from 'vitest'

import { MAX_REFERENCES, MODE_RULES, describeModeBlock, readyModes, ruleFor } from './modes'

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
  test('a matching set is not offered, because nothing can honestly make one yet', () => {
    expect(ruleFor('series').ready).toBe(false)
    expect(readyModes().map((r) => r.mode)).not.toContain('series')
  })

  test('the three that are offered are the three that work', () => {
    expect(readyModes().map((r) => r.mode)).toEqual(['on_brand', 'explore', 'match'])
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
    const said = describeModeBlock({ mode: 'match', references: MAX_REFERENCES + 2 })
    expect(said).toContain(`${MAX_REFERENCES} pictures`)
    expect(said).toContain('Take 2 off')
  })

  test('exactly the maximum is allowed, because the bound is inclusive', () => {
    expect(describeModeBlock({ mode: 'match', references: MAX_REFERENCES })).toBeNull()
  })

  /**
   * A set explains WHY it cannot be made, and the reason is about the picture a
   * person would get rather than about our routing table. "Not available" tells
   * them nothing; "the slides would not match" tells them what they are being
   * spared.
   */
  test('a matching set explains the consequence, not the plumbing', () => {
    const said = describeModeBlock({ mode: 'series', references: 0 })
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
    for (const mode of ['on_brand', 'explore', 'match', 'series'] as const) {
      for (const references of [0, 1, 9]) {
        expect(describeModeBlock({ mode, references }) ?? '').not.toMatch(/[—–]/)
      }
    }
    for (const rule of MODE_RULES) expect(rule.what).not.toMatch(/[—–]/)
  })
})
