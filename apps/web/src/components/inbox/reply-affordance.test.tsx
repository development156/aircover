import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { evaluateSendWindow, type InboxPlatform } from '@sahoda/shared'

import type { InboxSendState } from '@/app/actions/inbox-send'

const state: { result: InboxSendState; calls: unknown[][] } = {
  result: { ok: true, platformId: 'mid.abc123' },
  calls: [],
}

vi.mock('@/app/actions/inbox-send', () => ({
  sendThreadReply: vi.fn(async (...args: unknown[]) => {
    state.calls.push(args)
    return state.result
  }),
}))

import { ReplyAffordanceCard } from './reply-affordance'

/**
 * These tests exist because the whole point of this component is a promise about
 * TIMING: the user must learn a thread cannot be replied to BEFORE writing a reply,
 * not after pressing send. A card that renders the right badge but leaves an enabled
 * textarea keeps the failure exactly where it was.
 *
 * ── WHAT CHANGED WHEN SENDING WAS WIRED ──────────────────────────────────────
 * The previous version asserted a DISABLED textarea on every state, including `open`,
 * because Sahoda had no send path and the copy said so. Those assertions were true and
 * are now wrong: the box is live exactly where the platform allows a reply. The timing
 * promise is unchanged — it is the reason the gate is the affordance rather than the
 * platform's rejection.
 */

const T0 = '2026-08-08T00:00:00.000Z'
const at = (hours: number): string => new Date(Date.parse(T0) + hours * 3_600_000).toISOString()

/** The full accessible description — every id in `aria-describedby`, resolved. */
const describedText = (el: HTMLElement): string =>
  (el.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')

const cardFor = (platform: InboxPlatform, hoursSinceInbound: number | null) =>
  evaluateSendWindow({
    platform,
    lastInboundAt: hoursSinceInbound === null ? null : T0,
    now: hoursSinceInbound === null ? T0 : at(hoursSinceInbound),
  })

const renderCard = (platform: InboxPlatform, hours: number | null) =>
  render(
    <ReplyAffordanceCard
      affordance={cardFor(platform, hours)}
      accountId="6a75caf7d0fe733d1afcc1f4"
      conversationId="conv-1"
    />,
  )

beforeEach(() => {
  state.result = { ok: true, platformId: 'mid.abc123' }
  state.calls = []
})

describe('the compose control never invites a reply the platform will refuse', () => {
  /** The three states with `canSendFromSahoda: false`. Disabled, with a stated cause. */
  test.each([
    ['instagram', 200],
    ['whatsapp', 25],
    ['instagram', null],
  ] as const)('%s at +%sh renders a disabled textarea', (platform, hours) => {
    renderCard(platform, hours)
    expect(screen.getByLabelText('Reply')).toBeDisabled()
  })

  /** The two states with `canSendFromSahoda: true`. A live box, because a reply can go. */
  test.each([
    ['instagram', 1],
    ['instagram', 25],
    ['facebook', 1],
    ['facebook', 25],
    ['whatsapp', 1],
  ] as const)('%s at +%ih renders a live textarea', (platform, hours) => {
    renderCard(platform, hours)
    expect(screen.getByLabelText('Reply')).toBeEnabled()
  })

  test('the disabled field is described by the reason, not left bare', () => {
    renderCard('whatsapp', 25)
    expect(describedText(screen.getByLabelText('Reply'))).toMatch(/template/i)
  })

  test.each([
    ['whatsapp', 25],
    ['instagram', 200],
    ['instagram', null],
  ] as const)(
    'every aria-describedby id resolves to a real element (%s at +%sh)',
    (platform, hours) => {
      renderCard(platform, hours)
      const ids = (screen.getByLabelText('Reply').getAttribute('aria-describedby') ?? '')
        .split(/\s+/)
        .filter(Boolean)
      expect(ids.length).toBeGreaterThan(0)
      for (const id of ids) {
        expect(document.getElementById(id), `dangling aria-describedby: ${id}`).not.toBeNull()
      }
    },
  )

  test('the window reason is stated once, not repeated inside the composer', () => {
    renderCard('instagram', 200)
    expect(screen.getAllByText(/customer needs to write again/i)).toHaveLength(1)
  })

  /**
   * The copy that named Sahoda's own missing send path is gone with the blocker. Left
   * in place beside a working box it would be the same class of untruth in reverse.
   */
  test('an open window no longer claims Sahoda cannot send', () => {
    renderCard('instagram', 1)
    expect(screen.getByLabelText('Reply')).toBeEnabled()
    expect(screen.queryByText(/reply path is not wired/i)).toBeNull()
    expect(screen.queryByText(/cannot send yet/i)).toBeNull()
  })

  /** Empty is not a reply. The button stays disabled until there are words to send. */
  test('the send button is disabled until something is written', async () => {
    const user = userEvent.setup()
    renderCard('instagram', 1)

    expect(screen.getByRole('button', { name: /send reply/i })).toBeDisabled()
    await user.type(screen.getByLabelText('Reply'), 'On our way')
    expect(screen.getByRole('button', { name: /send reply/i })).toBeEnabled()
  })

  test('whitespace alone does not count as a reply', async () => {
    const user = userEvent.setup()
    renderCard('instagram', 1)

    await user.type(screen.getByLabelText('Reply'), '    ')
    expect(screen.getByRole('button', { name: /send reply/i })).toBeDisabled()
  })
})

describe('sending, and what the customer is told afterwards', () => {
  test('sends the thread key and the trimmed body', async () => {
    const user = userEvent.setup()
    renderCard('instagram', 1)

    await user.type(screen.getByLabelText('Reply'), '  On our way  ')
    await user.click(screen.getByRole('button', { name: /send reply/i }))

    await waitFor(() => expect(state.calls).toHaveLength(1))
    // Retargeted when the composer gained an Attach control: the fifth argument is
    // the attachment, and a reply nobody attached a file to must carry none. The
    // claim is unchanged — the account, the thread, the TRIMMED body, and no tag.
    expect(state.calls[0]).toEqual([
      '6a75caf7d0fe733d1afcc1f4',
      'conv-1',
      'On our way',
      undefined,
      undefined,
    ])
  })

  /**
   * The platform's own id IS the evidence, so it is shown rather than a bare "Sent".
   * The same rule `.is-real` applies to a published post: a thing is real when the
   * platform has named it.
   */
  test('a confirmed send names the platform id and clears the box', async () => {
    const user = userEvent.setup()
    renderCard('instagram', 1)

    await user.type(screen.getByLabelText('Reply'), 'On our way')
    await user.click(screen.getByRole('button', { name: /send reply/i }))

    expect(await screen.findByText(/mid\.abc123/)).toBeInTheDocument()
    expect(screen.getByLabelText('Reply')).toHaveValue('')
  })

  /**
   * The state that must never look like success. Zernio answers 200-with-no-id as a
   * normal outcome, so this is the ordinary path where we genuinely do not know.
   */
  test('an unconfirmed send is not styled as success and keeps the text', async () => {
    state.result = {
      ok: false,
      status: 'unconfirmed',
      message: 'Sahoda could not confirm this reply was delivered — check the platform.',
    }
    const user = userEvent.setup()
    const { container } = renderCard('instagram', 1)

    await user.type(screen.getByLabelText('Reply'), 'On our way')
    await user.click(screen.getByRole('button', { name: /send reply/i }))

    expect(await screen.findByText(/could not confirm/i)).toBeInTheDocument()
    // Scoped to the RESULT region: the "Replies open" chip legitimately uses the
    // success token, and a page-wide class query would have passed for the wrong reason.
    expect(container.querySelector('[data-send-result="sent"]')).toBeNull()
    expect(container.querySelector('[data-send-result="unconfirmed"]')).not.toBeNull()
    // The words the customer wrote survive our uncertainty — they should not retype it.
    expect(screen.getByLabelText('Reply')).toHaveValue('On our way')
  })

  test('a server-side refusal is shown, and is not styled as an error', async () => {
    state.result = {
      ok: false,
      status: 'refused',
      message: 'WhatsApp closed the 24-hour service window on this thread.',
    }
    const user = userEvent.setup()
    const { container } = renderCard('instagram', 1)

    await user.type(screen.getByLabelText('Reply'), 'Hello?')
    await user.click(screen.getByRole('button', { name: /send reply/i }))

    expect(await screen.findByText(/closed the 24-hour service window/i)).toBeInTheDocument()
    const region = container.querySelector('[data-send-result="refused"]')
    expect(region).not.toBeNull()
    expect(region?.className).not.toMatch(/text-danger/)
  })

  test('a failure is styled as one and invites a retry', async () => {
    state.result = {
      ok: false,
      status: 'failed',
      message: 'Could not send that reply. Try again.',
    }
    const user = userEvent.setup()
    const { container } = renderCard('instagram', 1)

    await user.type(screen.getByLabelText('Reply'), 'Hello?')
    await user.click(screen.getByRole('button', { name: /send reply/i }))

    expect(await screen.findByText(/try again/i)).toBeInTheDocument()
    expect(container.querySelector('[data-send-result="failed"]')?.className).toMatch(/text-danger/)
  })
})

describe('each regime explains itself', () => {
  /**
   * The tags now come from the composer's radio group rather than a static list. One
   * rendering of the set, and it is the one where choosing a tag does something.
   */
  test('instagram past 24h offers HUMAN_AGENT as the only option', () => {
    renderCard('instagram', 25)
    expect(screen.getByText('Tagged replies only')).toBeInTheDocument()
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('value'))).toEqual([
      'HUMAN_AGENT',
    ])
  })

  test('facebook past 24h offers all four tags', () => {
    renderCard('facebook', 25)
    const tags = screen.getAllByRole('radio').map((r) => r.getAttribute('value'))
    expect(tags).toHaveLength(4)
    expect(tags).toContain('HUMAN_AGENT')
    expect(tags).toContain('POST_PURCHASE_UPDATE')
  })

  test('facebook past 7 days drops HUMAN_AGENT and keeps the rest', () => {
    renderCard('facebook', 200)
    const tags = screen.getAllByRole('radio').map((r) => r.getAttribute('value'))
    expect(tags).toHaveLength(3)
    expect(tags).not.toContain('HUMAN_AGENT')
  })

  /**
   * A tagged thread cannot send until a tag is chosen. Refusing this in the browser is
   * not a substitute for the server check — it is a way for the customer to fix it
   * before spending a round trip on a refusal.
   */
  test('a tagged thread will not send until a tag is picked', async () => {
    const user = userEvent.setup()
    renderCard('instagram', 25)

    await user.type(screen.getByLabelText('Reply'), 'Following up')
    expect(screen.getByRole('button', { name: /send tagged reply/i })).toBeDisabled()

    await user.click(screen.getByRole('radio', { name: 'HUMAN_AGENT' }))
    expect(screen.getByRole('button', { name: /send tagged reply/i })).toBeEnabled()
  })

  test('the chosen tag travels with the reply', async () => {
    const user = userEvent.setup()
    renderCard('facebook', 25)

    await user.type(screen.getByLabelText('Reply'), 'Your order shipped')
    await user.click(screen.getByRole('radio', { name: 'POST_PURCHASE_UPDATE' }))
    await user.click(screen.getByRole('button', { name: /send tagged reply/i }))

    await waitFor(() => expect(state.calls).toHaveLength(1))
    expect(state.calls[0]?.[3]).toBe('POST_PURCHASE_UPDATE')
  })

  test('whatsapp past 24h says template, offers no tags, and cannot send', () => {
    renderCard('whatsapp', 25)
    expect(screen.getByText('Template only')).toBeInTheDocument()
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    expect(screen.getByLabelText('Reply')).toBeDisabled()
  })

  test('instagram past 7 days is closed, and says the customer must write again', () => {
    renderCard('instagram', 200)
    expect(screen.getByText('Replies closed')).toBeInTheDocument()
    expect(screen.getByText(/customer needs to write again/i)).toBeInTheDocument()
  })
})

describe('what an unread thread is allowed to claim', () => {
  test('renders "window not known" rather than open or closed', () => {
    renderCard('instagram', null)
    expect(screen.getByText('Window not known')).toBeInTheDocument()
    expect(screen.queryByText('Replies open')).toBeNull()
    expect(screen.queryByText('Replies closed')).toBeNull()
  })

  test('the unknown state is neutral, never styled as a failure', () => {
    const { container } = renderCard('instagram', null)
    const section = container.querySelector('[data-window-state="unknown"]')
    expect(section).toBeTruthy()
    expect(section?.querySelector('.text-danger')).toBeNull()
  })

  /**
   * `unknown` refuses to offer a send. It is the state that means "we could not compute
   * the window", and a live box over it would promise something we cannot check.
   */
  test('an unknown window offers no compose box', () => {
    renderCard('instagram', null)
    expect(screen.getByLabelText('Reply')).toBeDisabled()
  })
})

describe('the state chip cannot silently fall through', () => {
  test('every window state carries a distinct visible label', () => {
    const labels = new Set<string>()
    for (const [platform, hours] of [
      ['instagram', 1],
      ['instagram', 25],
      ['instagram', 200],
      ['whatsapp', 25],
      ['instagram', null],
    ] as const) {
      const { container, unmount } = renderCard(platform, hours)
      const chip = container.querySelector('[data-window-state] span')
      labels.add(chip?.textContent ?? '')
      unmount()
    }
    expect(labels.size).toBe(5)
    expect(labels.has('')).toBe(false)
  })
})
