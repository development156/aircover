import { describe, expect, test } from 'vitest'

import { ALLOWED_IMAGE_MODELS } from '@sahoda/mesh'
import { ImageGenerateInputSchema } from '@sahoda/shared'
import { IMAGE_TIER_ACTION, MESH_TASK_ACTION, creditCost } from '@sahoda/shared'

import {
  STUDIO_MODELS,
  defaultModelId,
  describeModelBlock,
  describeModelBlockFor,
  imageActionFor,
  imageTierFor,
  modelById,
  routedModels,
  unroutedModels,
} from './models'

/**
 * THE CATALOGUE, AND THE PROMISES ON IT.
 *
 * Every figure here came from docs/43 §3, which was fetched from OpenRouter and
 * put through an adversarial refutation pass that threw out 26 claims. These
 * tests do not re-verify the prices, which no unit test can. They guard the
 * things a wrong catalogue does to a person: offering a model that cannot be
 * reached, or claiming a capability the rules do not actually grant.
 */

describe('what is on offer', () => {
  /**
   * THE ONE THAT MATTERS. A model listed as available that the router cannot
   * address would take somebody's credits for a call that cannot be made.
   */
  test('the default is a model we can actually reach', () => {
    expect(modelById(defaultModelId())?.routed).toBe(true)
  })

  test('something is reachable at all, or the Studio cannot draw', () => {
    expect(routedModels().length).toBeGreaterThan(0)
  })

  test('every model has a label that is not its id', () => {
    for (const model of STUDIO_MODELS) {
      expect(model.label, model.id).not.toContain('/')
      expect(model.label, model.id).not.toBe(model.id)
    }
  })

  /**
   * "gemini-2.5-flash-image" tells a shop owner nothing. Each card has to lead
   * with what they would USE it for.
   */
  test('every model says what it is good at, in a reader’s terms', () => {
    for (const model of STUDIO_MODELS) {
      expect(model.goodAt.length, model.id).toBeGreaterThan(30)
      expect(model.goodAt, model.id).not.toMatch(
        /token|endpoint|api|latency|p50|checkpoint|inference/i,
      )
    }
  })

  test('the id never appears in anything a person reads', () => {
    for (const model of STUDIO_MODELS) {
      const read = [model.label, model.goodAt, model.unlocks ?? '', model.costNote].join(' ')
      expect(read, model.id).not.toContain(model.id)
    }
  })
})

describe('what choosing one unlocks', () => {
  /**
   * RETARGETED, and the old version is why the false claim shipped.
   *
   * It let any model with `maxPerPress > 1` say "in one go, all matching",
   * because it checked the sentence against the PROVIDER's ability. That is the
   * wrong side of the contract: `ImageGenerateInputSchema` carries no count and
   * `ImageGenerateOutput` returns one picture, so no card may promise a set
   * however many the model could draw. Bound to the schema, so it flips by
   * itself the day the capability lands.
   */
  test('no card promises a set while the mesh can only ask for one picture', () => {
    const canAskForASet = 'count' in ImageGenerateInputSchema.shape
    expect(canAskForASet).toBe(false)

    for (const model of STUDIO_MODELS) {
      expect(model.unlocks ?? '', model.id).not.toMatch(/in one go|all matching/i)
    }
  })

  /**
   * RETARGETED. This pinned a model no longer in the catalogue. The claim it was
   * making is the one that still matters, now checked over EVERY model: a model
   * that draws one picture must not say "in one go", because that is a promise
   * `modes.ts` would refuse to keep.
   */
  test('a model that draws one at a time never claims to draw a set', () => {
    for (const model of STUDIO_MODELS) {
      if (model.maxPerPress > 1) continue
      expect(model.unlocks ?? '', model.id).not.toMatch(/in one go|all matching/i)
    }
  })

  /**
   * Numbers named in the copy must be the numbers the rules use. If the two
   * ever drift, the copy is the lie and this catches it.
   */
  test('a number in the unlocks line is a number the model actually carries', () => {
    for (const model of STUDIO_MODELS) {
      if (model.unlocks === null) continue
      const numbers = (model.unlocks.match(/\d+/g) ?? []).map(Number)
      for (const n of numbers) {
        expect([model.maxPerPress, model.maxReferences], `${model.id} claims ${n}`).toContain(n)
      }
    }
  })

  test('every model looks at at least one picture and draws at least one', () => {
    for (const model of STUDIO_MODELS) {
      expect(model.maxPerPress, model.id).toBeGreaterThanOrEqual(1)
      expect(model.maxReferences, model.id).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('refusing a model', () => {
  /**
   * RETARGETED, and the FUNCTION was split so this could stay real. Every model
   * is routed now, so no id reaches this branch. It is not dead code:
   * `routed: false` is how a model is added before its route exists, which is
   * the state the field was created for. Exercised over a synthetic model so it
   * cannot rot between now and then.
   */
  test('an unreachable model is refused, and says it is not a fault of theirs', () => {
    const said = describeModelBlockFor({ ...STUDIO_MODELS[0]!, label: 'Something', routed: false })
    expect(said).toMatch(/cannot draw/i)
    expect(said).toContain('Something')
  })

  test('a model that does not exist is refused rather than silently defaulted', () => {
    expect(describeModelBlock('some/model-nobody-has')).toMatch(/not a model/i)
  })

  test('a reachable model is not refused', () => {
    expect(describeModelBlock(defaultModelId())).toBeNull()
  })

  test('every refusal names what to do next', () => {
    const said = [
      describeModelBlock('some/model-nobody-has'),
      describeModelBlockFor({ ...STUDIO_MODELS[0]!, routed: false }),
    ]
    for (const one of said) {
      expect(one, String(one)).toMatch(/pick one|waiting/i)
    }
  })

  test('the copy carries no em dash, which is the standing ruling for prose', () => {
    for (const model of STUDIO_MODELS) {
      const read = [model.label, model.goodAt, model.unlocks ?? '', model.costNote].join(' ')
      expect(read, model.id).not.toMatch(/[—–]/)
      expect(describeModelBlockFor({ ...model, routed: false }) ?? '').not.toMatch(/[—–]/)
    }
  })
})

describe('what this catalogue must NOT claim', () => {
  /**
   * Drawing, layers, annotation and masking are things THIS PRODUCT does, in
   * `draw-objects.ts`, before anything is sent. No image API delivers them.
   * Listing one as a model's feature would promise a capability that arrives
   * from our own code whichever model is chosen, and would go on promising it
   * after the model was swapped out.
   */
  test('no model claims a feature that is actually ours', () => {
    for (const model of STUDIO_MODELS) {
      const read = [model.goodAt, model.unlocks ?? ''].join(' ')
      expect(read, model.id).not.toMatch(/layer|annotat|mask|draw on|markup/i)
    }
  })
})

describe('the catalogue and the router agree', () => {
  /**
   * THE ONE THAT KEEPS THE TWO HALVES HONEST. The picker decides what somebody
   * may choose; `ALLOWED_IMAGE_MODELS` decides what the mesh will actually
   * address. A model in the picker but not the router spends a press on a call
   * that falls back to something else without saying so. A model in the router
   * but not the picker is dead weight nobody can reach.
   */
  test('every model on offer is one the mesh will address', () => {
    for (const model of STUDIO_MODELS) {
      expect(ALLOWED_IMAGE_MODELS, model.id).toContain(model.id)
    }
  })

  test('and every model the mesh addresses is one somebody can choose', () => {
    for (const id of ALLOWED_IMAGE_MODELS) {
      expect(
        STUDIO_MODELS.map((model) => model.id),
        id,
      ).toContain(id)
    }
  })

  test('the two lists are the same size, so neither can grow unnoticed', () => {
    expect(STUDIO_MODELS).toHaveLength(ALLOWED_IMAGE_MODELS.length)
  })

  /**
   * A model that is offered but not routed would be refused by the screen and
   * silently swapped by the router. With three models all reachable, there is
   * no such state, and this asserts it rather than assuming it.
   */
  test('all three are reachable, so nothing is offered that cannot be drawn', () => {
    expect(routedModels()).toHaveLength(STUDIO_MODELS.length)
    expect(unroutedModels()).toHaveLength(0)
  })
})

describe('one model for each kind of job', () => {
  test('there are exactly three, one per family', () => {
    expect(STUDIO_MODELS).toHaveLength(3)
    const families = STUDIO_MODELS.map((model) => model.id.split('/')[0])
    expect(new Set(families).size).toBe(3)
  })

  test('the families are the three that were asked for', () => {
    const ids = STUDIO_MODELS.map((model) => model.id).join(' ')
    expect(ids).toMatch(/openai\//)
    expect(ids).toMatch(/google\//)
    expect(ids).toMatch(/seedream/)
  })

  /**
   * MEASURED: `openai/gpt-image-1` draws 10 per request and takes 16
   * references, both of which docs/43 had left blank. If that number ever goes
   * back to 1 the "matching set" promise on its card becomes false.
   */
  test('a matching set is possible on more than one model', () => {
    expect(STUDIO_MODELS.filter((model) => model.maxPerPress > 1).length).toBeGreaterThan(1)
  })
})

describe('what each model costs the person', () => {
  /**
   * THE ONE THAT WAS MISSING. Every model was held and debited at the flat
   * everyday price, while the catalogue's own copy called two of them "billed
   * by what it draws" and "the dearest". The tier is what the hold is priced
   * by, so it is pinned per model rather than per family.
   *
   * MUTATION: set `tier: 'draft'` on gemini-3-pro-image in `models.ts` and the
   * second assertion goes red, which is the undercharge coming back.
   */
  test('the everyday model is a draft and the two billed by what they draw are finishes', () => {
    expect(imageTierFor('bytedance-seed/seedream-5-0-lite')).toBe('draft')
    expect(imageTierFor('google/gemini-3-pro-image')).toBe('finish')
    expect(imageTierFor('openai/gpt-image-1')).toBe('finish')
  })

  test('the pricing key is the shared map read through the tier, never a literal here', () => {
    for (const model of STUDIO_MODELS) {
      expect(imageActionFor(model.id), model.id).toBe(IMAGE_TIER_ACTION[model.tier])
    }
    expect(imageActionFor('google/gemini-3-pro-image')).toBe('image_premium')
    expect(imageActionFor('bytedance-seed/seedream-5-0-lite')).toBe(MESH_TASK_ACTION.image_generate)
  })

  test('a finish costs more than a draft, or the second tier is pointless', () => {
    const draft = imageActionFor('bytedance-seed/seedream-5-0-lite')
    const finish = imageActionFor('google/gemini-3-pro-image')
    if (draft === null || finish === null) throw new Error('a catalogue model has no price')
    expect(creditCost(finish)).toBeGreaterThan(creditCost(draft))
  })

  /**
   * An id that is not in the catalogue has no tier to price by. It is REFUSED
   * by `describeModelBlock` before any hold (the charge test proves the hold
   * never happens), so the answer here is the absence, not a guessed price
   * that a hand-made request could be sold at.
   */
  test('an unknown id has no tier and no price', () => {
    expect(imageTierFor('nobody/made-this-up')).toBeNull()
    expect(imageActionFor('nobody/made-this-up')).toBeNull()
  })

  test('the default model is the draft tier, so the first press is the cheap one', () => {
    expect(imageTierFor(defaultModelId())).toBe('draft')
  })
})
