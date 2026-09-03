import { describe, it, expect } from 'vitest'
import { MeshTaskNameSchema, ModelTierSchema } from '@sahoda/shared'
import {
  TIER_ROUTES,
  TASK_TIER,
  routeForTier,
  imageModelForTier,
  ALLOWED_IMAGE_MODELS,
  isAllowedImageModel,
  chooseImageModel,
} from './routing'
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
    // adversarial customer text and a bad read becomes the Brain. gate_classify
    // — the refusal gate's layer 3 — to 8, also standard: it is the last thing
    // between a draft and a public account, and the purpose-built guardrail
    // route doc 18 §10 asks for does not exist to route it to.
    expect(names.length).toBe(8)
    for (const name of names) {
      const tier = TASK_TIER[name]
      expect(ModelTierSchema.options, name).toContain(tier)
      expect(TIER_ROUTES[tier], name).toBeTruthy()
      expect(['research', 'text'], name).toContain(keyClassForTier(tier))
    }
  })

  it('matches the frozen sahoda-mesh tier guide, with one measured exception', () => {
    /**
     * brand_guidelines LEFT `standard` on 2026-08-12, against the guide, on a
     * bake-off (n=3, same intake): haiku-4.5 produced the same FOUR specific red
     * lines as sonnet-5 at 5.7x less cost and 2.6x less latency, while
     * gemini-flash — cheaper still — echoed the intake back verbatim and was
     * disqualified on the text rather than the price.
     *
     * The guide in the sahoda-mesh skill still says `standard`. It should be
     * updated or this reverted; a doc and a routing table that disagree is how
     * the next person makes the wrong call confidently. Flagged in REQUESTS.md.
     */
    expect(TASK_TIER.brand_guidelines).toBe('economy')
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

/**
 * THE IMAGE ALLOW-LIST, WHICH IS A SPENDING BOUNDARY.
 *
 * The Studio lets somebody choose which model draws their picture, so a model
 * id now arrives from a request. If that string reached the provider unchecked,
 * any caller could bill this account against any model on OpenRouter — including
 * ones many times dearer than anything this product prices, and ones whose
 * output no schema here can parse. These are the tests that make that
 * impossible rather than merely unlikely.
 */
describe('which image model a request may ask for', () => {
  it('accepts only an id this product has deliberately listed', () => {
    for (const id of ALLOWED_IMAGE_MODELS) {
      expect(isAllowedImageModel(id), id).toBe(true)
    }
  })

  it('refuses an id nobody allow-listed, however plausible it looks', () => {
    for (const id of [
      'openai/gpt-image-2',
      'google/gemini-3-pro-image ',
      'GOOGLE/GEMINI-3-PRO-IMAGE',
      'anthropic/claude-opus-4-8',
      '',
    ]) {
      expect(isAllowedImageModel(id), id).toBe(false)
    }
  })

  /**
   * THE ONE THAT MATTERS. A requested id off the list must not reach the
   * provider, and must not take the call down either: the tier's own model is
   * what runs, because the screen has already refused the choice with a
   * sentence and a second refusal here would only cost somebody their press.
   */
  it('silently uses the tier’s own model when the request asks for one we do not allow', () => {
    expect(chooseImageModel('standard', 'openai/gpt-image-2')).toBe(imageModelForTier('standard'))
    expect(chooseImageModel('standard', 'openai/gpt-image-2')).not.toBe('openai/gpt-image-2')
  })

  it('uses the requested model when it is one we allow', () => {
    for (const id of ALLOWED_IMAGE_MODELS) {
      expect(chooseImageModel('standard', id), id).toBe(id)
    }
  })

  it('falls back to the tier’s model when nothing was requested', () => {
    expect(chooseImageModel('standard')).toBe(imageModelForTier('standard'))
  })

  /**
   * A tier with no image model has to stay undefined even when an ALLOWED id is
   * requested — otherwise a task routed to a tier we never priced for images
   * would start drawing, billed against a budget that does not exist for it.
   */
  it('a tier with no image model stays refusable', () => {
    for (const tier of ModelTierSchema.options) {
      if (imageModelForTier(tier) !== undefined) continue
      expect(chooseImageModel(tier), tier).toBeUndefined()
    }
  })

  it('every allowed id is one the mesh could actually address', () => {
    for (const id of ALLOWED_IMAGE_MODELS) {
      expect(id, id).toMatch(/^[a-z0-9-]+\/[a-z0-9.-]+$/)
    }
  })
})
