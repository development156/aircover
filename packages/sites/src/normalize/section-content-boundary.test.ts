import { describe, it, expect } from 'vitest'
import type { SectionKind } from '@sahoda/shared'
import { normalizeSection, ROOT_DROPPED } from './section-content'

const SORT = 0

describe('normalizeSection — an unusable bag', () => {
  it('reports the whole bag as dropped when a contact section survives a non-object raw', () => {
    const result = normalizeSection('contact', 'garbage', SORT)

    expect(result?.section.section).toEqual({ kind: 'contact', content: {} })
    expect(result?.dropped).toEqual([ROOT_DROPPED])
  })

  it('reports the whole bag when raw is an array, because array entries are unreachable', () => {
    const result = normalizeSection('contact', [{ headline: 'X' }], SORT)

    expect(result?.dropped).toEqual([ROOT_DROPPED])
  })

  it('reports nothing for a null bag, because absent copy was never lost', () => {
    const result = normalizeSection('contact', null, SORT)

    expect(result?.dropped).toEqual([])
  })

  it('reports nothing for an undefined bag', () => {
    const result = normalizeSection('contact', undefined, SORT)

    expect(result?.dropped).toEqual([])
  })
})

describe('normalizeSection — an out-of-union kind', () => {
  it('returns null instead of throwing, because kind arrives from an untyped db column', () => {
    const kind = 'gallery' as SectionKind

    expect(() => normalizeSection(kind, { headline: 'H' }, SORT)).not.toThrow()
    expect(normalizeSection(kind, { headline: 'H' }, SORT)).toBeNull()
  })

  it('never returns undefined, so a `result === null` caller cannot dereference it', () => {
    const kind = 'gallery' as SectionKind

    expect(normalizeSection(kind, { headline: 'H' }, SORT)).not.toBeUndefined()
  })

  /*
   * These five names resolve to truthy non-array values through `Object.prototype`, so a
   * `KNOWN_KEYS[kind] === undefined` guard does not fire for them and `known.includes` throws —
   * one bad `site_sections.kind` text value taking down the whole draft build. `'gallery'` above
   * exercises only the branch that already worked.
   */
  const PROTOTYPE_KINDS = [
    'constructor',
    'toString',
    '__proto__',
    'valueOf',
    'hasOwnProperty',
  ] as const

  for (const name of PROTOTYPE_KINDS) {
    it(`drops the section for kind '${name}' instead of throwing off the prototype chain`, () => {
      const kind = name as SectionKind

      expect(() => normalizeSection(kind, { headline: 'Hi' }, SORT)).not.toThrow()
      expect(normalizeSection(kind, { headline: 'Hi' }, SORT)).toBeNull()
    })

    it(`drops kind '${name}' with a bag whose keys are all unknown, not just a headline`, () => {
      const kind = name as SectionKind

      expect(() => normalizeSection(kind, { items: [1, 2], junk: 'x' }, SORT)).not.toThrow()
      expect(normalizeSection(kind, { items: [1, 2], junk: 'x' }, SORT)).toBeNull()
    })
  }
})

describe('normalizeSection — prototype pollution', () => {
  const withPolluted = (key: string, value: unknown, run: () => void): void => {
    Object.defineProperty(Object.prototype, key, {
      value,
      configurable: true,
      enumerable: false,
      writable: true,
    })
    try {
      run()
    } finally {
      delete (Object.prototype as Record<string, unknown>)[key]
    }
  }

  it('never reads an inherited headline, because copy must come from raw alone', () => {
    withPolluted('headline', 'INJECTED', () => {
      expect(normalizeSection('contact', {}, SORT)?.section.section).toEqual({
        kind: 'contact',
        content: {},
      })
    })
  })

  it('never reads an inherited items list', () => {
    withPolluted('items', [{ title: 'INJECTED' }], () => {
      expect(normalizeSection('features', {}, SORT)).toBeNull()
    })
  })

  it('never reads an inherited item field', () => {
    withPolluted('body', 'INJECTED', () => {
      expect(
        normalizeSection('features', { items: [{ title: 'Keep' }] }, SORT)?.section.section,
      ).toEqual({ kind: 'features', content: { items: [{ title: 'Keep' }] } })
    })
  })

  /*
   * A required item field read off the prototype is worse than an optional one: it turns an entry
   * that should have been discarded whole into a *kept* entry carrying fabricated copy, published
   * to a live customer domain. Each of the four required fields is pinned on its own.
   */
  it('never satisfies a required feature title from the prototype', () => {
    withPolluted('title', 'INJECTED', () => {
      const result = normalizeSection('features', { items: [{ body: 'x' }] }, SORT)

      expect(result).toBeNull()
    })
  })

  it('never satisfies a required testimonial quote from the prototype', () => {
    withPolluted('quote', 'INJECTED', () => {
      const result = normalizeSection('testimonials', { items: [{ author: 'Ana' }] }, SORT)

      expect(result).toBeNull()
    })
  })

  it('never satisfies a required faq question from the prototype', () => {
    withPolluted('q', 'INJECTED', () => {
      const result = normalizeSection('faq', { items: [{ a: 'An answer' }] }, SORT)

      expect(result).toBeNull()
    })
  })

  it('never satisfies a required faq answer from the prototype', () => {
    withPolluted('a', 'INJECTED', () => {
      const result = normalizeSection('faq', { items: [{ q: 'A question?' }] }, SORT)

      expect(result).toBeNull()
    })
  })
})
