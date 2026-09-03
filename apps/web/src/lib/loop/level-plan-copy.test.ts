import { describe, expect, it } from 'vitest'
import { PLAN_CATALOG } from '@sahoda/shared'

import { LEVEL_EVERY_PLAN_ALLOWS, levelPlanSentence } from './level-plan-copy'

describe('the plan sentence for a rung of the dial', () => {
  it('names the rung, the cheapest plan that reaches it, and how far the current plan goes', () => {
    // Derived, not typed: Starter reaches L2 and Growth is the cheapest with L3.
    expect(levelPlanSentence({ level: 3, planId: 'starter', limit: 2 })).toBe(
      'Autopilot is on Growth and above. Your Starter plan goes up to Approve to publish.',
    )
    expect(levelPlanSentence({ level: 2, planId: 'free', limit: 1 })).toBe(
      'Approve to publish is on Starter and above. Your Free plan goes up to Draft.',
    )
  })

  it('carries no dash inside a sentence and makes no charge claim', () => {
    const s = levelPlanSentence({ level: 3, planId: 'free', limit: 1 })
    expect(s).not.toMatch(/[–—]/)
    expect(s).not.toMatch(/charg/i)
  })

  it('the ungated floor is the lowest loopLevel any plan grants, read off the catalog', () => {
    const lowest = Math.min(...Object.values(PLAN_CATALOG).map((p) => p.limits.loopLevel))
    expect(LEVEL_EVERY_PLAN_ALLOWS).toBe(lowest)
  })
})
