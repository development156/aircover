import { describe, it, expect } from 'vitest'
import { MeshTaskNameSchema, ModelTierSchema } from '@sahoda/shared'
import { TIER_ROUTES, TASK_TIER, routeForTier, imageModelForTier } from './routing'
import { keyClassForTier } from './config'

describe('tier routing', () => {
  it('defines a primary + fallback model for every model tier', () => {
    for (const tier of ModelTierSchema.options) {
      const route = TIER_ROUTES[tier]
      expect(route.openRouter, tier).toBeTruthy()
      expect(route.openai, tier).toBeTruthy()
    }
  })

  it('routeForTier returns the tier route', () => {
    expect(routeForTier('standard')).toBe(TIER_ROUTES.standard)
  })

  it('routes OpenRouter primaries through the anthropic provider', () => {
    for (const tier of ModelTierSchema.options) {
      expect(TIER_ROUTES[tier].openRouter.startsWith('anthropic/'), tier).toBe(true)
    }
  })
})

describe('task → tier map', () => {
  it('assigns a tier to every Alpha mesh task, resolvable to a route and key class', () => {
    const names = MeshTaskNameSchema.options
    // Count guard: a new mesh task must be a deliberate decision here, not a
    // silent addition. image_generate brought it to 6; brand_extract — the URL
    // door's quarantined extractor — to 7, at standard tier because it reads
    // adversarial customer text and a bad read becomes the Brain.
    expect(names.length).toBe(7)
    for (const name of names) {
      const tier = TASK_TIER[name]
      expect(ModelTierSchema.options, name).toContain(tier)
      expect(TIER_ROUTES[tier], name).toBeTruthy()
      expect(['research', 'text'], name).toContain(keyClassForTier(tier))
    }
  })

  it('matches the frozen sahoda-mesh tier guide', () => {
    expect(TASK_TIER.brand_guidelines).toBe('standard')
    expect(TASK_TIER.caption_rewrite).toBe('economy')
    expect(TASK_TIER.content_variants).toBe('economy')
    expect(TASK_TIER.plan_week).toBe('standard')
    expect(TASK_TIER.site_generate).toBe('premium')
  })

  it('routes image_generate to an image model and the IMAGE key class', () => {
    // Its TIER_ROUTES entry exists (every tier has one) but is a CHAT pair and is
    // never used for this task — the model comes from IMAGE_ROUTES, and the key
    // from the image class, so image spend stays isolated from text spend.
    expect(TASK_TIER.image_generate).toBe('standard')
    expect(imageModelForTier(TASK_TIER.image_generate)).toBeTruthy()
  })
})
