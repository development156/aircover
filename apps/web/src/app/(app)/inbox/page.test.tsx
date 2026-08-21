import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * THE PROPERTY THIS LANE EXISTS FOR: THE INBOX RENDERS WITH ZERNIO UNREACHABLE.
 *
 * ── HOW ZERNIO IS MADE UNREACHABLE HERE ──────────────────────────────────────
 * Not by stubbing the answer — by making the module that talks to Zernio THROW,
 * exactly as an unreachable host would. `readConversations` is the live read, and
 * every test below that says "Zernio down" makes it reject. If any part of the
 * render path awaited it without a guard, these tests would reject too.
 *
 * The store is stubbed at `readStoredThreads` because it is a database call, and
 * what is under test here is the composition — which source the page trusts, and
 * what it says when the other one fails.
 */

const readConversations = vi.fn()
const readStoredThreads = vi.fn()
const countAccounts = vi.fn(async () => 1)

vi.mock('@/lib/inbox/read', () => ({
  readConversations: (...a: unknown[]) => readConversations(...a),
  countAccounts: (...a: unknown[]) => countAccounts(...a),
}))
vi.mock('@/lib/inbox/store-read', () => ({
  readStoredThreads: (...a: unknown[]) => readStoredThreads(...a),
}))

const { default: InboxMessagesPage } = await import('./page')
const { decideStoreSurface } = await import('@/lib/inbox/store-decision')

const storedRow = (id: string, name: string) => ({
  id,
  channel: 'instagram',
  platformThreadId: id,
  authorName: name,
  authorHandle: `@${name.toLowerCase()}`,
  preview: 'Do you deliver to Andheri?',
  postedAt: '2026-08-21T09:00:00.000Z',
  status: 'open',
  kind: 'dm',
})

/** The real classifier, never a hand-made decision — the states must be reachable. */
const decisionFor = (args: Parameters<typeof decideStoreSurface>[0]) => decideStoreSurface(args)

beforeEach(() => {
  vi.clearAllMocks()
  countAccounts.mockResolvedValue(1)
})

describe('the inbox with Zernio unreachable', () => {
  it('RENDERS THE STORED CONVERSATIONS when the live read rejects', async () => {
    // Zernio is down, hard.
    readConversations.mockRejectedValue(new Error('getaddrinfo ENOTFOUND zernio.com'))
    readStoredThreads.mockImplementation(async (_s, opts) => ({
      rows: [storedRow('c1', 'Priya'), storedRow('c2', 'Arjun')],
      decision: decisionFor({
        surface: 'conversations',
        connectedAccounts: 1,
        storedRows: 2,
        eventsEverReceived: true,
        historyAvailable: (opts as { historyAvailable?: boolean }).historyAvailable,
      }),
    }))

    render(await InboxMessagesPage())

    // The rows are on the screen. This is the whole claim.
    expect(screen.getByText('Priya')).toBeInTheDocument()
    expect(screen.getByText('Arjun')).toBeInTheDocument()
  })

  it('SAYS what is missing rather than implying the store is the whole truth', async () => {
    readConversations.mockRejectedValue(new Error('ECONNREFUSED'))
    readStoredThreads.mockImplementation(async (_s, opts) => ({
      rows: [storedRow('c1', 'Priya')],
      decision: decisionFor({
        surface: 'conversations',
        connectedAccounts: 1,
        storedRows: 1,
        eventsEverReceived: true,
        historyAvailable: (opts as { historyAvailable?: boolean }).historyAvailable,
      }),
    }))

    render(await InboxMessagesPage())

    // The banner renders for 'partial', which is what ok_history_unavailable maps to.
    const banner = screen.getByRole('status')
    expect(banner).toHaveAttribute('data-surface-state', 'partial')
    expect(banner.textContent ?? '').toMatch(/older|platform/i)
  })

  it('passes historyAvailable: false to the classifier when the live read throws', async () => {
    // The mechanism, asserted directly: a rejection becomes a LABEL, not an
    // exception. If this were ever changed to rethrow, the test above would fail
    // too — this one names why.
    readConversations.mockRejectedValue(new Error('down'))
    readStoredThreads.mockResolvedValue({
      rows: [],
      decision: decisionFor({
        surface: 'conversations',
        connectedAccounts: 1,
        storedRows: 0,
        eventsEverReceived: true,
      }),
    })

    render(await InboxMessagesPage())

    expect(readStoredThreads).toHaveBeenCalledWith(
      'conversations',
      expect.objectContaining({ historyAvailable: false }),
    )
  })

  it('does not blank the shell — the panes stand even with nothing to show', async () => {
    readConversations.mockRejectedValue(new Error('down'))
    readStoredThreads.mockResolvedValue({
      rows: [],
      decision: decisionFor({
        surface: 'conversations',
        connectedAccounts: 1,
        storedRows: 0,
        eventsEverReceived: false,
      }),
    })

    // Rendering at all is the first assertion; a throw here is the failure this file
    // exists to catch. The second is structural: the THREE PANES are still mounted.
    // An earlier single-pane design replaced the whole screen with a reason, which
    // meant a new user never saw what the inbox IS — so "the panes stay standing" is
    // a real property, not a side effect, and it is asserted rather than assumed.
    const { container } = render(await InboxMessagesPage())
    expect(container.querySelector('[class*="group/panes"]')).not.toBeNull()

    // And the list pane says why it is empty instead of showing nothing at all.
    expect(document.body.textContent ?? '').toMatch(/nothing read yet/i)
  })
})

describe('what it refuses to claim', () => {
  it('does NOT say the customer has no conversations before the first event', async () => {
    // Webhooks deliver nothing that happened before the subscription, and there is no
    // replay endpoint. An empty store on day one is not a reading of the inbox.
    readConversations.mockResolvedValue({ rows: [], decision: { showList: true }, nextCursor: null })
    readStoredThreads.mockResolvedValue({
      rows: [],
      decision: decisionFor({
        surface: 'conversations',
        connectedAccounts: 1,
        storedRows: 0,
        eventsEverReceived: false,
      }),
    })

    render(await InboxMessagesPage())

    expect(document.body.textContent ?? '').not.toMatch(/\bno conversations\b/i)
  })

  it('DOES say empty once events have arrived and none were conversations', async () => {
    readConversations.mockResolvedValue({ rows: [], decision: { showList: true }, nextCursor: null })
    readStoredThreads.mockResolvedValue({
      rows: [],
      decision: decisionFor({
        surface: 'conversations',
        connectedAccounts: 1,
        storedRows: 0,
        eventsEverReceived: true,
      }),
    })

    render(await InboxMessagesPage())
    // The two states must reach the screen differently, or the distinction the
    // classifier makes is lost at the last step.
    expect(document.body.textContent ?? '').toMatch(/no conversations yet/i)
  })
})

describe('the store is what the page trusts', () => {
  it('renders the STORE rows, not the live ones, when both answer', async () => {
    readConversations.mockResolvedValue({
      rows: [{ id: 'live1', platform: 'instagram', accountId: 'a', participantName: 'FromZernio' }],
      decision: { showList: true },
      nextCursor: null,
    })
    readStoredThreads.mockResolvedValue({
      rows: [storedRow('s1', 'FromStore')],
      decision: decisionFor({
        surface: 'conversations',
        connectedAccounts: 1,
        storedRows: 1,
        eventsEverReceived: true,
        historyAvailable: true,
      }),
    })

    render(await InboxMessagesPage())

    expect(screen.getByText('FromStore')).toBeInTheDocument()
    expect(screen.queryByText('FromZernio')).not.toBeInTheDocument()
  })
})
