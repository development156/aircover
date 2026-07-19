/**
 * Shared fixtures for the `toRows` suites.
 *
 * The suite is split across two files (schema conformance vs. projection) to stay under
 * the 300-line rule, so the draft builders live here rather than being copy-pasted.
 */
import type { NormalizedSection } from '../normalize/section-content'
import type { DraftPage, SiteDraft } from '../normalize/draft'
import type { SiteRows, ToRowsOptions } from './to-rows'

export const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111'
export const SITE_ID = '22222222-2222-4222-8222-222222222222'
export const PAGE_ID = '33333333-3333-4333-8333-333333333333'
export const CREATED_BY = 'user_2abcDEF'

export const OPTIONS: ToRowsOptions = {
  workspaceId: WORKSPACE_ID,
  slug: 'acme-coffee',
  createdBy: CREATED_BY,
}

/** noUncheckedIndexedAccess is on: index once, loudly, instead of sprinkling `!`. */
export const at = <T>(list: readonly T[], index: number): T => {
  const value = list[index]
  if (value === undefined) {
    throw new Error(`expected an element at index ${index}, got a list of length ${list.length}`)
  }
  return value
}

export const heroSection = (): NormalizedSection => ({
  section: {
    kind: 'hero',
    content: {
      headline: 'Coffee, roasted the morning it ships',
      subhead: 'Small-batch beans from Coorg',
      ctaLabel: 'Start a subscription',
      ctaHref: 'https://acme.test/subscribe',
    },
  },
  // Deliberately wrong: the mapper must ignore this and use the array index.
  sort: 9,
  raw: { headline: 'Coffee, roasted the morning it ships', junkKey: true },
})

export const faqSection = (): NormalizedSection => ({
  section: {
    kind: 'faq',
    content: {
      headline: 'Questions',
      items: [
        { q: 'Do you ship nationwide?', a: 'Yes, in 2-4 days.' },
        { q: 'Can I pause?', a: 'Any time, from your account.' },
      ],
    },
  },
  sort: 7,
  raw: { headline: 'Questions' },
})

export const contactSection = (): NormalizedSection => ({
  section: { kind: 'contact', content: { headline: 'Talk to us', submitLabel: 'Send' } },
  sort: 0,
  raw: { headline: 'Talk to us' },
})

export const makePage = (overrides: Partial<DraftPage> = {}): DraftPage => ({
  path: '/',
  title: 'Acme Coffee — fresh beans, delivered',
  seoDescription: 'Small-batch coffee delivered fresh across India.',
  sort: 0,
  sections: [heroSection(), faqSection()],
  ...overrides,
})

export const makeDraft = (overrides: Partial<SiteDraft> = {}): SiteDraft => ({
  name: 'Acme Coffee',
  goal: 'Sell monthly subscriptions',
  pages: [
    makePage(),
    makePage({
      path: '/contact',
      title: 'Contact Acme',
      seoDescription: null,
      sort: 4,
      sections: [contactSection()],
    }),
  ],
  ...overrides,
})

/** The store's job, simulated: stamp the ids and tenant the mapper deliberately omits. */
export const withStoreIds = (
  rows: SiteRows,
): Array<{ page: Record<string, unknown>; sections: Array<Record<string, unknown>> }> =>
  rows.pages.map((entry) => ({
    page: { ...entry.page, site_id: SITE_ID, workspace_id: WORKSPACE_ID },
    sections: entry.sections.map((section) => ({
      ...section,
      page_id: PAGE_ID,
      workspace_id: WORKSPACE_ID,
    })),
  }))
