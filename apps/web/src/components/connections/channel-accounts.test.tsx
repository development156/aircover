import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Connection } from '@sahoda/shared'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { ChannelTile } from './channel-tile'
import { ENTRY } from '@/lib/connections/catalogue'

/**
 * THE SECOND ACCOUNT.
 *
 * A plan sells SLOTS and a slot holds one account: `connections_ws_platform_account`
 * is unique on `(workspace_id, platform, external_account ->> 'id')`, and both OAuth
 * routes count ROWS against the allowance. So four Instagram accounts have always
 * been four slots and one channel.
 *
 * The screen was the only layer that disagreed. It built
 * `new Map(rows.map((c) => [c.platform, c]))`, which keeps the LAST value for a key,
 * so the second account rendered nowhere — not hidden behind a control, not counted,
 * simply absent, while still drawing a slot and still publishing. And once a platform
 * held any connection the Connect button was not rendered at all, so nothing in the
 * product could add the second one.
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

const shop = connection()
const cafe = connection({
  id: '33333333-3333-4333-8333-333333333333',
  external_account: { id: 'ig-2', username: 'kumarcafe' },
  expires_at: '2026-09-05T00:00:00.000Z',
})

describe('two accounts on one channel', () => {
  it('renders BOTH, not whichever row was written last', () => {
    render(<ChannelTile entry={ENTRY.instagram} connections={[shop, cafe]} now={NOW} />)

    expect(screen.getByText('@kumarchai')).toBeInTheDocument()
    expect(screen.getByText('@kumarcafe')).toBeInTheDocument()
  })

  it('counts them on the tile, because data-connected cannot tell one from two', () => {
    const { container } = render(
      <ChannelTile entry={ENTRY.instagram} connections={[shop, cafe]} now={NOW} />,
    )

    // `data-connected` was true for one account and true for two, which is exactly
    // how a second account went missing with no check noticing.
    expect(container.querySelector('[data-channel="instagram"]')).toHaveAttribute(
      'data-account-count',
      '2',
    )
  })

  it('gives every account its OWN disconnect, named after that account', () => {
    render(<ChannelTile entry={ENTRY.instagram} connections={[shop, cafe]} now={NOW} />)

    // Two controls, not one. A single shared Disconnect would have to pick an
    // account silently, which is how somebody removes the wrong one.
    expect(screen.getAllByRole('button', { name: /disconnect/i })).toHaveLength(2)
  })

  it('gives every account its own expiry, because they do not expire together', () => {
    render(<ChannelTile entry={ENTRY.instagram} connections={[shop, cafe]} now={NOW} />)

    // 2026-08-19T12:00 to 2026-10-01T00:00 is 42.5 days and `daysUntil` floors,
    // so 42; to 2026-09-05T00:00 is 16.5, so 16. The figures here are the ones
    // the READER sees, taken from the engine rather than from my own arithmetic
    // — I wrote 43 and 17 first and this assertion is what caught it.
    //
    // Two accounts connected weeks apart share no deadline, and one figure for
    // both would be wrong for at least one of them.
    expect(screen.getByText('42d left')).toBeInTheDocument()
    expect(screen.getByText('16d left')).toBeInTheDocument()
  })

  it('states each account status separately when they disagree', () => {
    render(
      <ChannelTile
        entry={ENTRY.instagram}
        connections={[shop, connection({ id: 'c2', status: 'expired' })]}
        now={NOW}
      />,
    )

    // There is no honest single answer to "is Instagram connected" when one
    // account is live and the other is dead.
    expect(screen.getByText('Connected')).toBeInTheDocument()
    expect(screen.getByText('Needs you')).toBeInTheDocument()
  })
})

describe('adding another account is offered at all', () => {
  it('still shows a connect control once a channel already has one', () => {
    render(<ChannelTile entry={ENTRY.instagram} connections={[shop]} now={NOW} />)

    // THE HARD BLOCKER THIS REMOVES. The tile rendered Connect only when the
    // platform had NO connection, so a workspace that linked one Instagram
    // account had no way in the whole product to add a second — while the
    // database, the plan gate and both OAuth routes were willing to hold one.
    expect(screen.getByRole('button', { name: /add another account/i })).toBeInTheDocument()
  })

  it('says "Connect" on an empty channel and "Add another" on a linked one', () => {
    // "Connect Instagram" beside a connected Instagram account offers a thing
    // already done, and a reader reasonably concludes the button is broken.
    const empty = render(<ChannelTile entry={ENTRY.linkedin} connections={[]} now={NOW} />)
    expect(empty.getByRole('button', { name: /connect linkedin/i })).toBeInTheDocument()
    expect(empty.queryByRole('button', { name: /add another/i })).toBeNull()
    empty.unmount()

    const linked = render(
      <ChannelTile
        entry={ENTRY.linkedin}
        connections={[connection({ platform: 'linkedin' })]}
        now={NOW}
      />,
    )
    expect(linked.getByRole('button', { name: /add another account/i })).toBeInTheDocument()
  })

  it('is disabled with a reason when the plan has no room', () => {
    render(
      <ChannelTile
        entry={ENTRY.instagram}
        connections={[shop]}
        disabled
        disabledReason="Every slot on your plan is in use."
        now={NOW}
      />,
    )

    expect(screen.getByRole('button', { name: /add another account/i })).toBeDisabled()
    // The reason is SHOWN, not only encoded in the disabled attribute — a control
    // that refuses without saying why is the same dead end as a broken one.
    expect(screen.getByText(/every slot on your plan is in use/i)).toBeInTheDocument()
  })
})

describe('disconnect claims only what disconnect does', () => {
  it('names what happens BEFORE the destructive press, not after', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    render(<ChannelTile entry={ENTRY.instagram} connections={[shop]} now={NOW} />)

    await userEvent.click(screen.getByRole('button', { name: /disconnect/i }))

    // RETARGETED, because the BEHAVIOUR changed and the sentence had to follow.
    // This asserted "stays linked at the publishing provider", which was exactly
    // right while no removal endpoint was wired. `disconnectConnection` now
    // calls DELETE /v1/accounts/{id} first and only deletes our row if that
    // succeeds — MEASURED: after a real disconnect, Zernio held zero accounts
    // across every profile on the key.
    //
    // The CLAIM this guards is unchanged: the customer is told what happens to
    // the provider-side account BEFORE the destructive press. Only the true
    // answer moved.
    expect(screen.getByText(/removes the account at the publishing provider/i)).toBeInTheDocument()
    // And the consequence they can act on. Without this the sentence says a
    // thing was deleted and leaves them to guess what reconnecting costs.
    expect(screen.getByText(/sign in to it again/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirm disconnect/i })).toBeInTheDocument()
  })

  it('never claims the account survives at the provider', async () => {
    // THE FORBIDDEN CLAIM, asserted separately from the true one. A rewrite that
    // reintroduced "stays linked" would be telling a customer their account is
    // somewhere it is not — the direction that makes them think LESS happened
    // than did, which is the worse way for this particular sentence to be wrong.
    const { default: userEvent } = await import('@testing-library/user-event')
    render(<ChannelTile entry={ENTRY.instagram} connections={[shop]} now={NOW} />)

    await userEvent.click(screen.getByRole('button', { name: /disconnect/i }))

    expect(screen.queryByText(/stays linked/i)).toBeNull()
    expect(screen.queryByText(/brings it back/i)).toBeNull()
  })
})
