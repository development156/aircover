import { describe, it, expect } from 'vitest'
import { normalizeSection, rawUnstorable, ROOT_DROPPED } from './section-content'

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

  it('stores a copy of the bag, so a caller mutating its input cannot rewrite the section', () => {
    // `toEqual` on the line above cannot see aliasing: it passes whether `raw` is the
    // caller's own object or a copy of it. This is the assertion that picks a side.
    const raw: Record<string, unknown> = { headline: 'H', nested: { keep: 'yes' } }

    const result = normalizeSection('contact', raw, SORT)
    raw.headline = 'MUTATED'
    ;(raw.nested as Record<string, unknown>).keep = 'MUTATED'
    raw.added = 'MUTATED'

    expect(result?.section.raw).not.toBe(raw)
    expect(result?.section.raw).toEqual({ headline: 'H', nested: { keep: 'yes' } })
  })

  it('keeps every storable key when the bag carries a value no jsonb column could hold', () => {
    const raw = { headline: 'H', onClick: () => undefined }

    const result = normalizeSection('contact', raw, SORT)

    expect(result?.section.raw).toEqual({ headline: 'H' })
    expect(result?.dropped).toEqual([rawUnstorable(1), 'onClick'])
  })

  /*
   * `JSON.parse` produces an own `__proto__` key, and model output is JSON. In the per-key
   * rebuild an assignment (`clone[key] = …`) would run the inherited setter instead: the key
   * would create no own property, silently vanishing from `raw` without being counted as
   * unstorable, and it would swap the clone's prototype on the way out.
   */
  it('keeps a literal __proto__ key as an own property in the rebuilt bag', () => {
    const raw = JSON.parse('{"headline":"H","__proto__":{"polluted":1}}') as Record<string, unknown>
    raw.onClick = (): undefined => undefined

    const result = normalizeSection('contact', raw, SORT)
    const stored = result?.section.raw as Record<string, unknown>

    expect(Object.hasOwn(stored, '__proto__')).toBe(true)
    expect(Object.getPrototypeOf(stored)).toBe(Object.prototype)
    expect(Object.keys(stored).sort()).toEqual(['__proto__', 'headline'])
    // Exactly one key was truly unstorable — the function. The count must not absorb __proto__.
    expect(result?.dropped).toEqual([rawUnstorable(1), '__proto__', 'onClick'])
  })

  it('exposes an empty raw bag when the model sent a non-object, never undefined', () => {
    const result = normalizeSection('contact', 'garbage', SORT)

    expect(result?.section.raw).toEqual({})
    // The empty bag is a placeholder, not a clean read: the whole input was discarded and
    // `dropped` has to say so. Asserting only on `raw` once pinned that silence as correct.
    expect(result?.dropped).toEqual([ROOT_DROPPED])
  })
})
