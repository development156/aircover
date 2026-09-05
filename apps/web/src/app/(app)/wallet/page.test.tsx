import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { countLedger, readBalance, readLedger, readOpenHolds } from '@/lib/wallet/read'

import WalletPage from './page'

/**
 * /wallet has to answer three different questions honestly, and for a long time
 * it answered two of them with the same red alert:
 *
 *   "Could not read your credit balance just now. Reload to try again."
 *
 * For a signed-in user who has not created a workspace yet, every clause of
 * that sentence is wrong. Nothing failed, there is nothing to re-read, and no
 * number of reloads produces a workspace. It is a false diagnosis carrying a
 * false remedy — the single worst thing a first run can say to someone
 * evaluating the product.
 *
 * These tests pin the three answers apart. The read layer's own split is
 * covered in `lib/wallet/read.test.ts`; this is the screen keeping its half of
 * the bargain.
 */

vi.mock('@/lib/wallet/read', () => ({
  HISTORY_LIMIT: 50,
  readBalance: vi.fn(),
  readLedger: vi.fn(),
  // The exact entry count, which the windowed list cannot answer for itself.
  // `null` is its "could not count" answer and is the safe default here.
  countLedger: vi.fn(),
  readOpenHolds: vi.fn(),
}))

// The top-up panel reaches a `'use server'` module (Clerk + the billing rail) on
// import. Its behaviour is not what this file is about; its PRESENCE is, so the
// stub keeps an identifiable marker.
// Retargeted, not deleted: the CLAIM both assertions make is that the way to get
// more credits appears with the wallet and disappears with the workspace. The panel
// that does that changed from a plan picker to a credit top-up on 2026-09-03; the
// claim did not.
vi.mock('@/components/wallet/top-up-credits', () => ({
  TopUpCredits: () => <div data-testid="top-up-panel" />,
}))

vi.mock('@/app/actions/workspace', () => ({ createWorkspace: vi.fn() }))

const balanceRead = vi.mocked(readBalance)
const ledgerRead = vi.mocked(readLedger)
const ledgerCount = vi.mocked(countLedger)
const holdsRead = vi.mocked(readOpenHolds)

const FULL_WALLET = {
  total: 1200,
  held: 200,
  available: 1000,
  hasHold: true,
  heldNote: '200 credits held by actions in progress. Released when they finish or fail.',
}

beforeEach(() => {
  vi.clearAllMocks()
  ledgerRead.mockResolvedValue({ entries: [], skipped: 0 })
  ledgerCount.mockResolvedValue(0)
  holdsRead.mockResolvedValue([])
})

describe('/wallet with no workspace yet', () => {
  beforeEach(() => {
    balanceRead.mockResolvedValue({ status: 'no-workspace' })
  })

  test('does not accuse the app of failing to read anything', async () => {
    render(await WalletPage())

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/could not read/i)).not.toBeInTheDocument()
    // "Reload to try again" is the specific false remedy. A reload creates no
    // workspace, so offering it sends the user round a loop with no exit.
    expect(screen.queryByText(/reload/i)).not.toBeInTheDocument()
  })

  test('offers the one thing that actually helps: creating a workspace', async () => {
    render(await WalletPage())

    expect(screen.getByRole('button', { name: /create workspace/i })).toBeInTheDocument()
  })

  test('shows no balance, no ledger and no top-up — none of them exist yet', async () => {
    render(await WalletPage())

    // A zero hero would be a second falsehood: it claims a wallet was read and
    // found empty. "No credit activity yet" claims the same about the ledger.
    expect(screen.queryByText(/credits to spend/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/no credit activity yet/i)).not.toBeInTheDocument()
    // Top-up would dead-end: `startCheckout` refuses with "Create a workspace
    // first." Rendering the button is a fake affordance.
    expect(screen.queryByTestId('top-up-panel')).not.toBeInTheDocument()
  })
})

describe('/wallet when the balance genuinely could not be read', () => {
  beforeEach(() => {
    balanceRead.mockResolvedValue({ status: 'unreadable' })
  })

  test('keeps the alert and the reload remedy — here they are both true', async () => {
    render(await WalletPage())

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/could not read your credit balance/i)
    expect(alert).toHaveTextContent(/reload/i)
  })

  test('does not offer to create a workspace — the user already has one', async () => {
    render(await WalletPage())

    // The mirror-image false remedy. A member whose read hiccuped would be told
    // to create a workspace they already own.
    expect(screen.queryByRole('button', { name: /create workspace/i })).not.toBeInTheDocument()
  })

  test('still renders the rest of the wallet — one failed read is not a dead page', async () => {
    render(await WalletPage())

    expect(screen.getByTestId('top-up-panel')).toBeInTheDocument()
  })
})

describe('/wallet with a readable balance', () => {
  test('renders the hero and never an error', async () => {
    balanceRead.mockResolvedValue({ status: 'ok', balance: FULL_WALLET })

    render(await WalletPage())

    expect(screen.getByText('1,000')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /create workspace/i })).not.toBeInTheDocument()
  })

  test('a real zero is a balance, not a first run', async () => {
    // A workspace with no ledger activity has no `credit_balances` row at all.
    // That must render the hero at zero — offering "Create workspace" to
    // someone who has one would be the same false remedy in a new place.
    balanceRead.mockResolvedValue({
      status: 'ok',
      balance: { total: 0, held: 0, available: 0, hasHold: false, heldNote: null },
    })

    render(await WalletPage())

    expect(screen.getByText(/no credits to spend right now/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /create workspace/i })).not.toBeInTheDocument()
  })
})
