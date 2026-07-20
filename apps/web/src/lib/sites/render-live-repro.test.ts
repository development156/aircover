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

const PAGES = [{ id: 'page-1', path: '/', title: 'Home', sort: 0 }]

function buildBundle(theme: unknown) {
  const output = siteTreeToOutput(
    PAGES as never,
    SECTIONS.map((s) => ({ ...s, page_id: 'page-1' })) as never,
  )
  expect(output).not.toBeNull()

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
