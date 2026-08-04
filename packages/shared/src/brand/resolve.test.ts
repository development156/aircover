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
      expect(r.data.voice.formality).toBe(3)
      expect(r.data.voice.energy).toBe(3)
      expect(r.data.customer.pain).toBe('')
      expect(r.data.voice.never_use).toEqual([])
    }
  })

  it('rejects an empty source.name and out-of-range sliders', () => {
    expect(ResolveInputSchema.safeParse({ source: { name: '' } }).success).toBe(false)
    expect(
      ResolveInputSchema.safeParse({ source: { name: 'X' }, voice: { formality: 9 } }).success,
    ).toBe(false)
  })
})
