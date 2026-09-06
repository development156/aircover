import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { ReplyAffordance } from '@sahoda/shared'

import type { InboxSendState } from '@/app/actions/inbox-send'
import type { AssetCard } from '@/lib/assets/view'

/**
 * ATTACHING ONE PICTURE TO A DM REPLY, FROM THE COMPOSER'S SIDE.
 *
 * What is pinned here is the ARGUMENT: the composer hands the action an asset ID and
 * never a url, and it hands it nothing at all once the chip is removed. A test that
 * only checked "the chip disappeared" would pass on a composer that kept sending the
 * photo, which is the defect worth catching — a person who took a picture back off a
 * reply and watched it go out anyway.
 *
 * `AttachPicker` is faked because it is `next/dynamic`-loaded and its own job (fetch
 * the library, filter to pictures) is not this file's subject. The fake still goes
 * through the real `onPick` contract.
 */

const state: { result: InboxSendState; calls: unknown[][] } = {
  result: { ok: true, platformId: 'mid.out' },
  calls: [],
}

vi.mock('@/app/actions/inbox-send', () => ({
  sendThreadReply: vi.fn(async (...args: unknown[]) => {
    state.calls.push(args)
    return state.result
  }),
}))

const CARD: AssetCard = {
  id: 'asset-9',
  title: 'Storefront.jpg',
  alt: null,
  kind: 'image',
  mime: 'image/jpeg',
  bytes: 1024,
  width: 800,
  height: 600,
  createdAt: '2026-09-01T00:00:00.000Z',
  previewUrl: 'https://cdn.example.com/p.jpg',
  thumbUrl: null,
  usage: [],
  folderIds: null,
  deletedAt: null,
}

vi.mock('./attach-picker', () => ({
  AttachPicker: ({ onPick }: { onPick: (card: AssetCard) => void }) => (
    <button type="button" onClick={() => onPick(CARD)}>
      Pick Storefront
    </button>
  ),
}))

const { ReplyComposer } = await import('./reply-composer')

const OPEN: ReplyAffordance = {
  state: 'open',
  canSendFromSahoda: true,
  reason: '',
} as unknown as ReplyAffordance

const CLOSED: ReplyAffordance = {
  state: 'closed',
  canSendFromSahoda: false,
  reason: 'The 24-hour window has closed.',
} as unknown as ReplyAffordance

function composer(affordance: ReplyAffordance = OPEN) {
  return render(
    <ReplyComposer affordance={affordance} accountId="acct-1" conversationId="conv-1" />,
  )
}

/** The fifth argument: the attachment the action was asked to send, if any. */
const attachmentArg = () => state.calls[0]?.[4]

beforeEach(() => {
  state.result = { ok: true, platformId: 'mid.out' }
  state.calls = []
})

describe('ReplyComposer — attaching one picture', () => {
  test('sends the chosen file as an ID, never a url', async () => {
    const user = userEvent.setup()
    composer()

    await user.click(screen.getByRole('button', { name: /attach a picture/i }))
    await user.click(await screen.findByRole('button', { name: 'Pick Storefront' }))
    await user.type(screen.getByLabelText('Reply'), 'Here it is')
    await user.click(screen.getByRole('button', { name: /send reply/i }))

    await waitFor(() => expect(state.calls).toHaveLength(1))
    expect(attachmentArg()).toEqual({ assetId: 'asset-9' })
    // Nothing the browser holds about WHERE the bytes are may reach the action: a
    // url parameter is the whole vulnerability this shape exists to remove.
    expect(JSON.stringify(state.calls[0])).not.toContain('cdn.example.com')
  })

  test('sends no attachment once the chip is removed', async () => {
    const user = userEvent.setup()
    composer()

    await user.click(screen.getByRole('button', { name: /attach a picture/i }))
    await user.click(await screen.findByRole('button', { name: 'Pick Storefront' }))
    await user.click(screen.getByRole('button', { name: /remove storefront\.jpg/i }))
    await user.type(screen.getByLabelText('Reply'), 'Just words')
    await user.click(screen.getByRole('button', { name: /send reply/i }))

    await waitFor(() => expect(state.calls).toHaveLength(1))
    expect(attachmentArg()).toBeUndefined()
  })

  test('shows the chip once a file is chosen, and drops it on a confirmed send', async () => {
    const user = userEvent.setup()
    composer()

    await user.click(screen.getByRole('button', { name: /attach a picture/i }))
    await user.click(await screen.findByRole('button', { name: 'Pick Storefront' }))
    expect(screen.getByRole('button', { name: /remove storefront\.jpg/i })).toBeInTheDocument()

    await user.type(screen.getByLabelText('Reply'), 'Here it is')
    await user.click(screen.getByRole('button', { name: /send reply/i }))

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /remove storefront\.jpg/i })).toBeNull(),
    )
  })

  /**
   * The photo stays after a send we could not confirm, for the same reason the words
   * do: the reply may have to go again, and re-finding the file is a cost of OUR
   * uncertainty rather than the customer's mistake.
   */
  test('keeps the file after a send that was not confirmed', async () => {
    state.result = { ok: false, status: 'unconfirmed', message: 'Sahoda could not confirm it.' }
    const user = userEvent.setup()
    composer()

    await user.click(screen.getByRole('button', { name: /attach a picture/i }))
    await user.click(await screen.findByRole('button', { name: 'Pick Storefront' }))
    await user.type(screen.getByLabelText('Reply'), 'Here it is')
    await user.click(screen.getByRole('button', { name: /send reply/i }))

    await waitFor(() => expect(state.calls).toHaveLength(1))
    expect(screen.getByRole('button', { name: /remove storefront\.jpg/i })).toBeInTheDocument()
  })

  test('Attach is disabled on a thread that cannot send, like everything else', () => {
    composer(CLOSED)
    expect(screen.getByRole('button', { name: /attach a picture/i })).toBeDisabled()
  })
})
