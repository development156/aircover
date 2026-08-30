import { describe, expect, test } from 'vitest'

import { credits, describeInsufficient } from './refusal-copy'

/**
 * THE REFUSAL A FUNDED WORKSPACE NEVER SEES.
 *
 * Every case below is one somebody in trouble meets and a tester does not.
 */
describe('credits', () => {
  /** THE ONE THAT MATTERS. "needs 1 credits" shipped once already. */
  test('one is singular', () => {
    expect(credits(1)).toBe('1 credit')
  })

  test('everything else is plural, including zero', () => {
    expect(credits(0)).toBe('0 credits')
    expect(credits(2)).toBe('2 credits')
    expect(credits(11)).toBe('11 credits')
  })
})

describe('describeInsufficient', () => {
  test('states both numbers, because a shortfall you cannot size is not actionable', () => {
    const said = describeInsufficient({ required: 6, available: 2 })
    expect(said).toContain('6 credits')
    expect(said).toContain('2 credits')
  })

  /**
   * The fear at this moment is having paid for nothing. The hold was released
   * and the balance did not move, and silence on that reads as bad news.
   */
  test('says nothing was charged, because that is the fear', () => {
    expect(describeInsufficient({ required: 6, available: 0 })).toMatch(/nothing was charged/i)
  })

  test('a zero balance is stated rather than left out', () => {
    expect(describeInsufficient({ required: 6, available: 0 })).toContain('0 credits')
  })

  test('a shortfall of exactly one credit reads correctly', () => {
    expect(describeInsufficient({ required: 1, available: 0 })).toContain('needs 1 credit and')
  })

  test('names a remedy that works, and does not offer one that cannot', () => {
    const said = describeInsufficient({ required: 6, available: 1 })
    expect(said).toMatch(/top up/i)
    expect(said).not.toMatch(/try again|reload/i)
  })

  test('the copy carries no em dash, which is the standing ruling for prose', () => {
    expect(describeInsufficient({ required: 6, available: 1 })).not.toMatch(/[—–]/)
  })
})
