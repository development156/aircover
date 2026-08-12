import { describe, expect, test } from 'vitest'

import { classify } from './classify'
import { storedIntakeFrom } from './to-stored-intake'

/**
 * What onboarding is allowed to say it knows about a customer's trade.
 *
 * The value ends up selecting a MANDATED rule pack and colouring a refusal
 * sentence, so the two failure directions are not symmetric: storing nothing
 * costs a clinic its healthcare pack, and storing too strongly tells a customer
 * that a rule we invented came from their regulator. The second is worse, and it
 * is the one these pin.
 */

/** The classifier reads this out of the words; the user picked nothing. */
const MATCHED_TEXT = 'we run a small dental clinic in Bhubaneswar'
/** Nothing in the lexicon fires, so the classifier falls back to `consumer`. */
const BLANK_TEXT = 'zzz'

describe('a regime the customer chose themselves', () => {
  test('is stored, and stored as declared', () => {
    expect(storedIntakeFrom(BLANK_TEXT, '', { regime: 'finance' })).toMatchObject({
      regime: 'finance',
      basis: 'declared',
    })
  })

  test('outranks what the sentence matched, because they corrected us', () => {
    expect(storedIntakeFrom(MATCHED_TEXT, '', { regime: 'beauty' })).toMatchObject({
      regime: 'beauty',
      basis: 'declared',
    })
  })
})

describe('a regime read out of their own sentence', () => {
  test('is stored, so the pack applies', () => {
    // Guards the guard: if the lexicon stops matching this, every assertion
    // below about `derived` would pass by testing the fallback instead.
    expect(classify(MATCHED_TEXT).regime.basis).toBe('matched')

    expect(storedIntakeFrom(MATCHED_TEXT, '', {})).toMatchObject({ regime: 'healthcare' })
  })

  test('is stored as derived, never as declared', () => {
    // `describeRuleSource` may only say "this comes with the trade you told us
    // you are in" under `declared`. Nobody told us this — we read it.
    expect(storedIntakeFrom(MATCHED_TEXT, '', {})?.basis).toBe('derived')
  })

  test('the door text can supply it when screen 1 could not', () => {
    expect(storedIntakeFrom(BLANK_TEXT, 'Our clinic offers dental implants.', {})).toMatchObject({
      regime: 'healthcare',
      basis: 'derived',
    })
  })
})

describe('a regime nobody indicated', () => {
  test('is not stored at all', () => {
    // NOT `consumer` with a weak basis. A default is not a fact about the
    // customer, and `consumer` has no pack — so writing it would record a
    // declaration that buys nothing and can only ever mislead a later reader.
    expect(classify(BLANK_TEXT).regime.basis).toBe('assumed')
    expect(storedIntakeFrom(BLANK_TEXT, '', {})).toBeNull()
  })

  test('an empty onboarding — the resume path — declares nothing', () => {
    // A user returning to a saved brain lands on the reveal screen with no
    // sentence and no overrides. `saveBrandMemory` reads null as "say nothing",
    // so whatever they declared the first time survives.
    expect(storedIntakeFrom('', '', {})).toBeNull()
  })

  test('a locale or model pick alone does not make a regime declarable', () => {
    // The regime is what selects the pack. Confidence about the other two says
    // nothing about it.
    expect(storedIntakeFrom(BLANK_TEXT, '', { locale: 'US', model: 'platform' })).toBeNull()
  })
})

describe('the whole intake, not just the regime', () => {
  test('carries all three picks, because the gate reads locale too', () => {
    const stored = storedIntakeFrom(MATCHED_TEXT, '', { regime: 'healthcare' })

    expect(stored).toEqual({
      model: expect.any(String),
      regime: 'healthcare',
      locale: expect.any(String),
      basis: 'declared',
    })
  })
})
