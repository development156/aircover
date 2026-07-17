import { describe, it, expect } from 'vitest'
import { MESH_TASK_ACTION, PlanWeekOutputSchema, SiteGenerateOutputSchema } from './tasks'
import { PRICING } from '../ledger/pricing'

describe('mesh task contracts', () => {
  it('every mesh task maps to a real pricing action', () => {
    const names = Object.keys(MESH_TASK_ACTION) as (keyof typeof MESH_TASK_ACTION)[]
    expect(names.length).toBe(5)
    for (const name of names) {
      const action = MESH_TASK_ACTION[name]
      expect(PRICING.actions[action], `${name} → ${action}`).toBeTypeOf('number')
    }
  })

  it('plan_week output requires exactly 5 briefs', () => {
    const brief = {
      title: 't',
      body: 'b',
      channels: ['x'],
      suggestedSlot: '2026-07-20T09:00:00Z',
    }
    expect(PlanWeekOutputSchema.safeParse({ briefs: Array(5).fill(brief) }).success).toBe(true)
    expect(PlanWeekOutputSchema.safeParse({ briefs: Array(4).fill(brief) }).success).toBe(false)
  })

  it('site_generate enforces the section-kind enum', () => {
    const page = { path: '/', title: 'Home' }
    expect(
      SiteGenerateOutputSchema.safeParse({
        pages: [{ ...page, sections: [{ kind: 'hero', content: {} }] }],
      }).success,
    ).toBe(true)
    expect(
      SiteGenerateOutputSchema.safeParse({
        pages: [{ ...page, sections: [{ kind: 'nope', content: {} }] }],
      }).success,
    ).toBe(false)
  })
})
