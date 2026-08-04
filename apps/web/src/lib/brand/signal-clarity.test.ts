import { DEMO_FALLBACK_PAYLOAD, type BrandMemoryPayload } from '@sahoda/shared'
import { describe, expect, test } from 'vitest'

import { signalClarityPercent } from './signal-clarity'

// Exactly 17 tracked leaf fields across the payload (4 voice + 3 brand_persona +
// 4 customer_persona + 3 hook + 1 taboo + 2 alignment) — the numbers below are
// derived by hand against that count so the percentages are exact, not fuzzy.
const SPARSE: BrandMemoryPayload = {
  voice: { descriptor: 'Warm', formality_label: '', signature_phrases: [], banned_phrases: [] },
  brand_persona: { archetype: '', one_liner: '', core_values: [] },
  customer_persona: {
    one_liner: '',
    primary_pain_point: '',
    primary_fear: '',
    desired_identity: '',
  },
  hook: { core_promise: '', primary_emotion: '', sample_hooks: [] },
  taboo: { red_lines: [] },
  alignment: { signal_lock: 'weak', note: '' },
}

const BLANK: BrandMemoryPayload = {
  voice: { descriptor: '', formality_label: '', signature_phrases: [], banned_phrases: [] },
  brand_persona: { archetype: '', one_liner: '', core_values: [] },
  customer_persona: {
    one_liner: '',
    primary_pain_point: '',
    primary_fear: '',
    desired_identity: '',
  },
  hook: { core_promise: '', primary_emotion: '', sample_hooks: [] },
  taboo: { red_lines: [] },
  alignment: { signal_lock: 'weak', note: '' },
}

describe('signalClarityPercent', () => {
  test('returns 100 when every field on a fully-resolved payload is filled', () => {
    expect(signalClarityPercent(DEMO_FALLBACK_PAYLOAD)).toBe(100)
  })

  test('counts only the two filled leaves (descriptor + signal_lock) out of 17', () => {
    expect(signalClarityPercent(SPARSE)).toBe(12) // round(2/17 * 100) = 11.76 -> 12
  })

  test('never returns 0 — signal_lock is always a non-empty enum value', () => {
    expect(signalClarityPercent(BLANK)).toBe(6) // round(1/17 * 100) = 5.88 -> 6
  })

  test('treats a non-empty array leaf as filled regardless of its item contents', () => {
    const withBlankItemsArray: BrandMemoryPayload = {
      ...BLANK,
      voice: { ...BLANK.voice, signature_phrases: ['', '', ''] },
    }
    // signature_phrases (length 3, blank items) + signal_lock = 2 filled of 17
    expect(signalClarityPercent(withBlankItemsArray)).toBe(12)
  })
})
