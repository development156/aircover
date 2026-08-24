import { describe, expect, test } from 'vitest'
import { cheapestPlanWithAtLeast } from '@sahoda/shared'

import { planLimitSentence } from './limit-copy'

/**
 * The copy is DERIVED from PLAN_CATALOG, so these tests are really about one
 * question: does the sentence name a plan the customer would actually have to buy?
 */

describe('planLimitSentence', () => {
  test('free/sites names Starter — the plan that actually has one — not Growth', () => {
    const sentence = planLimitSentence({
      dimension: 'sites',
      planId: 'free',
      limit: 0,
      currentUsage: 0,
    })

    expect(sentence).toBe("Sites are on Starter and above. Your Free plan doesn't include one.")
  })

  test('a used-up allowance states the numbers and the next plan up', () => {
    expect(
      planLimitSentence({ dimension: 'sites', planId: 'starter', limit: 1, currentUsage: 1 }),
    ).toBe("Your Starter plan includes 1 site and you're using 1. Growth includes 3.")

    expect(
      planLimitSentence({ dimension: 'channels', planId: 'free', limit: 2, currentUsage: 2 }),
    ).toBe("Your Free plan includes 2 channels and you're using 2. Starter includes 4.")
  })

  test('singular and plural follow the number, not the dimension', () => {
    expect(
      planLimitSentence({ dimension: 'channels', planId: 'starter', limit: 4, currentUsage: 4 }),
    ).toMatch(/includes 4 channels/)
    expect(
      planLimitSentence({ dimension: 'seats', planId: 'starter', limit: 1, currentUsage: 1 }),
    ).toMatch(/includes 1 seat and/)
  })

  test('the largest plan gets no invented upsell', () => {
    // Studio is the top of the catalog: there is no plan with 11 sites, so the
    // sentence must stop at the facts rather than point at something unbuyable.
    // The id stays `agency` while the customer-facing label is "Studio", so this
    // asserts the sentence carries the LABEL — a sentence naming a plan the
    // customer cannot find in the picker is its own defect.
    const sentence = planLimitSentence({
      dimension: 'sites',
      planId: 'agency',
      limit: 10,
      currentUsage: 10,
    })

    expect(sentence).toBe("Your Studio plan includes 10 sites and you're using 10.")
    expect(cheapestPlanWithAtLeast('sites', 11)).toBeNull()
  })
})

describe('cheapestPlanWithAtLeast', () => {
  test('picks by price, and asks for one MORE than is in use', () => {
    expect(cheapestPlanWithAtLeast('sites', 1)?.id).toBe('starter')
    expect(cheapestPlanWithAtLeast('sites', 2)?.id).toBe('growth')
    expect(cheapestPlanWithAtLeast('sites', 4)?.id).toBe('agency')
    expect(cheapestPlanWithAtLeast('channels', 3)?.id).toBe('starter')
  })

  test('level dimensions read correctly too — >= is the right test for a max level', () => {
    expect(cheapestPlanWithAtLeast('loopLevel', 3)?.id).toBe('growth')
  })
})
