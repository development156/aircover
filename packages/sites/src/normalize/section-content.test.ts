import { describe, it, expect } from 'vitest'
import type { SectionKind } from '@sahoda/shared'
import { normalizeSection } from './section-content'

const SORT = 0

/** The model is advisory: a full, well-formed bag must survive byte-for-byte with nothing dropped. */
const HAPPY_CASES: Array<{ kind: SectionKind; raw: Record<string, unknown>; content: unknown }> = [
  {
    kind: 'hero',
    raw: {
      headline: 'Grow with Sahoda',
      subhead: 'Sites in minutes',
      ctaLabel: 'Start free',
      ctaHref: 'https://sahoda.site/start',
    },
    content: {
      headline: 'Grow with Sahoda',
      subhead: 'Sites in minutes',
      ctaLabel: 'Start free',
      ctaHref: 'https://sahoda.site/start',
    },
  },
  {
    kind: 'features',
    raw: {
      headline: 'What you get',
      items: [{ title: 'Fast', body: 'Ships in a minute' }, { title: 'Themed' }],
    },
    content: {
      headline: 'What you get',
      items: [{ title: 'Fast', body: 'Ships in a minute' }, { title: 'Themed' }],
    },
  },
  {
    kind: 'offer',
    raw: {
      headline: 'Launch plan',
      body: 'Everything included',
      priceNote: '999 per month',
      ctaLabel: 'Buy now',
      ctaHref: 'https://sahoda.site/buy',
    },
    content: {
      headline: 'Launch plan',
      body: 'Everything included',
      priceNote: '999 per month',
      ctaLabel: 'Buy now',
      ctaHref: 'https://sahoda.site/buy',
    },
  },
  {
    kind: 'testimonials',
    raw: {
      headline: 'Loved by owners',
      items: [{ quote: 'It just worked', author: 'Ria', role: 'Studio owner' }],
    },
    content: {
      headline: 'Loved by owners',
      items: [{ quote: 'It just worked', author: 'Ria', role: 'Studio owner' }],
    },
  },
  {
    kind: 'faq',
    raw: { headline: 'Questions', items: [{ q: 'Is it fast?', a: 'Yes, under a minute.' }] },
    content: { headline: 'Questions', items: [{ q: 'Is it fast?', a: 'Yes, under a minute.' }] },
  },
  {
    kind: 'contact',
    raw: { headline: 'Talk to us', body: 'We reply within a day', submitLabel: 'Send' },
    content: { headline: 'Talk to us', body: 'We reply within a day', submitLabel: 'Send' },
  },
]

/** Only the required field present — the section must still render, never drop. */
const MINIMAL_CASES: Array<{ kind: SectionKind; raw: Record<string, unknown>; content: unknown }> =
  [
    {
      kind: 'hero',
      raw: { headline: 'Only a headline' },
      content: { headline: 'Only a headline' },
    },
    {
      kind: 'features',
      raw: { items: [{ title: 'One' }] },
      content: { items: [{ title: 'One' }] },
    },
    {
      kind: 'offer',
      raw: { headline: 'Only a headline' },
      content: { headline: 'Only a headline' },
    },
    {
      kind: 'testimonials',
      raw: { items: [{ quote: 'Great' }] },
      content: { items: [{ quote: 'Great' }] },
    },
    {
      kind: 'faq',
      raw: { items: [{ q: 'A?', a: 'B.' }] },
      content: { items: [{ q: 'A?', a: 'B.' }] },
    },
    { kind: 'contact', raw: {}, content: {} },
  ]

describe('normalizeSection — well-formed content', () => {
  for (const testCase of HAPPY_CASES) {
    it(`keeps every field of a complete ${testCase.kind} and drops nothing`, () => {
      const result = normalizeSection(testCase.kind, testCase.raw, SORT)

      expect(result).not.toBeNull()
      expect(result?.section.section).toEqual({ kind: testCase.kind, content: testCase.content })
      expect(result?.dropped).toEqual([])
    })
  }

  for (const testCase of MINIMAL_CASES) {
    it(`renders a ${testCase.kind} with every optional field absent, because copy is advisory`, () => {
      const result = normalizeSection(testCase.kind, testCase.raw, SORT)

      expect(result).not.toBeNull()
      expect(result?.section.section).toEqual({ kind: testCase.kind, content: testCase.content })
      expect(result?.dropped).toEqual([])
    })
  }
})
