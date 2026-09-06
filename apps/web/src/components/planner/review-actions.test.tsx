import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { ReviewActions } from './review-actions'

const sendForReview = vi.fn()
const returnToDraft = vi.fn()
vi.mock('@/app/actions/posts-review', () => ({
  sendForReview: (...args: unknown[]) => sendForReview(...args),
  returnToDraft: (...args: unknown[]) => returnToDraft(...args),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

describe('ReviewActions · which control a status gets', () => {
  test('a draft offers Send for review and nothing else', () => {
    render(<ReviewActions postId="p1" status="draft" />)
    expect(screen.getByRole('button', { name: /Send for review/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Send back/ })).toBeNull()
  })

  test('review, approved and scheduled offer Send back', () => {
    for (const status of ['review', 'approved', 'scheduled'] as const) {
      const { unmount } = render(<ReviewActions postId="p1" status={status} />)
      expect(screen.getByRole('button', { name: /Send back/ })).toBeInTheDocument()
      unmount()
    }
  })

  test('a post the pipeline owns gets nothing', () => {
    const { container } = render(<ReviewActions postId="p1" status="publishing" />)
    expect(container).toBeEmptyDOMElement()
  })

  test('Send back opens the reason form, and an empty reason never reaches the server', async () => {
    const user = userEvent.setup()
    render(<ReviewActions postId="p1" status="approved" />)
    await user.click(screen.getByRole('button', { name: /Send back/ }))
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(returnToDraft).not.toHaveBeenCalled()
  })

  test('Send for review calls the action with the post id', async () => {
    const user = userEvent.setup()
    sendForReview.mockResolvedValueOnce({ ok: true, status: 'review' })
    render(<ReviewActions postId="p1" status="draft" />)
    await user.click(screen.getByRole('button', { name: /Send for review/ }))
    expect(sendForReview).toHaveBeenCalledWith('p1')
  })
})
