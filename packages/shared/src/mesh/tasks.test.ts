import { describe, it, expect } from 'vitest'
import {
  IMAGE_TIER_ACTION,
  MESH_TASK_ACTION,
  MeshTaskNameSchema,
  PlanWeekOutputSchema,
  SiteGenerateOutputSchema,
} from './tasks'
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

  it('the refusal gate has no pricing key, and the absence is deliberate', () => {
    // gate_classify is the eighth MeshTaskName and the only unpriced one: it is
    // a condition of publishing, not an action anyone chose. A price here would
    // be a real number a future withCredits wrapper could charge, which would
    // bill people for being refused. The count guard above stays at 7 for
    // exactly this reason, so this asserts the cause rather than the symptom.
    expect(MeshTaskNameSchema.options).toContain('gate_classify')
    expect(Object.keys(MESH_TASK_ACTION)).not.toContain('gate_classify')
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
    // cheaper choice is deliberate: a caller that names no tier (`posts-image.ts`
    // offers no model choice) has asked for "an image", and charging it for a
    // tier nobody chose would be an overcharge. The premium price is reached
    // ONLY through `IMAGE_TIER_ACTION`, from a tier the person picked and saw the
    // price of, which the test below pins.
    expect(MESH_TASK_ACTION.image_generate).toBe('image_standard')
    expect(PRICING.actions[MESH_TASK_ACTION.image_generate]).toBe(6)
  })

  /**
   * MUTATION: point `finish` at 'image_standard' (or `draft` at 'image_premium')
   * and this goes red. Without it the Studio sold every picture from the two
   * models "billed by what they draw" at the flat 6 credits, below what the
   * provider charged for them, because nothing ever read the premium key.
   */
  it('the premium image price has its own key, reached by product tier', () => {
    // The draft tier IS the everyday task price, so a plain `image_generate`
    // and a draft-tier Studio press cost the same and never drift apart.
    expect(IMAGE_TIER_ACTION.draft).toBe(MESH_TASK_ACTION.image_generate)
    expect(IMAGE_TIER_ACTION.finish).toBe('image_premium')
    // Both are real prices, and a finish costs more than a draft: the whole
    // reason two keys exist. A config that inverted them would pass the first
    // two lines and still be wrong.
    const draft = PRICING.actions[IMAGE_TIER_ACTION.draft]
    const finish = PRICING.actions[IMAGE_TIER_ACTION.finish]
    expect(draft).toBeTypeOf('number')
    expect(finish).toBeTypeOf('number')
    expect(finish!).toBeGreaterThan(draft!)
    // Exactly the two product tiers, no third price a screen could not name.
    expect(Object.keys(IMAGE_TIER_ACTION).sort()).toEqual(['draft', 'finish'])
  })
})
