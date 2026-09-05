import { describe, expect, it } from 'vitest'

import { creditsForInr, inrForCredits, refuseTopUpCredits, TOP_UP } from './pricing'
import { topUpGrantKey } from './entries'

/**
 * THE RATE, AND THE THREE WAYS A QUANTITY CAN BE REFUSED.
 *
 * These are money rules, so each case states the CLAIM rather than the arithmetic:
 * what a customer is charged, what they get, and what the product will not sell.
 */
describe('what credits cost', () => {
  it('sells the configured pack at the configured price', () => {
    expect(inrForCredits(TOP_UP.credits_per_pack)).toBe(TOP_UP.inr_per_pack)
  })

  it('charges the same rate at every size — there is no bulk discount', () => {
    const rate = TOP_UP.inr_per_pack / TOP_UP.credits_per_pack
    for (const pack of TOP_UP.packs) {
      expect(inrForCredits(pack)).toBe(pack * rate)
    }
  })

  it('never quotes a fraction of a rupee, at any sellable step', () => {
    for (let credits = TOP_UP.min_credits; credits <= 20_000; credits += TOP_UP.step_credits) {
      expect(Number.isInteger(inrForCredits(credits))).toBe(true)
    }
  })

  it('rounds credits DOWN for a rupee amount, never up', () => {
    // Half a step of rupees must not buy a whole step of credits.
    const halfStep = inrForCredits(TOP_UP.step_credits) / 2
    expect(creditsForInr(TOP_UP.inr_per_pack + halfStep)).toBeLessThan(
      TOP_UP.credits_per_pack + TOP_UP.step_credits,
    )
  })
})

describe('what the product refuses to sell', () => {
  it('accepts the offered sizes', () => {
    for (const pack of TOP_UP.packs) expect(refuseTopUpCredits(pack)).toBeNull()
  })

  it('refuses below the minimum, above the maximum, and off the step', () => {
    expect(refuseTopUpCredits(TOP_UP.min_credits - TOP_UP.step_credits)).toBe('below-minimum')
    expect(refuseTopUpCredits(TOP_UP.max_credits + TOP_UP.step_credits)).toBe('above-maximum')
    expect(refuseTopUpCredits(TOP_UP.min_credits + 1)).toBe('not-a-step')
  })

  it('refuses anything that is not a whole number of credits', () => {
    for (const bad of [NaN, Infinity, 2000.5, '2000', null, undefined, {}]) {
      expect(refuseTopUpCredits(bad)).toBe('not-a-number')
    }
  })
})

describe('the key a bought pack is written under', () => {
  it('is the payment, so the same size bought twice lands twice', () => {
    expect(topUpGrantKey('sah_one')).not.toBe(topUpGrantKey('sah_two'))
  })

  it('is stable for one order, so a redelivered webhook replays', () => {
    expect(topUpGrantKey('sah_one')).toBe(topUpGrantKey('sah_one'))
  })
})
