import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { X_MONTHLY_RATION } from '@sahoda/publishing'
import type { Connection } from '@sahoda/shared'

// The connect controls call `useRouter().refresh()` when a popup ends, so the
// tile now sits inside the app-router context. Mocked rather than wrapped: the
// refresh is `use-connect-flow`'s behaviour and has its own test.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { ChannelTile } from './channel-tile'
import { ENTRY } from '@/lib/connections/catalogue'

/**
 * READ TEXT, NOT BOXES. Run 13's regression asserted widths, offsets and overflow
 * flags, went green at every width, and shipped a rail rendering the literal
 * string "S Sah". Every assertion here reads rendered text or a role.
 */

const NOW = new Date('2026-08-19T12:00:00.000Z')

const connection = (over: Partial<Connection> = {}): Connection =>
  ({
    id: '11111111-1111-4111-8111-111111111111',
    workspace_id: '22222222-2222-4222-8222-222222222222',
    platform: 'instagram',
    status: 'active',
    external_account: { id: 'ig-1', username: 'kumarchai' },
    scopes: [],
    expires_at: '2026-10-01T00:00:00.000Z',
    last_checked_at: null,
    created_by: 'user_1',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...over,
  }) as Connection

describe('a channel with no adapter', () => {
  it('renders a div and offers NO control at all', () => {
    // `docs/26` §10.2. A `<button disabled>` is still announced as a button: the
    // screen reader offers the action, the user takes it, nothing happens, and the
    // failure reads as "broken app" rather than "unbuilt feature".
    const { container } = render(<ChannelTile entry={ENTRY.pinterest} connections={[]} now={NOW} />)

    // RETARGETED, and the claim is narrower than it looks. The rule is that a
    // channel with no adapter must offer no control that PURPORTS TO CONNECT IT
    // — a `<button disabled>` is still announced as a button, so the user takes
    // the action, nothing happens, and it reads as a broken app rather than an
    // unbuilt feature. The tile now carries a Details control, which is a real
    // working button that opens a reference panel and offers to connect nothing.
    //
    // Asserted as "no connect affordance", not "no buttons": the earlier form
    // would have to be deleted the moment any working control landed here, and a
    // guard that has to be deleted to add a feature is not guarding the feature.
    expect(screen.queryByRole('button', { name: /connect/i })).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    expect(container.querySelector('[data-coming-soon="true"]')?.tagName).toBe('DIV')

    // And the one control there IS must be genuinely available. A disabled
    // Details button would be the very shape the rule forbids.
    const details = screen.getByRole('button', { name: /what sahoda does with/i })
    expect(details).not.toBeDisabled()
  })

  it('never uses aria-disabled either', () => {
    // Also forbidden: it describes a control that EXISTS and is unavailable, not
    // one that was never built.
    const { container } = render(<ChannelTile entry={ENTRY.youtube} connections={[]} now={NOW} />)

    expect(container.querySelector('[aria-disabled]')).toBeNull()
  })

  it('says coming soon in words, not only in a border', () => {
    render(<ChannelTile entry={ENTRY.pinterest} connections={[]} now={NOW} />)

    expect(screen.getByText(/coming soon/i)).toBeInTheDocument()
  })

  it('carries no number about the customer', () => {
    // A container labelled coming soon is a promise we control; a figure inside
    // one is a claim about their business no query can support.
    const { container } = render(<ChannelTile entry={ENTRY.pinterest} connections={[]} now={NOW} />)

    expect(container.textContent ?? '').not.toMatch(/\d/)
  })
})

describe('the two axes', () => {
  it('states readiness and connection SEPARATELY on a connected channel', () => {
    // The defect this replaced: one slot, two vocabularies. A channel that
    // publishes today and whose token is healthy makes two different claims, and
    // a reader must be able to get either without decoding the other.
    render(<ChannelTile entry={ENTRY.instagram} connections={[connection()]} now={NOW} />)

    expect(screen.getByText('Publishes today')).toBeInTheDocument()
    expect(screen.getByText('Connected')).toBeInTheDocument()
  })

  it('does not let an unproven channel look connected', () => {
    const { container } = render(<ChannelTile entry={ENTRY.x} connections={[]} now={NOW} />)

    expect(screen.getByText('Not proven live')).toBeInTheDocument()
    expect(screen.getByText('Not connected')).toBeInTheDocument()
    expect(container.querySelector('[data-connected]')).toHaveAttribute('data-connected', 'false')
  })

  it('keeps a broken token URGENT even on a channel that publishes today', () => {
    // Certainty and urgency are orthogonal (`docs/26` §3.2). A channel can be
    // maximally real and maximally in need of you at the same instant, and one
    // chip cannot say both.
    render(
      <ChannelTile
        entry={ENTRY.instagram}
        connections={[connection({ status: 'expired' })]}
        now={NOW}
      />,
    )

    expect(screen.getByText('Publishes today')).toBeInTheDocument()
    expect(screen.getByText('Needs you')).toBeInTheDocument()
  })
})

describe('the X spend meter', () => {
  it('appears only where it is passed', () => {
    render(
      <ChannelTile
        entry={ENTRY.x}
        connections={[]}
        ration={{ status: 'ok', used: 3, remaining: X_MONTHLY_RATION - 3 }}
        now={NOW}
      />,
    )

    const meter = screen.getByText(/posts remaining this month/i).closest('details')!
    // The CONSTANT, never the literal. This line read `/of 40/` and was the only
    // thing in the repo still pinning the old ration — a grep of the meter component
    // and its data source both missed it, and the gate did not. A denominator test
    // that hardcodes the denominator asserts nothing about the denominator.
    //
    // RETARGETED TWICE, weakened neither time. First when the pricing sentence moved
    // into a disclosure and the pair became one figure ("3 of 12"), killing `/^3$/`.
    // Now again because the meter COUNTS DOWN: it renders what is left, so a
    // used-of-total assertion matches nothing. Derived from the constant, so it
    // still cannot drift with the ration.
    expect(within(meter).getByText(new RegExp(`^${X_MONTHLY_RATION - 3}$`))).toBeInTheDocument()
    // ── THE LINE THIS METER CANNOT LOSE ────────────────────────────────────
    // "9 posts remaining this month" on its own is a false claim about X: X has
    // no monthly write allowance to remain against (pay-per-use since Feb 2026),
    // so an unattributed countdown invents a limit X does not impose. The
    // attribution has to be OUTSIDE the disclosure — visible without opening
    // anything — or the number is read alone. That is what this pins, and it is
    // why the assertion names the reset too: both halves are claims we make.
    expect(within(meter).getByText(/From Sahoda’s ration, resets on the 1st/i)).toBeInTheDocument()
  })

  it('is absent from every other channel', () => {
    render(<ChannelTile entry={ENTRY.linkedin} connections={[]} now={NOW} />)

    expect(screen.queryByText(/posts this month/i)).toBeNull()
  })

  it('says the allowance is SAHODA’s, not X’s', () => {
    // X has no monthly write allowance left to count against — as of Feb 2026 the
    // API is pay-per-use. Attributing the number to X would invent a limit X does
    // not impose.
    render(
      <ChannelTile
        entry={ENTRY.x}
        connections={[]}
        ration={{ status: 'ok', used: 0, remaining: X_MONTHLY_RATION }}
        now={NOW}
      />,
    )

    expect(screen.getByText(/allowance is ours rather than X’s/i)).toBeInTheDocument()
  })

  it('renders an unreadable count as a gap, NEVER as zero', () => {
    // "0 of N used" off a failed read tells a customer they have spent nothing
    // when the truth is we could not find out.
    render(
      <ChannelTile entry={ENTRY.x} connections={[]} ration={{ status: 'unreadable' }} now={NOW} />,
    )

    expect(screen.getByText(/couldn’t read your x count/i)).toBeInTheDocument()
    expect(screen.queryByText(new RegExp(`of ${X_MONTHLY_RATION}`))).toBeNull()
    // The absence mark must carry an accessible name — a bare rule is decoration
    // a screen reader skips, which makes the gap invisible rather than legible.
    expect(screen.getByText(/could not be read/i)).toBeInTheDocument()
  })
})
