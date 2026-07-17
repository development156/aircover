import { describe, it, expect } from 'vitest'
import { PRICING, creditCost } from './pricing'

describe('pricing', () => {
  it('parses the config top-level shape', () => {
    expect(PRICING.rollover_cap_x).toBe(2)
    expect(PRICING.perf_reward.per_post).toBe(2)
    expect(PRICING.perf_reward.monthly_cap_pct).toBe(10)
    expect(PRICING.perf_reward.lifetime_milestone_cap).toBe(20)
  })

  it('creditCost returns the configured unit price', () => {
    expect(creditCost('caption_rewrite')).toBe(1)
    expect(creditCost('post_variants')).toBe(3)
    expect(creditCost('twin_preflight')).toBe(4)
    expect(creditCost('loop_cycle')).toBe(20)
    expect(creditCost('brand_research')).toBe(50)
    expect(creditCost('site_generate')).toBe(100)
  })

  it('creditCost multiplies by units (partial-batch charging)', () => {
    expect(creditCost('post_variants', 2)).toBe(6)
    expect(creditCost('caption_rewrite', 0)).toBe(0)
  })

  it('every configured action is a positive number', () => {
    const entries = Object.entries(PRICING.actions)
    expect(entries.length).toBe(18)
    for (const [k, v] of entries) {
      expect(v, k).toBeGreaterThan(0)
    }
  })
})
