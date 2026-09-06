import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import type { ZernioConversation } from '@sahoda/publishing'

import { ConversationList } from './conversation-list'

function conversation(over: Partial<ZernioConversation> = {}): ZernioConversation {
  return {
    id: 'qa-thread-1',
    platform: 'instagram',
    accountId: 'fedcba9876543210fedcba98',
    participantName: 'Asha Patel',
    lastMessage: 'Do you deliver to Cuttack?',
    updatedTime: '2026-09-06T09:00:00Z',
    ...over,
  } as ZernioConversation
}

describe('a thread nobody can open', () => {
  test('a row with a resolvable account links to its thread', () => {
    render(<ConversationList conversations={[conversation()]} waitingLine="" />)
    expect(screen.getByRole('link', { name: /asha patel/i })).toHaveAttribute(
      'href',
      '/inbox/threads/fedcba9876543210fedcba98/qa-thread-1',
    )
  })

  test('a row with no account is not a link and says which account is missing', () => {
    // MEASURED 2026-09-06 on the wt-core preview: a stored thread whose channel
    // had no connected account rendered `/inbox/threads//qa-thread-1` and the
    // click landed on "This page isn't here". The list page builds its own row,
    // so `ConversationRow`'s guard did not reach it.
    render(<ConversationList conversations={[conversation({ accountId: '' })]} waitingLine="" />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(document.querySelector('a[href*="/inbox/threads//"]')).toBeNull()
    expect(screen.getByText('Asha Patel')).toBeInTheDocument()
    expect(screen.getByText(/no connected instagram account can open this/i)).toBeInTheDocument()
  })
})
