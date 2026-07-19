import { describe, it, expect } from 'vitest'
import type { SectionKind } from '@sahoda/shared'
import { normalizeSection } from './section-content'

const SORT = 0

/** A section the renderer could not show anything meaningful for is dropped, not faked. */
const UNSALVAGEABLE_CASES: Array<{ kind: SectionKind; raw: unknown; why: string }> = [
  { kind: 'hero', raw: {}, why: 'a hero with no headline has nothing to say' },
  { kind: 'hero', raw: { headline: '   ' }, why: 'a blank headline is the same as absent' },
  { kind: 'hero', raw: { headline: { deep: 'nope' } }, why: 'an object headline is not coercible' },
  {
    kind: 'offer',
    raw: { body: 'no headline here' },
    why: 'an offer with no headline has no name',
  },
  { kind: 'features', raw: { headline: 'Features' }, why: 'a feature list with no items is empty' },
  { kind: 'features', raw: { items: [] }, why: 'an explicitly empty list renders nothing' },
  {
    kind: 'testimonials',
    raw: { items: [{ author: 'Ria' }] },
    why: 'an author with no quote is empty',
  },
  {
    kind: 'faq',
    raw: { items: ['Is it fast?'] },
    why: 'a question with no answer renders nothing',
  },
  { kind: 'faq', raw: { items: 'Is it fast?' }, why: 'a lone string cannot become a q/a pair' },
  { kind: 'hero', raw: null, why: 'a null bag has no headline' },
  { kind: 'features', raw: 'not an object at all', why: 'a scalar bag yields no items' },
]

describe('normalizeSection — unsalvageable sections', () => {
  for (const testCase of UNSALVAGEABLE_CASES) {
    it(`returns null for a ${testCase.kind} because ${testCase.why}`, () => {
      expect(normalizeSection(testCase.kind, testCase.raw, SORT)).toBeNull()
    })
  }

  it('never drops a contact section, because the form itself is the content', () => {
    const result = normalizeSection('contact', { headline: 42.5, junk: ['x'] }, SORT)

    expect(result?.section.section).toEqual({ kind: 'contact', content: { headline: '42.5' } })
    expect(result?.dropped).toEqual(['junk'])
  })
})
