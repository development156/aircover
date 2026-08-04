import { describe, it, expect } from 'vitest'
import { PLAN_CATALOG, getEntitlements } from './plans'

describe('plan catalog', () => {
  it('has all four plans with PRD §7.1 monthly grants', () => {
    expect(PLAN_CATALOG.free.monthlyCredits).toBe(100)
    expect(PLAN_CATALOG.starter.monthlyCredits).toBe(1500)
    expect(PLAN_CATALOG.growth.monthlyCredits).toBe(5000)
    expect(PLAN_CATALOG.agency.monthlyCredits).toBe(15000)
  })

  it('getEntitlements returns the plan limits', () => {
    expect(getEntitlements('free').channels).toBe(2)
    expect(getEntitlements('free').loopLevel).toBe(1)
    expect(getEntitlements('starter').twinSize).toBe(25)
    expect(getEntitlements('growth').loopLevel).toBe(3)
    expect(getEntitlements('agency').sites).toBe(10)
  })
})
