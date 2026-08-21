import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { DEMO_FALLBACK_PAYLOAD } from '@sahoda/shared'

import * as Sentry from '@sentry/nextjs'
import { RING_DENOMINATOR } from '@/lib/brand/fields'

import { Topbar } from './topbar'
import { readWorkspaces, getActiveWorkspaceSlug } from '@/lib/workspaces'
import { readBalance } from '@/lib/wallet/read'
import { readBrain } from '@/lib/brand/read-brain'

// The topbar renders OUTSIDE every scoped error.tsx — (app)/error.tsx is a
// sibling of the layout that renders this component, and a React boundary does
// not catch its own sibling layout. So a throw in here does not degrade a chip,
// it reaches global-error.tsx: whole document replaced, ClerkProvider gone, no
// retry button. These tests pin the only thing standing between one unreadable
// DB row and a dead session.

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}))

// UserButton talks to Clerk's context, which no test provides. Stubbed to a
// marker so the assertions below can still prove the shell rendered WHOLE —
// a topbar missing its account control is a broken topbar, not a degraded one.
vi.mock('@clerk/nextjs', () => ({
  UserButton: () => <div data-testid="user-button" />,
}))

// `resolveActiveWorkspace` is pure and stays REAL: it is the function that turns
// a degraded read into a coherent view model, so mocking it would hide exactly
// the behaviour under test.
vi.mock('@/lib/workspaces', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/workspaces')>()),
  readWorkspaces: vi.fn(),
  getActiveWorkspaceSlug: vi.fn(),
}))

vi.mock('@/lib/wallet/read', () => ({
  readBalance: vi.fn(),
}))

// The Brand Brain ring is the fourth shell read, and it obeys the same rule as
// the other three: it may degrade, it may not throw past this component.
vi.mock('@/lib/brand/read-brain', () => ({
  readBrain: vi.fn(),
}))

const WORKSPACES = [
  { id: 'ws_1', name: 'Sahoda Labs', slug: 'sahoda-labs' },
  { id: 'ws_2', name: 'Second Brand', slug: 'second-brand' },
]

const mocked = {
  readWorkspaces: vi.mocked(readWorkspaces),
  getActiveWorkspaceSlug: vi.mocked(getActiveWorkspaceSlug),
  readBalance: vi.mocked(readBalance),
  readBrain: vi.mocked(readBrain),
  captureException: vi.mocked(Sentry.captureException),
}

beforeEach(() => {
  vi.clearAllMocks()
  mocked.readWorkspaces.mockResolvedValue({ status: 'ok', workspaces: WORKSPACES })
  mocked.getActiveWorkspaceSlug.mockResolvedValue('sahoda-labs')
  mocked.readBalance.mockResolvedValue({
    status: 'ok',
    balance: { total: 4200, held: 0, available: 4200, hasHold: false, heldNote: null },
  })
  mocked.readBrain.mockResolvedValue({ status: 'no-brain' })
})

describe('Topbar', () => {
  test('renders the whole shell when every read succeeds', async () => {
    render(await Topbar())

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByText('Sahoda Labs')).toBeInTheDocument()
    expect(screen.getByText('4,200')).toBeInTheDocument()
    expect(screen.getByTestId('user-button')).toBeInTheDocument()
  })

  test('still renders the shell when the workspace read rejects', async () => {
    // The headline case. Supabase unreachable, or the lazy env parse throwing on
    // a missing var — the single most likely infrastructure failure, and the one
    // that used to take the entire document down with it.
    mocked.readWorkspaces.mockRejectedValue(new Error('supabase unreachable'))

    render(await Topbar())

    // Rendering AT ALL is the assertion. If this throws, the component has not
    // failed soft and the user is looking at global-error.tsx.
    expect(screen.getByRole('banner')).toBeInTheDocument()
    // And the rest of the shell is intact, not just present-but-empty: the user
    // can still reach their account and their wallet from a degraded topbar.
    expect(screen.getByTestId('user-button')).toBeInTheDocument()
    expect(screen.getByText('4,200')).toBeInTheDocument()
  })

  test('reports a swallowed read to Sentry, tagged with which read failed', async () => {
    // Swallowed for the user, never for us. An unreported catch makes a broken
    // workspace read indistinguishable from a brand-new empty account: nobody is
    // paged, and the outage arrives as a support ticket days later.
    const failure = new Error('supabase unreachable')
    mocked.readWorkspaces.mockRejectedValue(failure)

    render(await Topbar())

    expect(mocked.captureException).toHaveBeenCalledWith(failure, {
      tags: { shell_read: 'workspaces' },
    })
  })

  test('keeps the reads that succeeded when a different read rejects', async () => {
    // Guards the per-read shape specifically. `Promise.all` rejects the instant
    // ANY input rejects, so a single shared try/catch around the whole batch
    // would discard the two good results and blank the topbar over one bad row.
    // Here the cookie read fails while workspaces and credits are fine.
    mocked.getActiveWorkspaceSlug.mockRejectedValue(new Error('called outside a request scope'))

    render(await Topbar())

    // Workspaces survived the sibling failure...
    expect(screen.getByText('Sahoda Labs')).toBeInTheDocument()
    expect(screen.getByText('4,200')).toBeInTheDocument()
    // ...and with no active-slug cookie, resolveActiveWorkspace falls back to
    // the first membership rather than rendering no workspace at all.
    expect(mocked.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { shell_read: 'active_workspace_slug' },
    })
  })

  test('renders a degraded but usable shell when every read rejects', async () => {
    mocked.readWorkspaces.mockRejectedValue(new Error('down'))
    mocked.getActiveWorkspaceSlug.mockRejectedValue(new Error('down'))
    mocked.readBalance.mockRejectedValue(new Error('down'))
    mocked.readBrain.mockRejectedValue(new Error('down'))

    render(await Topbar())

    expect(screen.getByRole('banner')).toBeInTheDocument()
    // The UNREADABLE MARK, not a zero. "We could not read your balance" and
    // "you have no credits" are different claims and only one of them is true —
    // telling a funded user they have 0 credits would stop them working for no
    // reason.
    //
    // Asserted by its accessible name rather than by the glyph. Both controls
    // used to render a bare '—', which docs/26 §4 retired: the same dash also
    // meant "not yet measured", so the two claims were indistinguishable, and a
    // dash with no name is a decoration a screen reader skips entirely.
    //
    // Still scoped by aria-label rather than matched globally: the ring degrades
    // the same way, so an unscoped query would find two and fail without either
    // one being wrong.
    expect(
      within(screen.getByLabelText('Credit balance unavailable. Open wallet')).getByText(
        /could not be read/i,
      ),
    ).toBeInTheDocument()
    // The ring degrades the same way, and to the same claim: not 0/15, which
    // would report every confirmed field as unconfirmed.
    expect(
      within(screen.getByLabelText('Brand Brain unavailable. Open Brand Brain')).getByText(
        /could not be read/i,
      ),
    ).toBeInTheDocument()
    // Each failure reported on its own, so the tags say which subsystem is down
    // rather than collapsing four outages into one anonymous event.
    expect(mocked.captureException).toHaveBeenCalledTimes(4)
    expect(mocked.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { shell_read: 'brand_brain' },
    })
  })

  describe('the Brand Brain ring', () => {
    test('counts confirmed fields, not filled ones', async () => {
      // A resolved brain with nothing confirmed. Every field is FILLED; the ring
      // must still read 0 — this is the claim the whole feature exists to make.
      mocked.readBrain.mockResolvedValue({
        status: 'ok',
        active: DEMO_FALLBACK_PAYLOAD,
        version: 1,
        provenance: new Map(),
        meta: undefined,
        intake: undefined,
        source: 'resolved',
      })

      render(await Topbar())

      expect(screen.getByText(`0/${RING_DENOMINATOR}`)).toBeInTheDocument()
    })

    test('offers onboarding, not a zero, when there is no brain at all', async () => {
      mocked.readBrain.mockResolvedValue({ status: 'no-brain' })

      render(await Topbar())

      // 0/15 would claim a brain exists and is unconfirmed. None exists.
      expect(screen.queryByText(`0/${RING_DENOMINATOR}`)).not.toBeInTheDocument()
      expect(screen.getByLabelText('No Brand Brain yet. Set one up')).toHaveAttribute(
        'href',
        '/onboarding',
      )
    })

    test('renders nothing at all when there is no workspace', async () => {
      // No workspace means no brain to have. A nudge here would point at a page
      // that cannot work yet — the same trap the credit chip's "No wallet yet"
      // case was built to avoid.
      mocked.readBrain.mockResolvedValue({ status: 'no-workspace' })

      render(await Topbar())

      expect(screen.getByRole('banner')).toBeInTheDocument()
      expect(screen.queryByText(/Brand Brain/)).not.toBeInTheDocument()
    })
  })
})

/**
 * THE PAIR. Neither test means anything alone — together they are the whole
 * claim: two different facts about the account produce two different sentences.
 *
 * Before this, `listWorkspaces` returned `[]` for both, so the switcher told a
 * founder whose read had merely hiccuped that they had no workspace and offered
 * to create one. Run 22 fixed the same conflation on /connections; this is the
 * read UPSTREAM of that fix, which is what made the fix itself falsifiable.
 */
describe('the workspace switcher tells "none" apart from "could not tell"', () => {
  test('offers to create one when the account genuinely has none', async () => {
    mocked.readWorkspaces.mockResolvedValue({ status: 'ok', workspaces: [] })

    render(await Topbar())

    expect(screen.getByRole('button', { name: 'Create workspace' })).toBeInTheDocument()
  })

  test('never offers to create one when the read did not answer', async () => {
    mocked.readWorkspaces.mockResolvedValue({ status: 'unreadable' })

    render(await Topbar())

    // The false claim: "you have no workspace", asserted from a read that failed.
    expect(screen.queryByRole('button', { name: 'Create workspace' })).toBeNull()
    // And it says which of the two it is, so the sentence beneath it is not the
    // only thing standing between the user and a wrong conclusion.
    expect(screen.getByText('Workspace unavailable')).toBeInTheDocument()
  })

  test('a rejected read is unreadable, not an empty account', async () => {
    // softRead's fallback carries the same claim as the reader's own catch. A
    // fallback of `[]` here would re-open the exact hole from the other side.
    mocked.readWorkspaces.mockRejectedValue(new Error('supabase unreachable'))

    render(await Topbar())

    expect(screen.queryByRole('button', { name: 'Create workspace' })).toBeNull()
    expect(screen.getByText('Workspace unavailable')).toBeInTheDocument()
  })
})
