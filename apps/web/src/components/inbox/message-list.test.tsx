import type { ZernioMessage } from '@sahoda/publishing'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MessageList } from './message-list'

/**
 * The list had no test at all, which is how it shipped rendering every message —
 * including the customer's — as the shop owner's own.
 *
 * The two messages below are the first real Instagram thread Sahoda ever read
 * (`packages/publishing/fixtures/zernio-inbox/messages.instagram.json`, `[LIVE
 * 2026-08-10]`), scrubbed of the participant's real name. Their `direction` values are
 * untouched, and they are the whole point: a fixture written to match the
 * implementation would have passed against the broken version too.
 */
const LIVE_THREAD: ZernioMessage[] = [
  {
    id: 'm-out',
    conversationId: '1580525030139202',
    accountId: '6a75caf7d0fe733d1afcc1f4',
    platform: 'instagram',
    message: 'HI',
    senderId: '17841442795466852',
    senderName: 'You',
    direction: 'outgoing',
    createdAt: '2026-08-08T14:10:51.201Z',
    isDeleted: false,
  },
  {
    id: 'm-in',
    conversationId: '1580525030139202',
    accountId: '6a75caf7d0fe733d1afcc1f4',
    platform: 'instagram',
    message: 'Hi',
    senderId: '1580525030139202',
    senderName: 'Priya S.',
    direction: 'incoming',
    createdAt: '2026-08-08T14:11:04.384Z',
    isDeleted: false,
  },
]

const directions = (): (string | null)[] =>
  Array.from(document.querySelectorAll('li')).map((li) => li.getAttribute('data-direction'))

describe('MessageList against the first real thread', () => {
  it('puts the customer’s message on the customer’s side', () => {
    render(<MessageList messages={LIVE_THREAD} />)
    expect(directions()).toEqual(['outbound', 'inbound'])
  })

  it('attributes the customer’s words to the customer, not to the owner', () => {
    // The user-visible defect: before the fix both bubbles were labelled "You".
    render(<MessageList messages={LIVE_THREAD} />)
    expect(screen.getByText(/Priya S\./)).toBeTruthy()
  })
})

describe('MessageList when the direction cannot be classified', () => {
  it('renders it as unattributed rather than picking a side', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<MessageList messages={[{ ...LIVE_THREAD[1]!, id: 'm-odd', direction: 'received' }]} />)
    expect(directions()).toEqual(['unknown'])
    // Never "You" — attributing an unreadable message to the owner is the bug that was.
    expect(screen.queryByText(/^You ·/)).toBeNull()
    expect(screen.getByText(/could not tell who sent this/)).toBeTruthy()
    spy.mockRestore()
  })

  it('still accepts doc 13’s spelling', () => {
    render(<MessageList messages={[{ ...LIVE_THREAD[1]!, direction: 'inbound' }]} />)
    expect(directions()).toEqual(['inbound'])
  })
})

describe('MessageList with attachments', () => {
  const withPhoto: ZernioMessage[] = [
    {
      ...LIVE_THREAD[1]!,
      id: 'm-photo',
      message: '',
      attachments: [
        { type: 'image', url: 'https://scontent.cdninstagram.com/signed-and-expiring.jpg' },
        { type: 'video', url: 'https://scontent.cdninstagram.com/clip.mp4' },
      ],
    },
  ]

  it('shows an image through the resolving route, never the expiring url itself', () => {
    render(<MessageList messages={withPhoto} />)
    const img = screen.getByRole('img', { name: 'Image attachment' })
    expect(img.getAttribute('src')).toBe(
      '/api/inbox/attachment?account=6a75caf7d0fe733d1afcc1f4&conversation=1580525030139202&message=m-photo&index=0',
    )
    expect(document.querySelector('img[src*="cdninstagram"]')).toBeNull()
  })

  it('renders a non-image as a named link at its own position', () => {
    render(<MessageList messages={withPhoto} />)
    expect(screen.getByRole('link', { name: 'Video' }).getAttribute('href')).toMatch(/index=1$/)
  })

  it('a stored row with no account id uses the url it holds', () => {
    render(<MessageList messages={[{ ...withPhoto[0]!, accountId: '' }]} />)
    expect(screen.getByRole('img', { name: 'Image attachment' }).getAttribute('src')).toBe(
      'https://scontent.cdninstagram.com/signed-and-expiring.jpg',
    )
  })
})
