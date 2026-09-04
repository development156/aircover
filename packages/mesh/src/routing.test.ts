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
import { brandExtractTask } from './tasks/brand-extract'
import { brandGuidelinesTask } from './tasks/brand-guidelines'
import { captionRewriteTask } from './tasks/caption-rewrite'
import { contentVariantsTask } from './tasks/content-variants'
import { gateClassifyTask } from './tasks/gate-classify'
import { imageGenerateDef } from './tasks/image-generate'
import { planWeekTask } from './tasks/plan-week'
import { siteGenerateTask } from './tasks/site-generate'

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

  it('matches the frozen sahoda-mesh tier guide', () => {
    /**
     * THIS ASSERTION USED TO PIN `economy` FOR brand_guidelines, AND THAT WAS A
     * TEST PINNING A VALUE NOTHING RAN.
     *
     * A bake-off on 2026-08-12 (n=3, same intake) chose haiku-4.5 over sonnet-5:
     * the same FOUR specific red lines at 5.7x less cost and 2.6x less latency,
     * with gemini-flash disqualified on the text (it echoed the intake) rather
     * than on price. That conclusion was written into `TASK_TIER` — and
     * `TASK_TIER` is read by nothing at runtime.
     *
     * MEASURED 2026-09-03: `MeshTaskDef.tier` is the routing source, and
     * `tasks/brand-guidelines.ts` had said `standard` since it was created. The
     * saving went untaken for three weeks while the guide, the table and the
     * runtime disagreed three ways.
     *
     * APPLIED 2026-09-04: the task definition moved to `economy` and this line
     * moved with it. The pair proved itself in the process — changing only the
     * definition made `agrees with every task definition` fail by name, which is
     * exactly the drift that hid the problem for three weeks.
     */
    expect(TASK_TIER.brand_guidelines).toBe('economy')
    expect(TASK_TIER.caption_rewrite).toBe('economy')
    expect(TASK_TIER.content_variants).toBe('economy')
    expect(TASK_TIER.plan_week).toBe('standard')
    expect(TASK_TIER.site_generate).toBe('premium')
  })

  it('agrees with every task definition, which is the tier that actually runs', () => {
    /**
     * THE GUARD THAT SHOULD HAVE EXISTED SINCE `TASK_TIER` DID.
     *
     * Two tables named the tier of every mesh task and only one of them was
     * read. `routing.ts`'s header says `MeshTaskDef.tier` is the source; the
     * `TASK_TIER` map thirty lines below it is exported, asserted, quoted in
     * comments — and consumed by nothing that makes a model call. They drifted
     * on brand_guidelines and no test could see it, because each side had a
     * test that only ever read its own side.
     *
     * Deriving one from the other was the obvious fix and is the wrong one
     * here: importing eight task modules to build a map is how the posts screen
     * gained 10.9 kB when a shared list was re-exported (REQUESTS.md). Two
     * copies plus an assertion that they agree is the cheaper correct answer,
     * and it is the same shape `brand-readers.test.ts` uses.
     *
     * Listing all eight by hand is deliberate. A ninth task added to the schema
     * makes the count guard above fail, which sends somebody here.
     */
    const defs = [
      ['brand_guidelines', brandGuidelinesTask.def],
      ['brand_extract', brandExtractTask.def],
      ['gate_classify', gateClassifyTask.def],
      ['image_generate', imageGenerateDef],
      ['caption_rewrite', captionRewriteTask.def],
      ['content_variants', contentVariantsTask.def],
      ['plan_week', planWeekTask.def],
      ['site_generate', siteGenerateTask.def],
    ] as const

    expect(defs.length).toBe(MeshTaskNameSchema.options.length)
    for (const [name, def] of defs) {
      expect(
        TASK_TIER[name],
        `TASK_TIER says '${TASK_TIER[name]}' for ${name}; the task definition, which is ` +
          `what routes the call, says '${def.tier}'. The definition wins — fix the table, ` +
          `or move both deliberately.`,
      ).toBe(def.tier)
    }
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
