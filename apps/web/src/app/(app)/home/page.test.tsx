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

import { readSubscription } from '@/lib/billing/read'
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

/**
 * ── THE PLAN OFFER'S THREE DEPENDENCIES, MOCKED FOR THE SAME REASON AS THE
 *    NINE ABOVE ─────────────────────────────────────────────────────────────
 * `readSubscription` decides whether the dialog is mounted at all, so it has to
 * be steerable from here or the offer can never be asserted either way. Before
 * it was mocked the real module ran, threw inside its own try/catch and returned
 * `unreadable` — which is `silent`, so every test in this file passed while
 * proving nothing about the offer. A read that fails quietly into the answer you
 * were hoping for is the worst kind of green.
 *
 * `auth` and `startCheckout` are the other two: the first scopes a dismissal to
 * a sign-in and pulls `server-only`, which throws in this environment; the
 * second is a `'use server'` export that opens a real payment order.
 */
vi.mock('@/lib/billing/read', () => ({ readSubscription: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ sessionId: 'sess_test' }) }))
vi.mock('@/app/actions/wallet', () => ({ startCheckout: vi.fn() }))

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

const FREE_SUBSCRIPTION = {
  status: 'ok' as const,
  data: {
    workspaceId: '00000000-0000-4000-8000-000000000001',
    planId: 'free' as const,
    status: 'active' as const,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    pendingPlanId: null,
    pendingPlanEffectiveAt: null,
    graceEndsAt: null,
    dunningAttempts: 0,
    lastFailureAt: null,
    lastFailureCode: null,
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(readSubscription).mockResolvedValue(FREE_SUBSCRIPTION)
  /**
   * jsdom implements no `<dialog>` at all, and the plan offer is a `<dialog>`
   * that opens ITSELF on mount rather than on a click. Without these two, every
   * test in this file throws `el.showModal is not a function` from the modal's
   * effect — which is worth knowing about the real browser too: a client without
   * `<dialog>` support would take the whole dashboard down, where the product's
   * other fourteen modals would only fail to open when pressed. Every browser
   * this product supports has shipped it since 2022.
   */
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false
  })
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
  vi.mocked(readLedger).mockResolvedValue({ entries: [], skipped: 0, unreadable: false })
  vi.mocked(readSpend).mockResolvedValue(EMPTY_SPEND)
  vi.mocked(readPostCounts).mockResolvedValue(EMPTY_COUNTS)
  vi.mocked(readPublishSummary).mockResolvedValue(EMPTY_PUBLISH)
  // `kind`, not `status` — this union discriminates on kind, and 'not-connected'
  // renders nothing at all.
  vi.mocked(readInstagramAnalytics).mockResolvedValue({ kind: 'not-connected' })
})

/**
 * ── THE DASHBOARD IS IDENTIFIED BY ITS QUEUE, NOT BY A CARD THAT MOVED ───────
 * Six assertions in this file used `/available credits/i` as the marker for
 * "the dashboard rendered rather than FirstRun or GetStarted". That card is
 * gone — docs/41 §2.2: the balance was on this one screen THREE times (topbar
 * chip, rail foot, and that card) and it is now one of four stat cards at the
 * top instead — and every one of those six went red on a change that broke
 * none of the properties they exist for.
 *
 * `Needs your attention` is the marker now. It is the page's structural LEAD
 * (SPECIFICATION.md §1's "what needs me", which docs/40 §2.1 moved to the top
 * and this lane did not move again), it renders in every dashboard branch
 * including the empty queue, and it is not a figure that can be demoted or
 * deduplicated. The PROPERTY each test holds is unchanged.
 */
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
    expect(screen.queryByText(/needs your attention/i)).not.toBeInTheDocument()
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

/**
 * ── A THIRD STATE, ADDED 2026-08-23 ─────────────────────────────────────────
 *
 * Home used to have two: no workspace, and everything else. "Everything else"
 * quietly included a workspace with nothing in it, which is where every account
 * spends its first hour — and MEASURED there, the nine containers stated the same
 * absence seven times over 2025px at 390. `lib/home/started.ts` decides it now.
 *
 * The two tests below assert things about the BALANCE, not about emptiness, so
 * they seed one post to reach the dashboard branch they were written for. Without
 * it they would be asserting the dashboard renders on a workspace that has no
 * dashboard to render, which is what they were doing by accident.
 */
const A_POST = {
  id: 'p1',
  workspace_id: 'w1',
  title: 'Tuesday roast',
  body: 'Roasted this week.',
  status: 'draft',
  channels: ['instagram'],
  scheduled_at: null,
  origin: 'manual',
  created_at: '2026-08-20T09:00:00.000Z',
  updated_at: '2026-08-20T09:00:00.000Z',
  created_by: 'u1',
} as unknown as Awaited<ReturnType<typeof listPosts>>[number]

describe('Home for a workspace with nothing in it', () => {
  beforeEach(() => {
    balanceRead.mockResolvedValue({
      status: 'ok',
      balance: { total: 100, held: 0, available: 100, hasHold: false, heldNote: null },
    })
  })

  test('states the absence ONCE, and offers the three doors', async () => {
    render(await HomePage())

    expect(screen.getByTestId('home-get-started')).toBeInTheDocument()
    // The dashboard's containers, each of which owned its own empty state.
    expect(screen.queryByText(/needs your attention/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/needs your attention/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/credits spent/i)).not.toBeInTheDocument()
  })

  test('is NOT the no-workspace screen — this workspace exists', async () => {
    render(await HomePage())

    expect(screen.queryByRole('button', { name: /create workspace/i })).not.toBeInTheDocument()
  })

  /**
   * The fail-safe direction, and the one worth guarding. Swallowing a customer's
   * dashboard because a query FAILED would tell them their work is gone; the cost
   * of the opposite error is one scroll past some empty cards.
   */
  test('an unreadable connections read keeps the dashboard, never the setup screen', async () => {
    vi.mocked(listConnections).mockResolvedValue(null)

    render(await HomePage())

    expect(screen.queryByTestId('home-get-started')).not.toBeInTheDocument()
    expect(screen.getByText(/needs your attention/i)).toBeInTheDocument()
  })

  test('an unreadable brain read does the same', async () => {
    vi.mocked(readBrain).mockResolvedValue({ status: 'unreadable' })

    render(await HomePage())

    expect(screen.queryByTestId('home-get-started')).not.toBeInTheDocument()
  })

  /** One real post is a real dashboard, however empty everything else is. */
  test('one draft is enough to earn the dashboard', async () => {
    vi.mocked(listPosts).mockResolvedValue([A_POST])

    render(await HomePage())

    expect(screen.queryByTestId('home-get-started')).not.toBeInTheDocument()
    expect(screen.getByText(/needs your attention/i)).toBeInTheDocument()
  })
})

describe('Home for a workspace that exists', () => {
  beforeEach(() => {
    balanceRead.mockResolvedValue({
      status: 'ok',
      balance: { total: 100, held: 0, available: 100, hasHold: false, heldNote: null },
    })
    // See A_POST: these two are about the balance, and need a started workspace.
    vi.mocked(listPosts).mockResolvedValue([A_POST])
  })

  test('renders the dashboard, not the first run', async () => {
    render(await HomePage())

    expect(screen.getByText(/needs your attention/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /create workspace/i })).not.toBeInTheDocument()
  })

  test('an unreadable balance still reads as unreadable, not as a missing workspace', async () => {
    balanceRead.mockResolvedValue({ status: 'unreadable' })

    render(await HomePage())

    // The two states were one em dash before this change. They must not become
    // one first-run screen instead — a funded user told to create a workspace
    // they already have is the same lie pointing the other way.
    expect(screen.queryByRole('button', { name: /create workspace/i })).not.toBeInTheDocument()
    expect(screen.getByText(/needs your attention/i)).toBeInTheDocument()
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
    expect(screen.queryByTestId('home-get-started')).not.toBeInTheDocument()
    expect(screen.queryByText(/needs your attention/i)).not.toBeInTheDocument()
  })

  test('a finished account gets the dashboard', async () => {
    vi.mocked(onboardingStateRead).mockResolvedValue({ status: 'completed' })

    render(await HomePage())

    expect(screen.getByTestId('home-get-started')).toBeInTheDocument()
  })

  /**
   * THE ONE THAT MUST NOT MOVE ANYBODY. A failed read is not a fact about the
   * account, and a customer who finished onboarding weeks ago must not be walked
   * back to its first screen because one query timed out.
   */
  test('a read that FAILED leaves them on the dashboard', async () => {
    vi.mocked(onboardingStateRead).mockResolvedValue({ status: 'unreadable' })

    render(await HomePage())

    expect(screen.getByTestId('home-get-started')).toBeInTheDocument()
  })

  test('Save & exit is honoured — a deferred visit is not bounced', async () => {
    vi.mocked(onboardingStateRead).mockResolvedValue({ status: 'not-started' })
    vi.mocked(hasDeferredOnboarding).mockResolvedValue(true)

    render(await HomePage())

    expect(screen.getByTestId('home-get-started')).toBeInTheDocument()
  })
})

/**
 * ── DOES THE DASHBOARD ACTUALLY MOUNT THE PLAN OFFER? ────────────────────────
 *
 * `lib/billing/plan-offer.test.ts` proves the DECISION and
 * `components/billing/plan-offer-modal.test.tsx` proves the DIALOG. Both mount
 * the component by hand, so between them they would still pass if this page had
 * never been wired up at all. This block is the join: the real page, the real
 * decision, and a subscription read steered to each of the two answers that
 * matter.
 */
describe('the plan offer on the dashboard', () => {
  const OFFER = 'Choose the right plan for you'
  const offerHeading = () => screen.queryByRole('heading', { name: OFFER })
  /**
   * AWAITED, because the dialog is fetched on demand. `plan-offer-mount.tsx`
   * loads it with `next/dynamic` so its weight stays out of /home's first load,
   * and the budget that decision came from is recorded there. A synchronous
   * lookup finds nothing and would read as "the page does not mount the offer",
   * which is the opposite of what it means.
   */
  const findOffer = () => screen.findByRole('heading', { name: OFFER })

  test('a workspace on Free is offered the plans', async () => {
    render(await HomePage())

    expect(await findOffer()).toBeInTheDocument()
  })

  test('a workspace on a paid plan is NOT', async () => {
    // The expensive failure this whole feature can produce: a pricing wall in
    // front of somebody who has already paid.
    vi.mocked(readSubscription).mockResolvedValue({
      ...FREE_SUBSCRIPTION,
      data: { ...FREE_SUBSCRIPTION.data, planId: 'growth', status: 'active' },
    })

    render(await HomePage())

    // Absence needs no wait: when the decision is `silent` the page renders no
    // mount at all, so there is no chunk on its way. The positive cases above
    // prove the awaited form does resolve, which is what stops this from being
    // a test that passes because the dialog is merely slow.
    expect(offerHeading()).toBeNull()
  })

  test('a subscription read that failed offers nothing, rather than guessing Free', async () => {
    vi.mocked(readSubscription).mockResolvedValue({ status: 'unreadable' })

    render(await HomePage())

    expect(offerHeading()).toBeNull()
  })

  test('an account with no workspace is offered nothing, because it cannot check out', async () => {
    vi.mocked(readSubscription).mockResolvedValue({ status: 'no-workspace' })
    balanceRead.mockResolvedValue({ status: 'no-workspace' })

    render(await HomePage())

    expect(offerHeading()).toBeNull()
  })

  test('it rides the empty dashboard too, which is where most Free workspaces are', async () => {
    // `GetStarted` is an early return with its own JSX, so the offer has to be
    // added to that branch as well. It was easy to wire only the full dashboard
    // and never notice, because the account most likely to be weighing a plan is
    // exactly the one that sees this screen.
    //
    // The balance is set here rather than left to the shared `beforeEach`, which
    // does not set it: `vi.clearAllMocks()` clears CALLS and leaves the
    // IMPLEMENTATION, so whichever test ran last is still answering. Written
    // without this line, this test inherited a `no-workspace` balance from four
    // tests earlier and rendered the first-run screen.
    balanceRead.mockResolvedValue({
      status: 'ok',
      balance: { total: 100, held: 0, available: 100, hasHold: false, heldNote: null },
    })
    vi.mocked(listPosts).mockResolvedValue([])
    vi.mocked(listConnections).mockResolvedValue([])
    vi.mocked(readBrain).mockResolvedValue({ status: 'no-brain' })

    render(await HomePage())

    expect(screen.getByTestId('home-get-started')).toBeInTheDocument()
    expect(await findOffer()).toBeInTheDocument()
  })
})
