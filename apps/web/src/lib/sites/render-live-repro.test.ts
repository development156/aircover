import { describe, expect, test } from 'vitest'
import { normalizeDraft, renderBundle } from '@sahoda/sites'
import { ThemeTokensSchema } from '@sahoda/shared'

import { siteTreeToOutput } from './from-rows'
import { sharedTokensCss } from './tokens-css'

/**
 * Repro of the live 500 on /sites, using the EXACT rows the first real
 * `site_generate` wrote (workspace 083ab0ae…, site d5125e5e…) and the EXACT
 * persisted theme. Both had only ever been exercised with hand-written
 * fixtures and `theme: null` before this.
 */

const SECTIONS = [
  {
    sort: 0,
    kind: 'hero',
    content: {
      subhead: 'Small-batch roasts made with real care — for mornings that deserve better.',
      headline: 'Your daily ritual, elevated.',
    },
  },
  {
    sort: 1,
    kind: 'features',
    content: {
      headline: 'Small batch, big flavor.',
      items: [
        { title: 'Roasted with intention', body: 'We roast in small batches.' },
        { title: 'Honest craftsmanship', body: 'We treat everyday coffee like it matters.' },
        { title: 'Warmth in every cup', body: 'Approachable coffee for discerning people.' },
      ],
    },
  },
  {
    sort: 2,
    kind: 'offer',
    content: { headline: 'Start your golden morning.', body: 'Pick your roast.' },
  },
  {
    sort: 3,
    kind: 'testimonials',
    content: {
      headline: 'From people who take mornings seriously.',
      items: [
        { quote: 'I finally found coffee that feels like a treat.', author: 'Dana R.' },
        { quote: "Now it's the calmest part of my day.", author: 'Marcus L.' },
        { quote: 'You can taste the care.', author: 'Priya S.' },
      ],
    },
  },
  {
    sort: 4,
    kind: 'contact',
    content: { headline: 'Come say hello.', body: 'Reach out anytime.' },
  },
]

/** Verbatim from `workspace_themes.tokens` after the live onboarding run. */
const LIVE_THEME = {
  text: {
    hi: 'oklch(0.1867 0 89.9)',
    low: 'oklch(0.7152 0.0014 106.4)',
    mid: 'oklch(0.4386 0 89.9)',
  },
  accent: 'oklch(0.5548 0.2052 356.4)',
  border: 'oklch(0.9216 0.0013 106.4)',
  danger: 'oklch(0.5349 0.2026 27.6)',
  radius: '12px',
  primary: 'oklch(0.3952 0.0648 214.9)',
  success: 'oklch(0.5273 0.1371 150.1)',
  surface: [
    'oklch(1 0 89.9)',
    'oklch(0.9848 0.0013 106.4)',
    'oklch(0.9669 0.0013 106.4)',
    'oklch(0.9216 0.0013 106.4)',
  ],
  warning: 'oklch(0.5553 0.1455 49)',
  fontBody: 'Outfit',
  primaryFg: 'oklch(1 0 89.9)',
  secondary: 'oklch(0.9669 0.0013 106.4)',
  fontHeading: 'Outfit',
}

/** Verbatim `site_pages` row from the live generate (row_to_json). */
const PAGES = [
  {
    id: '69519705-343d-4aa8-bf8c-4678ea0b4eb9',
    workspace_id: '083ab0ae-9d22-4c3f-9014-56038adcf7bc',
    site_id: 'd5125e5e-c9d8-4dda-a641-08be73e88947',
    path: '/',
    title: 'Marigold Coffee Roasters — Small Batch, Big Flavor',
    sort: 0,
    seo: {
      description:
        'Small-batch coffee roasted with intention. Marigold Coffee Roasters turns your everyday cup into a golden moment of care.',
    },
    created_at: '2026-07-20T14:10:38.155378+00:00',
    updated_at: '2026-07-20T14:10:38.155378+00:00',
  },
]

const REAL_PAGE_ID = '69519705-343d-4aa8-bf8c-4678ea0b4eb9'

function buildBundle(theme: unknown) {
  const output = siteTreeToOutput(
    PAGES as never,
    SECTIONS.map((s) => ({ ...s, page_id: REAL_PAGE_ID })) as never,
  )
  expect(output, 'siteTreeToOutput returned null for the live rows').not.toBeNull()

  const normalized = normalizeDraft(output!, {
    name: 'Marigold Coffee Roasters',
    goal: null,
    maxPages: 5,
    traceId: 'repro',
  })
  expect(normalized.ok).toBe(true)
  if (!normalized.ok) throw new Error('normalize failed')

  return renderBundle(normalized.data.draft, {
    siteName: 'Marigold Coffee Roasters',
    tokensCss: sharedTokensCss(),
    theme: theme as never,
    formAction: null,
    canonicalOrigin: null,
  })
}

describe('readSiteTree row parsing — the live rows must survive the schemas', () => {
  // `readSiteTree` drops any row that fails these, and zero surviving pages
  // makes buildPreview `continue` → the honest 'unreadable' state, with no
  // throw. That is indistinguishable in the UI from a render failure, so pin
  // it explicitly against the real rows.
  test('the live site_pages row parses', async () => {
    const { SitePageSchema } = await import('@sahoda/shared')

    const parsed = SitePageSchema.safeParse(PAGES[0])

    expect(parsed.success, JSON.stringify(parsed.error?.issues ?? [], null, 1)).toBe(true)
  })

  test('every live site_sections row parses', async () => {
    const { SiteSectionSchema } = await import('@sahoda/shared')

    for (const section of SECTIONS) {
      const row = {
        id: '00000000-0000-4000-8000-000000000001',
        workspace_id: '083ab0ae-9d22-4c3f-9014-56038adcf7bc',
        page_id: REAL_PAGE_ID,
        kind: section.kind,
        sort: section.sort,
        content: section.content,
        created_at: '2026-07-20T14:10:38.155378+00:00',
        updated_at: '2026-07-20T14:10:38.155378+00:00',
      }
      const parsed = SiteSectionSchema.safeParse(row)

      expect(parsed.success, `${section.kind}: ${JSON.stringify(parsed.error?.issues ?? [])}`).toBe(
        true,
      )
    }
  })
})

describe('live site render — the rows the first real generate produced', () => {
  test('renders with theme: null (the pre-change path)', () => {
    expect(() => buildBundle(null)).not.toThrow()
  })

  test('the persisted theme is a valid ThemeTokens', () => {
    expect(ThemeTokensSchema.safeParse(LIVE_THEME).success).toBe(true)
  })

  test('renders with the persisted workspace theme', () => {
    // This is the /sites 500: charged 100 credits, site rows written, page dead.
    expect(() => buildBundle(LIVE_THEME)).not.toThrow()
  })

  test('the rendered CSS carries the brand primary, not the stock orange', () => {
    const bundle = buildBundle(LIVE_THEME)
    const html = JSON.stringify(bundle)

    expect(html).toContain('0.3952')
  })
})
