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

/**
 * ── THE EXAMPLE MOVED FROM PINTEREST TO SNAPCHAT, AND THE CLAIM DID NOT ──────
 * Every test below used `ENTRY.pinterest` as its stand-in for "a channel Sahoda
 * cannot connect". On 2026-08-26 Pinterest stopped being one: `GET
 * /v1/connect/pinterest` answers 200 with a real authUrl, so it became a
 * connect-only platform with a working Connect button, and these tests started
 * failing because their EXAMPLE had changed rather than because the rule had.
 *
 * Snapchat is the honest replacement, and a sharper one. It is a platform Zernio
 * genuinely names and genuinely refuses us — 403 `PLATFORM_BETA_RESTRICTED` —
 * so the tile really cannot offer a control, rather than merely not having one
 * yet. Retargeted, never deleted: the rule these assert is unchanged.
 */
describe('a channel with no adapter', () => {
  it('renders a div and offers NO control at all', () => {
    // `docs/26` §10.2. A `<button disabled>` is still announced as a button: the
    // screen reader offers the action, the user takes it, nothing happens, and the
    // failure reads as "broken app" rather than "unbuilt feature".
    const { container } = render(<ChannelTile entry={ENTRY.snapchat} connections={[]} now={NOW} />)

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
    render(<ChannelTile entry={ENTRY.snapchat} connections={[]} now={NOW} />)

    expect(screen.getByText(/coming soon/i)).toBeInTheDocument()
  })

  it('carries no number about the customer', () => {
    // A container labelled coming soon is a promise we control; a figure inside
    // one is a claim about their business no query can support.
    const { container } = render(<ChannelTile entry={ENTRY.snapchat} connections={[]} now={NOW} />)

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

/**
 * ── A CARD THAT CANNOT BE PRESSED MUST NOT OFFER THE PRESS GESTURE ───────────
 *
 * The coming-soon tile carried the connectable tile's `hover:-translate-y-px`.
 * The intent was good — a planned channel should not read as a dead box — but a
 * lift on pointer-over is precisely the gesture every other card on this page
 * uses to mean "this does something", and this one has nothing to press: no
 * button, no link, nothing to tab to. The header of the component is at pains to
 * guarantee that, refusing even `<button disabled>` on the grounds that offering
 * an action and then swallowing it reads as a broken app rather than an unbuilt
 * feature. A hover lift makes the identical promise with motion instead of
 * markup, and breaks it the same way.
 *
 * The tile still answers the pointer — its ground settles onto `--surface-2` —
 * so this asserts the ABSENCE of the press gesture, not the absence of feedback.
 * Both halves matter: dropping the hover entirely would pass an "is not
 * translated" check while re-introducing the dead box.
 */
describe('the coming-soon tile does not pretend to be pressable', () => {
  it('offers no lift, because there is nothing under the pointer to press', () => {
    render(<ChannelTile entry={ENTRY.snapchat} connections={[]} now={NOW} />)
    const tile = document.querySelector('[data-coming-soon="true"]')!

    // The press affordance, by any spelling Tailwind gives it.
    expect(tile.className).not.toMatch(/hover:-?translate/)
  })

  it('still answers the pointer, so it does not read as a dead box', () => {
    render(<ChannelTile entry={ENTRY.snapchat} connections={[]} now={NOW} />)
    const tile = document.querySelector('[data-coming-soon="true"]')!

    expect(tile.className).toMatch(/hover:/)
    // And it keeps the transition, or the answer would snap rather than ease.
    expect(tile.className).toContain('transition-micro')
  })

  it('the CONNECTABLE tile keeps its lift — the gesture is right where a press exists', () => {
    // The contrast is the point. If a future change strips hover motion from the
    // whole page, the first assertion above would still pass and would be
    // asserting nothing; this one goes red instead.
    render(<ChannelTile entry={ENTRY.linkedin} connections={[]} now={NOW} />)
    const tile = document.querySelector('[data-channel="linkedin"]')!

    expect(tile.className).toMatch(/hover:-translate-y-px/)
  })
})
