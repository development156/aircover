import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import type { InboxListRow } from '@/lib/inbox/list-row'

import { ConversationList } from './conversation-list'

function conversation(over: Partial<InboxListRow> = {}): InboxListRow {
  return {
    id: 'qa-thread-1',
    platform: 'instagram',
    accountId: 'fedcba9876543210fedcba98',
    participantName: 'Asha Patel',
    lastMessage: 'Do you deliver to Cuttack?',
    updatedTime: '2026-09-06T09:00:00Z',
    ...over,
  } as InboxListRow
}

describe('a thread nobody can open', () => {
  test('a row with a resolvable account links to its thread', () => {
    render(<ConversationList conversations={[conversation()]} waitingLine="" />)
    expect(screen.getByRole('link', { name: /asha patel/i })).toHaveAttribute(
      'href',
      '/inbox/threads/fedcba9876543210fedcba98/qa-thread-1',
    )
  })

  test('a stored row with no account links to the store route', () => {
    // MEASURED 2026-09-06 on the wt-core preview: a stored thread whose channel
    // had no connected account rendered `/inbox/threads//qa-thread-1` and the
    // click landed on "This page isn't here". The list page builds its own row,
    // so `ConversationRow`'s guard did not reach it. Both builders now send such
    // a row to the thread this database can serve without any account at all.
    render(
      <ConversationList
        conversations={[
          conversation({ accountId: '', storedThreadId: 'a1b2c3d4-0000-4000-8000-000000000001' }),
        ]}
        waitingLine=""
      />,
    )
    expect(screen.getByRole('link', { name: /asha patel/i })).toHaveAttribute(
      'href',
      '/inbox/threads/store/a1b2c3d4-0000-4000-8000-000000000001',
    )
    expect(document.querySelector('a[href*="/inbox/threads//"]')).toBeNull()
  })

  test('a row with neither an account nor a stored copy is not a link', () => {
    render(<ConversationList conversations={[conversation({ accountId: '' })]} waitingLine="" />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(document.querySelector('a[href*="/inbox/threads//"]')).toBeNull()
    expect(screen.getByText('Asha Patel')).toBeInTheDocument()
    expect(screen.getByText(/holds no copy of this thread/i)).toBeInTheDocument()
  })

  test('shows "Needs a reply" as words on a stored row', () => {
    render(<ConversationList conversations={[conversation({ needsReply: true })]} waitingLine="" />)
    expect(screen.getByText('Needs a reply')).toBeInTheDocument()
  })
})
