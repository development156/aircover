import { describe, it, expect } from 'vitest'
import { BrandMemoryPayloadSchema, ResolveInputSchema, DEMO_FALLBACK_PAYLOAD } from './resolve'

describe('brand resolve contract', () => {
  it('DEMO_FALLBACK_PAYLOAD satisfies the payload schema', () => {
    expect(BrandMemoryPayloadSchema.safeParse(DEMO_FALLBACK_PAYLOAD).success).toBe(true)
  })

  it('enforces exactly 3 signature_phrases / core_values / sample_hooks', () => {
    const bad = {
      ...DEMO_FALLBACK_PAYLOAD,
      voice: { ...DEMO_FALLBACK_PAYLOAD.voice, signature_phrases: ['only', 'two'] },
    }
    expect(BrandMemoryPayloadSchema.safeParse(bad).success).toBe(false)
  })

  it('requires source.name but blanks never block elsewhere', () => {
    const r = ResolveInputSchema.safeParse({ source: { name: 'Chai & Chapters' } })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.customer.pain).toBe('')
      expect(r.data.voice.never_use).toEqual([])
    }
  })

  // INVERTED on 2026-08-12. This used to assert `formality === 3` / `energy === 3`
  // on a spark that answered neither. `brand_guidelines` serialises the whole
  // input, so those defaults reached the model as founder input — and the model
  // said so, crediting "mid-range formality/energy scores" in a resolve note.
  // The assertion is inverted rather than deleted so the reversal is on record.
  it('leaves an unanswered formality/energy slider ABSENT, never defaulted to 3', () => {
    const r = ResolveInputSchema.safeParse({ source: { name: 'Chai & Chapters' } })
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data.voice.formality).toBeUndefined()
    expect(r.data.voice.energy).toBeUndefined()
    // The objective is the PROMPT, not the parsed object: `undefined` and `null`
    // are both keys the model can read. Assert on what it is actually sent.
    const serialized = JSON.stringify(r.data)
    expect(serialized).not.toContain('formality')
    expect(serialized).not.toContain('energy')
  })

  it('still carries a slider the founder DID answer', () => {
    const r = ResolveInputSchema.safeParse({
      source: { name: 'X' },
      voice: { formality: 5, energy: 1 },
    })
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data.voice.formality).toBe(5)
    expect(JSON.stringify(r.data)).toContain('"formality":5')
  })

  it('rejects an empty source.name and out-of-range sliders', () => {
    expect(ResolveInputSchema.safeParse({ source: { name: '' } }).success).toBe(false)
    expect(
      ResolveInputSchema.safeParse({ source: { name: 'X' }, voice: { formality: 9 } }).success,
    ).toBe(false)
  })
})
