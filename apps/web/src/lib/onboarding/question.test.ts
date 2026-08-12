import { describe, expect, it } from 'vitest'

import { BUSINESS_MODELS, LOCALES, REGIMES, type Intake } from './intake'
import { questionFor, questionKey } from './question'
import { MODEL_FALLBACKS, QUESTIONS, type QuestionCopy } from './questions'

const ALL_COPY: [string, QuestionCopy][] = [
  ...Object.entries(QUESTIONS),
  ...Object.entries(MODEL_FALLBACKS).map(
    ([model, copy]) => [`fallback:${model}`, copy] as [string, QuestionCopy],
  ),
]

function textOf(copy: QuestionCopy): string {
  return `${copy.counterparty} ${copy.moment} ${copy.ask} ${copy.placeholder}`.toLowerCase()
}

describe('the three combinations the flow is specified around', () => {
  const SPECIFIED: Intake[] = [
    { model: 'local_presence', regime: 'food', locale: 'IN' },
    { model: 'service', regime: 'consumer', locale: 'IN' },
    { model: 'institution', regime: 'healthcare', locale: 'IN' },
  ]

  it.each(SPECIFIED)('$model x $regime has its own question', (intake) => {
    const question = questionFor(intake)

    // Without this, a later change to the fallback chain can quietly route one
    // of the three to a generic question and nothing else would notice.
    expect(question.isFallback).toBe(false)
    expect(question.key).toBe(questionKey(intake.model, intake.regime))
  })

  it('gives each of them a different moment', () => {
    const moments = SPECIFIED.map((intake) => questionFor(intake).moment)

    expect(new Set(moments).size).toBe(SPECIFIED.length)
  })

  it('names a concrete counterparty in each', () => {
    for (const intake of SPECIFIED) {
      const { counterparty } = questionFor(intake)

      expect(counterparty.length).toBeGreaterThan(10)
      // "A customer" is a category. "A regular who comes in every Saturday" is
      // a person, and only the second gets a true answer.
      expect(counterparty.split(/\s+/).length).toBeGreaterThanOrEqual(4)
    }
  })
})

describe('never ask for a policy', () => {
  // The failure this guards against is not a typo. It is the slow drift back
  // to "what are your brand guidelines?", which people answer with what they
  // think a brand is supposed to say.
  const BANNED = [
    'policy',
    'policies',
    'guideline',
    'guidelines',
    'principle',
    'principles',
    'your values',
    'core values',
    'mission statement',
    'code of conduct',
    'tone of voice',
    'brand voice',
    'your rules',
    'ethos',
    'brand standards',
  ]

  it.each(ALL_COPY)('%s uses no policy language', (_key, copy) => {
    const text = textOf(copy)

    for (const phrase of BANNED) {
      expect(text).not.toContain(phrase)
    }
  })

  it.each(ALL_COPY)('%s asks about refusing something', (_key, copy) => {
    expect(copy.ask.trim()).toMatch(/\?$/)
    expect(copy.ask.toLowerCase()).toMatch(/refuse|not\b|no\b/)
  })

  it.each(ALL_COPY)('%s puts them in a moment, not a survey', (_key, copy) => {
    expect(copy.moment.length).toBeGreaterThan(60)
    expect(copy.counterparty.length).toBeGreaterThan(10)
    expect(copy.placeholder.length).toBeGreaterThan(10)
  })
})

describe('coverage', () => {
  it('resolves every model x regime combination to a usable question', () => {
    for (const model of BUSINESS_MODELS) {
      for (const regime of REGIMES) {
        const question = questionFor({ model, regime, locale: 'IN' })

        expect(question.counterparty).toBeTruthy()
        expect(question.ask).toBeTruthy()
      }
    }
  })

  it('has a fallback for every model', () => {
    for (const model of BUSINESS_MODELS) {
      expect(MODEL_FALLBACKS[model]).toBeTruthy()
    }
  })

  it('keys every catalogue entry to a real model and regime', () => {
    // A typo in a key is invisible: the entry simply never resolves and the
    // fallback quietly answers for it forever.
    const valid = new Set(
      BUSINESS_MODELS.flatMap((model) => REGIMES.map((regime) => questionKey(model, regime))),
    )

    for (const key of Object.keys(QUESTIONS)) {
      expect(valid.has(key)).toBe(true)
    }
  })
})

describe('localisation', () => {
  it('leaves no unfilled token in any locale', () => {
    for (const model of BUSINESS_MODELS) {
      for (const regime of REGIMES) {
        for (const locale of LOCALES) {
          const question = questionFor({ model, regime, locale })

          expect(textOf(question)).not.toMatch(/\{[a-z]+\}/)
        }
      }
    }
  })

  it('puts the sum in the reader own currency', () => {
    const india = questionFor({ model: 'service', regime: 'finance', locale: 'IN' })
    const states = questionFor({ model: 'service', regime: 'finance', locale: 'US' })

    expect(india.moment).toContain('40,000')
    expect(states.moment).toContain('$900')
    expect(india.moment).not.toBe(states.moment)
  })

  it('does not change the question itself between locales', () => {
    // Locale colours the moment. It must not silently select a different
    // question — regime x model owns that, and only that.
    const india = questionFor({ model: 'local_presence', regime: 'food', locale: 'IN' })
    const britain = questionFor({ model: 'local_presence', regime: 'food', locale: 'GB' })

    expect(india.key).toBe(britain.key)
    expect(india.ask).toBe(britain.ask)
  })
})
