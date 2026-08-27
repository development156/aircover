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

/**
 * THE NUMBER THAT SAID THE SAME FALSE THING IN FEWER WORDS.
 *
 * ── WHY THIS GUARD IS AT THE RENDER SITE AND NOT ONLY IN THE LIB ─────────────
 * `health.test.ts` already pinned that a provider-held connection is not
 * `expired`. That fix shipped, and it removed the sentence "Reconnect X. Its
 * access has run out and scheduled posts will not go out." It did NOT remove the
 * defect, because it left `daysLeft` on the `ok` verdict — and this component
 * renders `{daysLeft}d left` for exactly that verdict, with nothing else gating
 * it. The founder's next screenshot showed a freshly connected, working X account
 * reading **"0d left"** directly beside the badge saying "Connected".
 *
 * A lib-level guard could not see that, and did not. The claim a customer reads
 * is assembled here, so this is where it is asserted.
 *
 * ── THE FIXTURE IS THE REAL ROW ──────────────────────────────────────────────
 * MEASURED 2026-08-27 from `connections` in production, written by
 * `upsert_zernio_connection` two seconds after Zernio created the account:
 * `profileId` present, `platformStatus: "active"`, `needsReconnection: false`,
 * and `expires_at` two hours after the connect. A made-up row would pass against
 * a rule that is wrong in the same direction as the code, which is how the
 * two-hour token went unnoticed with a comment asserting sixty days three lines
 * above the bug.
 */
describe('a connection Zernio holds shows no countdown', () => {
  /** The real X row. `profileId` is what marks it as provider-held. */
  const X = connection({
    id: '44444444-4444-4444-8444-444444444444',
    platform: 'x',
    external_account: {
      id: '6a8fcc9477555aae01e7cb9c',
      profileId: '6a7efffaf7c78d193906be18',
      handle: 'MahapatraDivas',
      platformStatus: 'active',
      needsReconnection: false,
    },
    expires_at: '2026-08-27T07:35:16.167+00:00',
  })
  /** Half an hour after that two-hour token died. Zernio has since rotated it. */
  const AFTER = new Date('2026-08-27T08:00:00.000Z')

  it('renders no "d left" for it at all', () => {
    // THE REGRESSION, as the founder saw it: "0d left".
    const { container } = render(<ChannelTile entry={ENTRY.x} connections={[X]} now={AFTER} />)
    expect(container.textContent).not.toMatch(/\d+d left/)
  })

  it('still says Connected, and offers no Reconnect', () => {
    // The other half. Dropping the countdown must not have downgraded the verdict
    // — a working account that says "Needs you" is the same defect wearing a
    // different word.
    render(<ChannelTile entry={ENTRY.x} connections={[X]} now={AFTER} />)

    expect(screen.getByText('Connected')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reconnect/i })).toBeNull()
  })

  it('STILL counts down for a connection whose token we hold ourselves', () => {
    // The countdown is not deleted, it is scoped. A native connection has no
    // `profileId`, its `expires_at` is our own deadline, and a customer who is not
    // told how long they have finds out when their posts stop. Without this, the
    // fix above reads as "remove the expiry line" and nothing would notice if it
    // were removed outright.
    const native = connection({
      external_account: { id: 'ig-1', username: 'kumarchai' },
      // Beyond the T-7 window on purpose: inside it the verdict is `expiring`,
      // which renders a warning rather than this line, so a fixture there would
      // prove nothing about the countdown.
      expires_at: '2026-09-05T00:00:00.000Z',
    })
    const { container } = render(
      <ChannelTile entry={ENTRY.instagram} connections={[native]} now={NOW} />,
    )
    expect(container.textContent).toMatch(/16d left/)
  })
})

/**
 * TELEGRAM'S CARD DOES NOT OFFER A WINDOW TO OPEN.
 *
 * ── THE DEFECT THIS CLOSES ───────────────────────────────────────────────────
 * MEASURED against the live API: `GET /v1/connect/telegram` returns no `authUrl`
 * at all, only a pairing code the customer messages to a bot. On the OAuth rail
 * the card's button answered "Couldn't start the connection. Try again." on
 * every press — a remedy that could never work, which is exactly what
 * `no-impossible-remedy.spec.ts` forbids. Before that it was hidden under
 * "Not available yet" and could not be connected at all.
 *
 * Asserted at the CARD, not only at the route, because the whole failure was
 * that the card offered the wrong control. A route-level guard cannot see that.
 */
describe('the channel that links from inside Telegram', () => {
  it('offers a code, not a Connect button', () => {
    render(<ChannelTile entry={ENTRY.telegram} connections={[]} now={NOW} />)

    expect(screen.getByRole('button', { name: /connect telegram/i })).toBeInTheDocument()
    // The words are the tell: this control fetches a code, it does not open a
    // consent screen. `ConnectButton`'s busy words are "Opening Telegram…".
    expect(screen.queryByText(/opening telegram/i)).toBeNull()
  })

  it('still opens a window for a channel that HAS a consent screen', () => {
    // The other half. Without this the fix reads as "give every card the code
    // panel", and nothing would notice if it did.
    const { container } = render(<ChannelTile entry={ENTRY.instagram} connections={[]} now={NOW} />)
    expect(container.querySelector('[data-telegram-code]')).toBeNull()
    expect(screen.getByRole('button', { name: /connect instagram/i })).toBeInTheDocument()
  })

  it('is no longer sitting in the unbuilt pile', () => {
    // It rendered as a `ComingSoonTile` with no control while `ZERNIO_PLATFORMS`
    // dropped it — that list governs whether a workspace may HOLD the connection,
    // which was never the thing that was missing.
    const { container } = render(<ChannelTile entry={ENTRY.telegram} connections={[]} now={NOW} />)
    expect(container.querySelector('[data-channel="telegram"]')).not.toBeNull()
  })
})
