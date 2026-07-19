import { describe, it, expect } from 'vitest'
import { normalizeSection } from './section-content'

const SORT = 0

describe('normalizeSection — envelope', () => {
  it('passes the caller-assigned sort through untouched, because ordering is the mapper’s job', () => {
    const result = normalizeSection('hero', { headline: 'H' }, 7)

    expect(result?.section.sort).toBe(7)
  })

  it('preserves the original bag on raw for debugging what the model actually sent', () => {
    const raw = { headline: 'H', tagline: 'junk' }

    const result = normalizeSection('hero', raw, SORT)

    expect(result?.section.raw).toEqual({ headline: 'H', tagline: 'junk' })
  })

  it('exposes an empty raw bag when the model sent a non-object, never undefined', () => {
    const result = normalizeSection('contact', 'garbage', SORT)

    expect(result?.section.raw).toEqual({})
  })
})
