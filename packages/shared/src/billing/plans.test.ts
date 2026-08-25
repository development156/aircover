import { describe, it, expect } from 'vitest'
import { PLAN_CATALOG, getEntitlements } from './plans'

describe('plan catalog', () => {
  it('has all four plans with the business model deck monthly grants', () => {
    expect(PLAN_CATALOG.free.monthlyCredits).toBe(100)
    expect(PLAN_CATALOG.starter.monthlyCredits).toBe(1500)
    expect(PLAN_CATALOG.growth.monthlyCredits).toBe(4000)
    expect(PLAN_CATALOG.agency.monthlyCredits).toBe(12000)
  })

  /**
   * Prices were unpinned until 2026-08-24, so the reprice that quadrupled Starter
   * could have landed with no test going red. A catalog whose GRANTS are asserted
   * and whose PRICES are not is guarding the cheaper half of the same row.
   */
  it('charges the deck prices', () => {
    expect(PLAN_CATALOG.starter.priceInr).toBe(1999)
    expect(PLAN_CATALOG.growth.priceInr).toBe(3999)
    expect(PLAN_CATALOG.agency.priceInr).toBe(7999)
  })

  /**
   * There is ONE price per plan and it is in rupees. `priceUsd` was a second
   * hand-set price that drifted 17 to 19 percent away from what the rupee price
   * converted to; it is now a live approximation in `currency.ts`.
   *
   * Asserted rather than assumed, because the tempting "fix" for a missing
   * dollar figure is to add the field back, and a second stored price is the
   * defect, not the absence of one.
   */
  it('stores no second currency', () => {
    for (const plan of Object.values(PLAN_CATALOG)) {
      expect(plan).not.toHaveProperty('priceUsd')
    }
  })

  /**
   * The id is a stored `plan_id` on live subscription rows; the name is what the
   * customer reads. The deck renamed only the second, so this asserts they DISAGREE
   * on purpose — otherwise a well-meaning tidy-up renames the id to match the label
   * and orphans every existing subscription.
   */
  it('shows Studio while still storing the agency id', () => {
    expect(PLAN_CATALOG.agency.id).toBe('agency')
    expect(PLAN_CATALOG.agency.name).toBe('Studio')
  })

  it('getEntitlements returns the plan limits', () => {
    expect(getEntitlements('free').channels).toBe(2)
    expect(getEntitlements('free').loopLevel).toBe(1)
    expect(getEntitlements('starter').twinSize).toBe(25)
    expect(getEntitlements('growth').loopLevel).toBe(3)
    expect(getEntitlements('agency').sites).toBe(10)
    expect(getEntitlements('agency').channels).toBe(12)
  })

  /**
   * Price and grant move together, so a reprice that edits one and forgets the other
   * is the defect this catches. Ordered by price, credits must never go backwards.
   */
  it('never grants fewer credits for more money', () => {
    const paid = Object.values(PLAN_CATALOG)
      .filter((p) => p.priceInr > 0)
      .sort((a, b) => a.priceInr - b.priceInr)

    for (let i = 1; i < paid.length; i += 1) {
      expect(paid[i]!.monthlyCredits).toBeGreaterThan(paid[i - 1]!.monthlyCredits)
    }
  })
})
