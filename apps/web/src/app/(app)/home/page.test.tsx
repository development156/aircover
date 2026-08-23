import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { readInstagramAnalytics } from '@/lib/analytics/account-insights'
import { readPostCounts } from '@/lib/home/posts'
import { readPublishSummary } from '@/lib/home/publishing'
import { readSpend } from '@/lib/home/spend'
import { listPosts, listVariantStates } from '@/lib/posts/read'
import { readBalance, readLedger } from '@/lib/wallet/read'
import { readBrain } from '@/lib/brand/read-brain'
import { listConnections } from '@/lib/connections/read'

import { hasDeferredOnboarding } from '@/lib/onboarding/defer'
import { onboardingStateRead } from '@/lib/onboarding/read-onboarding-state'

import HomePage from './page'

/**
 * Home is the first screen of the product.
 *
 * Signing up does not create a workspace — `bootstrap_workspace` runs only when
 * the user asks for it, and the signup credit grant is written inside it. The
 * root redirects here, so EVERY new account lands on this page with no
 * workspace, and until now it rendered the full dashboard: an em dash where the
 * balance goes, with "credits to spend" underneath.
 *
 * That em dash is the `unreadable` glyph. `/wallet` had exactly this bug and
 * fixed it (see `wallet/page.test.tsx`) — "we could not read your balance" and
 * "you have no workspace" are different claims and only one of them is true.
 * These tests pin Home to the same standard, and pin the affordance too: a first
 * run that describes a void without offering the one action that ends it is the
 * same dead end wearing better words.
 */

vi.mock('@/lib/wallet/read', () => ({
  HISTORY_LIMIT: 50,
  readBalance: vi.fn(),
  readLedger: vi.fn(),
}))
vi.mock('@/lib/posts/read', () => ({ listPosts: vi.fn(), listVariantStates: vi.fn() }))
vi.mock('@/lib/home/spend', () => ({ readSpend: vi.fn() }))
vi.mock('@/lib/home/posts', () => ({ readPostCounts: vi.fn() }))
vi.mock('@/lib/home/publishing', () => ({ readPublishSummary: vi.fn() }))
vi.mock('@/lib/analytics/account-insights', () => ({ readInstagramAnalytics: vi.fn() }))
// Added when Home's rail gained the Brand Brain and Connections cards. Both
// reach `cookies()`, so without a mock every test here fails on "called outside
// a request scope" rather than on anything it is actually asserting.
vi.mock('@/lib/brand/read-brain', () => ({ readBrain: vi.fn() }))
vi.mock('@/lib/connections/read', () => ({ listConnections: vi.fn() }))

// Reached through CreateWorkspaceButton, which is a `'use server'` import away.
vi.mock('@/app/actions/workspace', () => ({ createWorkspace: vi.fn() }))

/**
 * THE LANDING RULE'S TWO READS.
 *
 * `hasDeferredOnboarding` reaches `cookies()`, which throws outside a request
 * scope, so without these every test in this file fails on that rather than on
 * anything it asserts. They are also the seam the wiring tests below drive: the
 * DECISION is pinned pure in `lib/onboarding/landing.test.ts`; what is pinned
 * here is that this page acts on it.
 */
vi.mock('@/lib/onboarding/defer', () => ({
  ONBOARDING_DEFER_COOKIE: 'sahoda_onb_defer',
  hasDeferredOnboarding: vi.fn(),
}))
vi.mock('@/lib/onboarding/read-onboarding-state', () => ({ onboardingStateRead: vi.fn() }))
// The greeting banner carries the page's primary action. CreatePostButton is
// now a plain <Link> to the create flow — it no longer writes a draft before
// asking anything, so it needs neither the router nor the action. Both mocks
// are kept because OTHER components on this page still reach for them, and
// removing them here would only move the failure.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  /**
   * THROWS, exactly as Next's own does.
   *
   * A `redirect` mocked as a silent spy would let the whole page go on and
   * render underneath the assertion — so a test could report "it redirected"
   * about a page that had also drawn the dashboard it was supposed to replace.
   */
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`)
  }),
}))
vi.mock('@/app/actions/posts', () => ({ createPost: vi.fn() }))

const balanceRead = vi.mocked(readBalance)

// The EMPTY sentinels each read returns for a workspace-less session, copied
// from their own modules so a shape change breaks this file loudly.
const EMPTY_SPEND = {
  status: 'empty' as const,
  days: [],
  byAction: [],
  total: 0,
  capped: false,
  coveredFrom: null,
}

const EMPTY_COUNTS = {
  status: 'empty' as const,
  byStatus: {},
  byChannel: [],
  byOrigin: { manual: 0, plan_week: 0 },
  total: 0,
  capped: false,
  coveredFrom: null,
}

const EMPTY_PUBLISH = {
  status: 'empty' as const,
  attempts: 0,
  succeeded: 0,
  failed: 0,
  live: 0,
  fixture: 0,
  capped: false,
  coveredFrom: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  // The default is a finished account, which is what every assertion in this
  // file below the landing block is about. The landing block sets its own.
  vi.mocked(hasDeferredOnboarding).mockResolvedValue(false)
  vi.mocked(onboardingStateRead).mockResolvedValue({ status: 'completed' })
  vi.mocked(listPosts).mockResolvedValue([])
  vi.mocked(listVariantStates).mockResolvedValue(new Map())
  // The rail's two reads. `no-brain` and `null` are the honest defaults for a
  // fresh workspace, so the dashboard branch renders its empty rail rather than
  // a half-populated one.
  vi.mocked(readBrain).mockResolvedValue({ status: 'no-brain' })
  vi.mocked(listConnections).mockResolvedValue([])
  vi.mocked(readLedger).mockResolvedValue({ entries: [], skipped: 0 })
  vi.mocked(readSpend).mockResolvedValue(EMPTY_SPEND)
  vi.mocked(readPostCounts).mockResolvedValue(EMPTY_COUNTS)
  vi.mocked(readPublishSummary).mockResolvedValue(EMPTY_PUBLISH)
  // `kind`, not `status` — this union discriminates on kind, and 'not-connected'
  // renders nothing at all.
  vi.mocked(readInstagramAnalytics).mockResolvedValue({ kind: 'not-connected' })
})

describe('Home for a user with no workspace yet', () => {
  beforeEach(() => {
    balanceRead.mockResolvedValue({ status: 'no-workspace' })
    // Not a redirect: there is no workspace-less URL to send them to, so the
    // first-run screen is rendered where they stand. See `landing.ts`.
    vi.mocked(onboardingStateRead).mockResolvedValue({ status: 'no-workspace' })
  })

  test('offers the one action that ends the first run', async () => {
    render(await HomePage())

    expect(screen.getByRole('button', { name: /create workspace/i })).toBeInTheDocument()
  })

  test('does not render the dashboard it cannot fill', async () => {
    render(await HomePage())

    // The credits card, the week strip and the spend chart all describe a
    // workspace. None of them has one to describe.
    expect(screen.queryByText(/available credits/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/credits to spend/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/nothing in flight yet/i)).not.toBeInTheDocument()
  })

  test('never shows the unreadable em dash for a balance that is absent, not broken', async () => {
    render(await HomePage())

    // The balance card renders the glyph as its own text node — that node is the
    // one reserved for "we could not read it". Prose elsewhere may contain an em
    // dash and does; matching on the whole document would catch that instead.
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })

  test('does not promise credits it cannot count', async () => {
    render(await HomePage())

    // The grant is read from `plans` at bootstrap; this page never read it, so
    // it names no figure. A hardcoded 100 here would drift the day a plan does.
    expect(screen.getByText(/free signup credits land the moment/i)).toBeInTheDocument()
    expect(screen.queryByText(/\b100\b/)).not.toBeInTheDocument()
  })
})

describe('Home for a workspace that exists', () => {
  beforeEach(() => {
    balanceRead.mockResolvedValue({
      status: 'ok',
      balance: { total: 100, held: 0, available: 100, hasHold: false, heldNote: null },
    })
  })

  test('renders the dashboard, not the first run', async () => {
    render(await HomePage())

    expect(screen.getByText(/available credits/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /create workspace/i })).not.toBeInTheDocument()
  })

  test('an unreadable balance still reads as unreadable, not as a missing workspace', async () => {
    balanceRead.mockResolvedValue({ status: 'unreadable' })

    render(await HomePage())

    // The two states were one em dash before this change. They must not become
    // one first-run screen instead — a funded user told to create a workspace
    // they already have is the same lie pointing the other way.
    expect(screen.queryByRole('button', { name: /create workspace/i })).not.toBeInTheDocument()
    expect(screen.getByText(/available credits/i)).toBeInTheDocument()
  })
})

/**
 * THE LANDING RULE, WIRED.
 *
 * `lib/onboarding/landing.test.ts` proves the decision. These prove this page
 * asks for it and obeys the answer — the half a pure test cannot reach, and the
 * half that would silently stop working if someone deleted one line here.
 */
describe('the landing rule on the page that lands', () => {
  beforeEach(() => {
    balanceRead.mockResolvedValue({
      status: 'ok',
      balance: { total: 100, held: 0, available: 100, hasHold: false, heldNote: null },
    })
  })

  test('an account that has never onboarded is sent into the flow', async () => {
    vi.mocked(onboardingStateRead).mockResolvedValue({ status: 'not-started' })

    await expect(HomePage()).rejects.toThrow('NEXT_REDIRECT:/onboarding')
  })

  test('and nothing of the dashboard is rendered on the way', async () => {
    vi.mocked(onboardingStateRead).mockResolvedValue({ status: 'not-started' })

    await expect(HomePage()).rejects.toThrow()
    // `redirect` throws, so the JSX below it is never reached. If it were a
    // silent spy this would be a dashboard drawn under a passing assertion.
    expect(screen.queryByText(/available credits/i)).not.toBeInTheDocument()
  })

  test('a finished account gets the dashboard', async () => {
    vi.mocked(onboardingStateRead).mockResolvedValue({ status: 'completed' })

    render(await HomePage())

    expect(screen.getByText(/available credits/i)).toBeInTheDocument()
  })

  /**
   * THE ONE THAT MUST NOT MOVE ANYBODY. A failed read is not a fact about the
   * account, and a customer who finished onboarding weeks ago must not be walked
   * back to its first screen because one query timed out.
   */
  test('a read that FAILED leaves them on the dashboard', async () => {
    vi.mocked(onboardingStateRead).mockResolvedValue({ status: 'unreadable' })

    render(await HomePage())

    expect(screen.getByText(/available credits/i)).toBeInTheDocument()
  })

  test('Save & exit is honoured — a deferred visit is not bounced', async () => {
    vi.mocked(onboardingStateRead).mockResolvedValue({ status: 'not-started' })
    vi.mocked(hasDeferredOnboarding).mockResolvedValue(true)

    render(await HomePage())

    expect(screen.getByText(/available credits/i)).toBeInTheDocument()
  })
})
