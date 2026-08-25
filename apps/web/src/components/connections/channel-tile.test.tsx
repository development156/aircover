import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { X_MONTHLY_RATION } from '@sahoda/publishing'
import type { Connection } from '@sahoda/shared'

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
    const { container } = render(<ChannelTile entry={ENTRY.facebook} now={NOW} />)

    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    expect(container.querySelector('[data-coming-soon="true"]')?.tagName).toBe('DIV')
  })

  it('never uses aria-disabled either', () => {
    // Also forbidden: it describes a control that EXISTS and is unavailable, not
    // one that was never built.
    const { container } = render(<ChannelTile entry={ENTRY.youtube} now={NOW} />)

    expect(container.querySelector('[aria-disabled]')).toBeNull()
  })

  it('says coming soon in words, not only in a border', () => {
    render(<ChannelTile entry={ENTRY.pinterest} now={NOW} />)

    expect(screen.getByText(/coming soon/i)).toBeInTheDocument()
  })

  it('carries no number about the customer', () => {
    // A container labelled coming soon is a promise we control; a figure inside
    // one is a claim about their business no query can support.
    const { container } = render(<ChannelTile entry={ENTRY.telegram} now={NOW} />)

    expect(container.textContent ?? '').not.toMatch(/\d/)
  })
})

describe('the two axes', () => {
  it('states readiness and connection SEPARATELY on a connected channel', () => {
    // The defect this replaced: one slot, two vocabularies. A channel that
    // publishes today and whose token is healthy makes two different claims, and
    // a reader must be able to get either without decoding the other.
    render(<ChannelTile entry={ENTRY.instagram} connection={connection()} now={NOW} />)

    expect(screen.getByText('Publishes today')).toBeInTheDocument()
    expect(screen.getByText('Connected')).toBeInTheDocument()
  })

  it('does not let an unproven channel look connected', () => {
    const { container } = render(<ChannelTile entry={ENTRY.x} now={NOW} />)

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
        connection={connection({ status: 'expired' })}
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
        ration={{ status: 'ok', used: 3, remaining: X_MONTHLY_RATION - 3 }}
        now={NOW}
      />,
    )

    const meter = screen.getByText(/X posts this month/i).closest('details')!
    // The CONSTANT, never the literal. This line read `/of 40/` and was the only
    // thing in the repo still pinning the old ration — a grep of the meter component
    // and its data source both missed it, and the gate did not. A denominator test
    // that hardcodes the denominator asserts nothing about the denominator.
    //
    // RETARGETED, not weakened, when the meter's pricing sentence moved into a
    // disclosure: the count and the ration are now ONE figure ("3 of 12") rather
    // than two nodes, so `/^3$/` matched nothing. Asserting the pair together is
    // the stronger claim — it pins that the numerator is never rendered without
    // the denominator that gives it meaning, which is this meter's whole point.
    expect(within(meter).getByText(new RegExp(`^3 of ${X_MONTHLY_RATION}$`))).toBeInTheDocument()
    // And the sentence naming WHOSE ration it is survives the move, on the line
    // that is visible without opening anything.
    expect(within(meter).getByText(/from Sahoda’s ration/i)).toBeInTheDocument()
  })

  it('is absent from every other channel', () => {
    render(<ChannelTile entry={ENTRY.linkedin} now={NOW} />)

    expect(screen.queryByText(/posts this month/i)).toBeNull()
  })

  it('says the allowance is SAHODA’s, not X’s', () => {
    // X has no monthly write allowance left to count against — as of Feb 2026 the
    // API is pay-per-use. Attributing the number to X would invent a limit X does
    // not impose.
    render(
      <ChannelTile
        entry={ENTRY.x}
        ration={{ status: 'ok', used: 0, remaining: X_MONTHLY_RATION }}
        now={NOW}
      />,
    )

    expect(screen.getByText(/allowance is ours rather than X’s/i)).toBeInTheDocument()
  })

  it('renders an unreadable count as a gap, NEVER as zero', () => {
    // "0 of N used" off a failed read tells a customer they have spent nothing
    // when the truth is we could not find out.
    render(<ChannelTile entry={ENTRY.x} ration={{ status: 'unreadable' }} now={NOW} />)

    expect(screen.getByText(/couldn’t read your x count/i)).toBeInTheDocument()
    expect(screen.queryByText(new RegExp(`of ${X_MONTHLY_RATION}`))).toBeNull()
    // The absence mark must carry an accessible name — a bare rule is decoration
    // a screen reader skips, which makes the gap invisible rather than legible.
    expect(screen.getByText(/could not be read/i)).toBeInTheDocument()
  })
})
