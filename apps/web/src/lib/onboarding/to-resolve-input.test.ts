import { describe, expect, it } from 'vitest'

import type { Intake } from './intake'
import { firstProofPoint, firstSentence, toResolveInput } from './to-resolve-input'

const INTAKE: Intake = { model: 'local_presence', regime: 'food', locale: 'IN' }

const DOOR = [
  'Home',
  'Menu',
  'Contact',
  'Rolling Pin Bakehouse is a neighbourhood bakery on Prabhat Road in Pune.',
  'We have been baking sourdough here since 2014, and nothing is bought in.',
].join('\n')

describe('firstSentence', () => {
  it('skips navigation and takes the first real sentence', () => {
    expect(firstSentence(DOOR)).toBe(
      'Rolling Pin Bakehouse is a neighbourhood bakery on Prabhat Road in Pune.',
    )
  })

  it('is empty when there is nothing substantial', () => {
    expect(firstSentence('Home Menu Contact')).toBe('')
    expect(firstSentence('')).toBe('')
  })
})

describe('firstProofPoint', () => {
  it('takes a sentence carrying a year, verbatim', () => {
    expect(firstProofPoint(DOOR)).toContain('since 2014')
  })

  it('takes a counted quantity when there is no year', () => {
    expect(
      firstProofPoint('We deliver to 40 restaurants across the city every morning.'),
    ).toContain('40 restaurants')
  })

  it('is empty rather than inventing one', () => {
    // A proof point this product wrote itself would be the one field in the
    // whole Brand Brain that is fabricated rather than inferred.
    expect(firstProofPoint('We care deeply about quality and about our customers.')).toBe('')
  })
})

describe('toResolveInput', () => {
  const answers = {
    intake: INTAKE,
    doorText: DOOR,
    refusal: "we won't call it homemade if we didn't make the base",
    name: 'Rolling Pin Bakehouse',
  }

  it('produces a valid ResolveInput', () => {
    // The real assertion: it parses against the frozen schema.
    expect(() => toResolveInput(answers)).not.toThrow()
  })

  it('says all three picks as prose in category', () => {
    const input = toResolveInput(answers)

    expect(input.source.category).toBe('local presence in food, in India')
  })

  it('carries locale, which the contract has no field for', () => {
    const abroad = toResolveInput({ ...answers, intake: { ...INTAKE, locale: 'GB' } })

    expect(abroad.source.category).toContain('United Kingdom')
  })

  it('puts the refusal in avoid_topics, not legal_red_lines', () => {
    const input = toResolveInput(answers)

    // Their contraction survives: only the opener is rewritten, never the
    // words after it.
    expect(input.taboo.avoid_topics).toBe("Never call it homemade if we didn't make the base.")
    // "Legal" is a claim nobody has checked. Asserting it would be this
    // product inventing legal force for a rule the user simply holds.
    expect(input.taboo.legal_red_lines).toBe('')
  })

  it('takes the door sentences verbatim', () => {
    const input = toResolveInput(answers)

    expect(DOOR).toContain(input.source.one_liner)
    expect(DOOR).toContain(input.brand.proof_point)
  })

  it('leaves fields it was not told about blank rather than guessing', () => {
    const input = toResolveInput(answers)

    // A plausible guess here would be this product inventing its user's
    // customer, and the user would never know which parts it made up.
    expect(input.customer.pain).toBe('')
    expect(input.customer.fear).toBe('')
    expect(input.brand.archetype).toBe('')
    expect(input.source.mission).toBe('')
  })

  it('survives a door that yielded nothing', () => {
    const input = toResolveInput({ ...answers, doorText: '' })

    expect(input.source.one_liner).toBe('')
    expect(input.brand.proof_point).toBe('')
    expect(input.source.name).toBe('Rolling Pin Bakehouse')
  })

  it('never emits an empty name, which the schema rejects', () => {
    const input = toResolveInput({ ...answers, name: '   ' })

    expect(input.source.name.length).toBeGreaterThan(0)
  })
})
