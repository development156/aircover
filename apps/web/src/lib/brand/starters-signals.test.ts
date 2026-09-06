import { describe, expect, it } from 'vitest'

import type { BrandMemoryPayload } from '@sahoda/shared'

import { signalsForStarters } from './starters-signals'

const BRAIN: BrandMemoryPayload = {
  voice: {
    descriptor: 'Warm, direct',
    formality_label: 'Relaxed',
    signature_phrases: [],
    banned_phrases: [],
  },
  brand_persona: {
    archetype: 'Caregiver',
    one_liner: 'Dependable design partner.',
    core_values: [],
  },
  customer_persona: {
    one_liner: 'A busy founder.',
    primary_pain_point: '',
    primary_fear: '',
    desired_identity: '',
  },
  hook: { core_promise: 'Ship on time.', primary_emotion: 'Relief', sample_hooks: [] },
  taboo: { red_lines: [] },
  alignment: { signal_lock: 'moderate', note: '' },
}

describe('signalsForStarters', () => {
  it('reads six leaves into named signals', () => {
    const signals = signalsForStarters(BRAIN, undefined)
    const fields = signals.map((s) => s.field).sort()
    expect(fields).toEqual(
      ['audience', 'character', 'feeling', 'promise', 'voice', 'what the business is'].sort(),
    )
  })

  it('omits a blank leaf rather than inventing a value for it', () => {
    const thin: BrandMemoryPayload = {
      ...BRAIN,
      brand_persona: { ...BRAIN.brand_persona, one_liner: '' },
    }
    const signals = signalsForStarters(thin, undefined)
    expect(signals.find((s) => s.field === 'what the business is')).toBeUndefined()
  })

  it('reads a field as guessed when no field_meta confirms it', () => {
    const signals = signalsForStarters(BRAIN, undefined)
    expect(signals.every((s) => s.certainty === 'guessed')).toBe(true)
  })

  it('reads a field as confirmed when field_meta says a human agreed to it', () => {
    const signals = signalsForStarters(BRAIN, {
      'brand_persona.one_liner': { confirmed: true, source: 'model' },
    } as never)
    const one = signals.find((s) => s.field === 'what the business is')
    expect(one?.certainty).toBe('confirmed')
  })
})
