import { describe, expect, test } from 'vitest'

import {
  STUDIO_MODELS,
  defaultModelId,
  describeModelBlock,
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
   * The "unlocks" line is a claim about a RULE. A model that says it draws a
   * matching set had better draw more than one picture per call, or the
   * sentence is selling something `modes.ts` will refuse.
   */
  test('anything claiming a matching set can really draw more than one at once', () => {
    for (const model of STUDIO_MODELS) {
      if (model.unlocks !== null && /in one go|matching/i.test(model.unlocks)) {
        expect(model.maxPerPress, model.id).toBeGreaterThan(1)
      }
    }
  })

  test('a model that unlocks nothing extra says nothing rather than inventing a benefit', () => {
    const everyday = modelById('google/gemini-2.5-flash-image')
    expect(everyday?.unlocks).toBeNull()
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
  test('an unreachable model is refused, and says it is not a fault of theirs', () => {
    const waiting = unroutedModels()[0]
    expect(waiting, 'no unrouted model to test').toBeTruthy()
    const said = describeModelBlock(waiting!.id)
    expect(said).toMatch(/cannot draw/i)
    expect(said).toContain(waiting!.label)
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
      describeModelBlock(unroutedModels()[0]!.id),
    ]
    for (const one of said) {
      expect(one, String(one)).toMatch(/pick one|waiting/i)
    }
  })

  test('the copy carries no em dash, which is the standing ruling for prose', () => {
    for (const model of STUDIO_MODELS) {
      const read = [model.label, model.goodAt, model.unlocks ?? '', model.costNote].join(' ')
      expect(read, model.id).not.toMatch(/[—–]/)
      expect(describeModelBlock(model.id) ?? '').not.toMatch(/[—–]/)
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
