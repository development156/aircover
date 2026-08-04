import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import * as Sentry from '@sentry/nextjs'

import { Topbar } from './topbar'
import { listWorkspaces, getActiveWorkspaceSlug } from '@/lib/workspaces'
import { readBalance } from '@/lib/wallet/read'

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
  listWorkspaces: vi.fn(),
  getActiveWorkspaceSlug: vi.fn(),
}))

vi.mock('@/lib/wallet/read', () => ({
  readBalance: vi.fn(),
}))

const WORKSPACES = [
  { id: 'ws_1', name: 'Sahoda Labs', slug: 'sahoda-labs' },
  { id: 'ws_2', name: 'Second Brand', slug: 'second-brand' },
]

const mocked = {
  listWorkspaces: vi.mocked(listWorkspaces),
  getActiveWorkspaceSlug: vi.mocked(getActiveWorkspaceSlug),
  readBalance: vi.mocked(readBalance),
  captureException: vi.mocked(Sentry.captureException),
}

beforeEach(() => {
  vi.clearAllMocks()
  mocked.listWorkspaces.mockResolvedValue(WORKSPACES)
  mocked.getActiveWorkspaceSlug.mockResolvedValue('sahoda-labs')
  mocked.readBalance.mockResolvedValue({
    status: 'ok',
    balance: { total: 4200, held: 0, available: 4200, hasHold: false, heldNote: null },
  })
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
    mocked.listWorkspaces.mockRejectedValue(new Error('supabase unreachable'))

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
    mocked.listWorkspaces.mockRejectedValue(failure)

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
    mocked.listWorkspaces.mockRejectedValue(new Error('down'))
    mocked.getActiveWorkspaceSlug.mockRejectedValue(new Error('down'))
    mocked.readBalance.mockRejectedValue(new Error('down'))

    render(await Topbar())

    expect(screen.getByRole('banner')).toBeInTheDocument()
    // An em dash, not a zero. "We could not read your balance" and "you have no
    // credits" are different claims and only one of them is true — telling a
    // funded user they have 0 credits would stop them working for no reason.
    expect(screen.getByText('—')).toBeInTheDocument()
    // Each failure reported on its own, so the tags say which subsystem is down
    // rather than collapsing three outages into one anonymous event.
    expect(mocked.captureException).toHaveBeenCalledTimes(3)
  })
})
