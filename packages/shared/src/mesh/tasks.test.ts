import { describe, it, expect } from 'vitest'
import { MESH_TASK_ACTION, PlanWeekOutputSchema, SiteGenerateOutputSchema } from './tasks'
import { PRICING } from '../ledger/pricing'

describe('mesh task contracts', () => {
  it('every mesh task maps to a real pricing action', () => {
    const names = Object.keys(MESH_TASK_ACTION) as (keyof typeof MESH_TASK_ACTION)[]
    // Count guard: a new mesh task must be a deliberate decision here, not a
    // silent addition. image_generate brought it to 6; brand_extract (the URL
    // door's quarantined extractor) to 7. brand_extract shares brand_research's
    // pricing key ON PURPOSE — the crawl is part of brand research, not a second
    // purchase, so one withCredits call covers crawl → extract → resolve.
    expect(names.length).toBe(7)
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

  it('prices image_generate at the standard tier, not the premium one', () => {
    // pricing.config.json carries image_standard (6) AND image_premium (12), and
    // this map is one-to-one, so the task name has to pick. Pinned because the
    // cheaper choice is deliberate: a customer who asked for "an image" and was
    // charged for a tier they never chose has been overcharged, and the reverse
    // never happens. A premium image is a SECOND task name once a UI exists to
    // choose it — never a runtime branch that makes the price invisible before
    // the click.
    expect(MESH_TASK_ACTION.image_generate).toBe('image_standard')
    expect(PRICING.actions[MESH_TASK_ACTION.image_generate]).toBe(6)
  })
})
