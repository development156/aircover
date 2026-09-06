import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import type { InboxListRow } from '@/lib/inbox/list-row'

import { ConversationRow } from './conversation-row'
import { threadHref } from './thread-href'

const conversation = (over: Partial<InboxListRow> = {}): InboxListRow => ({
  id: 'conv_1',
  platform: 'instagram',
  accountId: 'fedcba9876543210fedcba98',
  participantName: 'Asha',
  lastMessage: 'Is the shop open on Sunday?',
  updatedTime: '2026-08-08T04:30:00.000Z',
  ...over,
})

describe('the row carries both halves of the thread key', () => {
  test('links to /inbox/threads/{accountId}/{conversationId}', () => {
    render(<ConversationRow conversation={conversation()} />)
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/inbox/threads/fedcba9876543210fedcba98/conv_1',
    )
  })

  test('links a stored thread with no account to the store route', () => {
    // MEASURED 2026-09-06: a stored thread whose channel has no connected account
    // rendered `/inbox/threads//<id>` and clicked through to a 404. Replacing the
    // link with a sentence stopped the 404 and left a message this database holds
    // unreadable. The row id is a whole key on our own table, so it opens there.
    render(
      <ConversationRow
        conversation={conversation({
          accountId: '',
          storedThreadId: 'a1b2c3d4-0000-4000-8000-000000000001',
        })}
      />,
    )
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/inbox/threads/store/a1b2c3d4-0000-4000-8000-000000000001',
    )
    expect(document.querySelector('a[href*="/inbox/threads//"]')).toBeNull()
  })

  test('renders no link when there is neither an account nor a stored row', () => {
    render(<ConversationRow conversation={conversation({ accountId: '' })} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText(/no way to open this thread/i)).toBeInTheDocument()
    expect(document.querySelector('a[href*="/inbox/threads//"]')).toBeNull()
  })

  test('shows "Needs a reply" as words, never as a count', () => {
    // The store has no read state to count, so a numeral here would be a number
    // nobody took. `unreadCount` stays Zernio's alone.
    render(<ConversationRow conversation={conversation({ needsReply: true })} />)
    expect(screen.getByText('Needs a reply')).toBeInTheDocument()
    expect(screen.queryByLabelText(/unread/)).toBeNull()
  })

  test('prefers a real unread count over the derived flag', () => {
    render(<ConversationRow conversation={conversation({ unreadCount: 2, needsReply: true })} />)
    expect(screen.getByLabelText('2 unread')).toBeInTheDocument()
    expect(screen.queryByText('Needs a reply')).toBeNull()
  })

  test('a conversation id alone can never build a link — accountId is required', () => {
    // @ts-expect-error the account half is not optional; dropping it must not compile
    threadHref({ conversationId: 'conv_1' })
    expect(true).toBe(true)
  })

  test('escapes ids rather than splicing them into the path raw', () => {
    const href = threadHref({ accountId: 'acc/1', conversationId: 'conv?2' })
    expect(href).toBe('/inbox/threads/acc%2F1/conv%3F2')
  })
})

describe('what the list refuses to claim', () => {
  test('shows no send-window state — updatedTime cannot tell us', () => {
    const { container } = render(<ConversationRow conversation={conversation()} />)
    const copy = container.textContent ?? ''
    expect(copy).not.toMatch(/replies (open|closed)/i)
    expect(copy).not.toMatch(/template only|tagged replies/i)
    expect(container.querySelector('[data-window-state]')).toBeNull()
  })
})

describe('row content', () => {
  test('names an unknown sender rather than rendering a blank', () => {
    render(
      <ConversationRow
        conversation={conversation({ participantName: undefined, participantId: undefined })}
      />,
    )
    expect(screen.getByText('Unknown sender')).toBeInTheDocument()
  })

  test('labels the platform for a human, not as an API string', () => {
    render(<ConversationRow conversation={conversation({ platform: 'googlebusiness' })} />)
    expect(screen.getByText('Google Business Profile')).toBeInTheDocument()
  })

  test('renders an unmodelled platform verbatim instead of "Unknown"', () => {
    render(<ConversationRow conversation={conversation({ platform: 'mastodon' })} />)
    expect(screen.getByText('mastodon')).toBeInTheDocument()
  })

  test('announces the unread count instead of showing a bare number', () => {
    render(<ConversationRow conversation={conversation({ unreadCount: 3 })} />)
    expect(screen.getByLabelText('3 unread')).toBeInTheDocument()
  })

  test('renders no unread pill at zero', () => {
    render(<ConversationRow conversation={conversation({ unreadCount: 0 })} />)
    expect(screen.queryByLabelText(/unread/)).toBeNull()
  })

  test('drops an unparseable timestamp rather than printing "Invalid Date"', () => {
    const { container } = render(
      <ConversationRow conversation={conversation({ updatedTime: 'x' })} />,
    )
    expect(container.textContent).not.toMatch(/Invalid Date/)
  })
})
