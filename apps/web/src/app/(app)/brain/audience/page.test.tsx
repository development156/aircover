import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { AudienceState } from '@sahoda/publishing'

import { readAudiencePage, type AudiencePageData, type CollectedHistory } from '@/lib/audience/page-data'

import BrainAudiencePage from './page'

/**
 * /brain/audience answers EIGHT different questions and each carries a different
 * remedy. Collapsing any two of them is the defect
 * `e2e/no-impossible-remedy.spec.ts` walks every route to catch, and it has
 * shipped in this product four times.
 *
 * The assertions below are made ACROSS THE WHOLE UNION rather than against the
 * states someone remembered to list — a ninth state added later fails the
 * coverage test rather than quietly escaping the rules.
 */

vi.mock('@/lib/audience/page-data', async () => {
  const actual = await vi.importActual<typeof import('@/lib/audience/page-data')>(
    '@/lib/audience/page-data',
  )
  return { ...actual, readAudiencePage: vi.fn() }
})

const mockedRead = vi.mocked(readAudiencePage)

const NO_HISTORY: CollectedHistory = {
  followers: [],
  firstDay: null,
  lastDay: null,
  days: 0,
  storing: false,
}

/** The record the production collector actually wrote, 2026-08-20. Four flat days. */
const REAL_HISTORY: CollectedHistory = {
  followers: [
    { day: '2026-08-17', followers: 1 },
    { day: '2026-08-18', followers: 1 },
    { day: '2026-08-19', followers: 1 },
    { day: '2026-08-20', followers: 1 },
  ],
  firstDay: '2026-08-17',
  lastDay: '2026-08-20',
  days: 4,
  storing: true,
}

/** Zernio's own documented `allBreakdowns` example. DOCUMENTED, never measured. */
const POPULATED: AudienceState = {
  kind: 'ready',
  breakdown: {
    age: [
      { label: '25-34', value: 4500 },
      { label: '18-24', value: 3200 },
    ],
    gender: [
      { label: 'F', value: 4800 },
      { label: 'M', value: 3000 },
    ],
    city: [{ label: 'New York, New York', value: 800 }],
    country: [{ label: 'US', value: 5000 }],
  },
  timeframe: 'this_month',
  followers: 5230,
}

/** Every member of the union, so no rule below can be asserted against a subset. */
const EVERY_STATE: AudienceState[] = [
  { kind: 'not-connected' },
  { kind: 'reconnect' },
  { kind: 'not-configured' },
  { kind: 'unresolved' },
  { kind: 'unreadable' },
  { kind: 'suppressed', followers: 1, floor: 100 },
  { kind: 'no-data', followers: 2000, timeframe: 'this_month' },
  POPULATED,
]

function page(state: AudienceState, history: CollectedHistory = NO_HISTORY): AudiencePageData {
  return { state, history, username: 'testingg53', floor: 100 }
}

beforeEach(() => {
  mockedRead.mockReset()
})

async function renderState(state: AudienceState, history?: CollectedHistory): Promise<void> {
  mockedRead.mockResolvedValue(page(state, history))
  render(await BrainAudiencePage())
}

describe('every state renders, and none of them renders the same screen', () => {
  test.each(EVERY_STATE.map((s) => [s.kind, s] as const))('%s renders a heading', async (_k, state) => {
    await renderState(state)
    expect(screen.getByRole('heading', { name: /who follows you/i })).toBeInTheDocument()
  })

  test('the eight states produce eight different screens', async () => {
    // A page that rendered the same words for two states would pass every
    // individual assertion above and still be the exact defect.
    const seen = new Set<string>()
    for (const state of EVERY_STATE) {
      mockedRead.mockResolvedValue(page(state))
      const { container, unmount } = render(await BrainAudiencePage())
      seen.add(container.textContent ?? '')
      unmount()
    }
    expect(seen.size).toBe(EVERY_STATE.length)
  })
})

describe('no state offers a remedy it cannot fulfil', () => {
  /** The e2e detector's own regex, applied here so a failure is caught earlier. */
  const RETRY =
    /\breload\b|\btry again\b|\brefresh\b|could ?n[o']?t (read|check|load|reach)|could not (read|check|load|reach)/i

  test.each(
    EVERY_STATE.filter((s) => s.kind !== 'unreadable').map((s) => [s.kind, s] as const),
  )('%s promises no retry', async (_k, state) => {
    // "Reload" cannot add followers, cannot supply a missing environment
    // variable and cannot reconnect an account. Seven of the eight states must
    // never say it.
    await renderState(state, REAL_HISTORY)
    expect(screen.getByRole('heading', { name: /who follows you/i })).toBeInTheDocument()
    expect(document.body.textContent ?? '').not.toMatch(RETRY)
  })

  test('unreadable — and ONLY unreadable — does promise one', async () => {
    // The other half. Without this, deleting the sentence entirely would pass
    // every assertion above, and a genuinely failed read would go unexplained.
    await renderState({ kind: 'unreadable' })
    expect(document.body.textContent ?? '').toMatch(RETRY)
  })
})

describe('the suppressed state — what most accounts see, and it is not an error', () => {
  test('states the platform’s rule, the account’s number and the gap', async () => {
    await renderState({ kind: 'suppressed', followers: 1, floor: 100 }, REAL_HISTORY)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '1')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
    expect(document.body.textContent).toContain('99 more before Instagram describes them')
  })

  test('never says anything is wrong with the account', async () => {
    await renderState({ kind: 'suppressed', followers: 1, floor: 100 }, REAL_HISTORY)
    const text = document.body.textContent ?? ''
    expect(text).toMatch(/Nothing is wrong with your account/i)
    expect(text).not.toMatch(/\berror\b|\bfailed\b|\bproblem with\b/i)
  })

  test('does not render an empty card for any dimension it has no data for', async () => {
    // The absence vocabulary's third state: if the quantity does not exist,
    // DELETE THE SLOT. Four cards of dashes would be the same page telling the
    // same shop owner every week that something is missing.
    await renderState({ kind: 'suppressed', followers: 1, floor: 100 }, REAL_HISTORY)
    for (const title of ['Age', 'Gender', 'Top cities', 'Top countries']) {
      expect(screen.queryByRole('heading', { name: title })).not.toBeInTheDocument()
    }
  })
})

describe('the line between measured and worked out', () => {
  test('the inferred layer is separated, labelled, and marked .is-proposed', async () => {
    await renderState({ kind: 'suppressed', followers: 1, floor: 100 }, REAL_HISTORY)
    expect(
      screen.getByRole('separator', { name: /Sahoda is working things out/i }),
    ).toBeInTheDocument()
    // The rung is structural, not a word: `.is-proposed` is a dashed edge with no
    // fill, which docs/26 §3.1 measures as surviving greyscale against the solid
    // `.is-real` fill in both themes.
    const proposed = document.querySelectorAll('.is-proposed')
    expect(proposed.length).toBeGreaterThan(0)
    for (const panel of proposed) {
      expect(within(panel as HTMLElement).getByText('Worked out')).toBeInTheDocument()
    }
  })

  test('the inferred panel REFUSES to project from four flat days', async () => {
    // The evidence floor, executed. Four days is under the seven-day minimum AND
    // shows no growth — either alone must stop a projection.
    await renderState({ kind: 'suppressed', followers: 1, floor: 100 }, REAL_HISTORY)
    const text = document.body.textContent ?? ''
    expect(text).toMatch(/needs at least 7 days|has 4/i)
    // No confident number of days to the threshold anywhere on the page.
    expect(text).not.toMatch(/you would pass/i)
  })

  test('it projects only when the record actually shows growth', async () => {
    const growing: CollectedHistory = {
      followers: Array.from({ length: 10 }, (_, i) => ({
        day: `2026-08-${String(11 + i).padStart(2, '0')}`,
        followers: 40 + i * 2,
      })),
      firstDay: '2026-08-11',
      lastDay: '2026-08-20',
      days: 10,
      storing: true,
    }
    await renderState({ kind: 'suppressed', followers: 58, floor: 100 }, growing)
    const text = document.body.textContent ?? ''
    expect(text).toMatch(/you would pass/i)
    // And it shows its working, so the reader can disagree with it.
    expect(text).toMatch(/18/) // 18 gained
    expect(text).toMatch(/not a forecast/i)
  })
})

describe('the populated state — UNVERIFIED against a live payload', () => {
  test('renders only the dimensions the platform reported', async () => {
    await renderState({ ...POPULATED, breakdown: { age: POPULATED.kind === 'ready' ? POPULATED.breakdown.age ?? [] : [] } })
    expect(screen.getByRole('heading', { name: 'Age' })).toBeInTheDocument()
    for (const title of ['Gender', 'Top cities', 'Top countries']) {
      expect(screen.queryByRole('heading', { name: title })).not.toBeInTheDocument()
    }
  })

  test('spells out Meta’s gender codes without changing what was stored', async () => {
    await renderState(POPULATED)
    expect(screen.getByText('Women')).toBeInTheDocument()
    expect(screen.getByText('Men')).toBeInTheDocument()
  })

  test('computes shares against the follower total, never the sum of buckets', async () => {
    // Meta returns only the top 45 buckets, so the parts do not add up to the
    // whole. 4500 of 5230 followers is 86%; 4500 of (4500+3200) would be 58%.
    await renderState(POPULATED)
    expect(document.body.textContent).toContain('86%')
    expect(document.body.textContent).not.toContain('58%')
  })

  test('prints no share at all when the follower total is unknown', async () => {
    await renderState({ ...POPULATED, followers: null } as AudienceState)
    expect(document.body.textContent).not.toMatch(/\d+%/)
    // The bars still draw — against the largest bucket — so the shape survives.
    expect(screen.getByRole('heading', { name: 'Age' })).toBeInTheDocument()
  })
})

describe('what Sahoda kept is stated, never implied', () => {
  test('says plainly when nothing has been collected', async () => {
    await renderState({ kind: 'no-data', followers: 2000, timeframe: 'this_month' }, NO_HISTORY)
    expect(document.body.textContent).toMatch(/has not kept a day of this yet/i)
  })

  test('names the window it is looking at when it has one', async () => {
    await renderState({ kind: 'suppressed', followers: 1, floor: 100 }, REAL_HISTORY)
    expect(document.body.textContent).toMatch(/2026-08-17/)
    expect(document.body.textContent).toMatch(/2026-08-20/)
  })
})
