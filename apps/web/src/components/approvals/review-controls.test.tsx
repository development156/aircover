import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PostStatus } from '@sahoda/shared'

/**
 * THE REVIEW HALF OF THE FINISH PANEL.
 *
 * A draft offers "Send for review"; a held post names its state and offers
 * "Send back to draft" with a note; an approved or booked post says edits keep
 * the approval. Every outcome sentence is the RPC's answer, not a guess.
 */

const sendForReview = vi.fn()
const returnToDraft = vi.fn()
vi.mock('@/app/actions/posts-review', () => ({
  sendForReview: (...args: unknown[]) => sendForReview(...args),
  returnToDraft: (...args: unknown[]) => returnToDraft(...args),
}))

const { ReviewControls } = await import('./review-controls')

const ME = 'user_me'
const AT = '2026-09-10T03:30:00.000Z'

function controls(
  overrides: Partial<Parameters<typeof ReviewControls>[0]> & { intent: PostStatus },
) {
  const onIntentChange = vi.fn()
  const flush = vi.fn(async () => true)
  render(
    <ReviewControls
      postId="p1"
      approvedBy={null}
      approvedAt={null}
      scheduledAt={null}
      currentUserId={ME}
      zone="Asia/Kolkata"
      flush={flush}
      readPostId={() => 'p1'}
      onIntentChange={onIntentChange}
      {...overrides}
    />,
  )
  return { onIntentChange, flush }
}

beforeEach(() => {
  sendForReview.mockReset()
  returnToDraft.mockReset()
})
afterEach(cleanup)

describe('a draft', () => {
  test('offers Send for review, saves first, and reports the outcome', async () => {
    sendForReview.mockResolvedValue({ ok: true, status: 'review' })
    const user = userEvent.setup()
    const { onIntentChange, flush } = controls({ intent: 'draft' })

    await user.click(screen.getByRole('button', { name: /send for review/i }))

    await waitFor(() => expect(sendForReview).toHaveBeenCalledWith('p1'))
    expect(flush).toHaveBeenCalledTimes(1)
    expect(onIntentChange).toHaveBeenCalledWith('review')
    expect(screen.getByRole('status')).toHaveTextContent(
      'Sent for review. It now waits on an owner, editor or approver.',
    )
    expect(screen.queryByText('Send back to draft')).toBeNull()
  })

  test('a refused send shows the RPC’s sentence and changes nothing', async () => {
    sendForReview.mockResolvedValue({
      ok: false,
      message: 'Only a draft can be sent for review. This post has already moved on.',
    })
    const user = userEvent.setup()
    const { onIntentChange } = controls({ intent: 'draft' })

    await user.click(screen.getByRole('button', { name: /send for review/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/only a draft can be sent for review/i),
    )
    expect(onIntentChange).not.toHaveBeenCalled()
  })

  test('with no row and a failed save, nothing is sent and the reader is told to write first', async () => {
    const user = userEvent.setup()
    controls({
      intent: 'draft',
      postId: null,
      flush: vi.fn(async () => false),
      readPostId: () => null,
    })

    await user.click(screen.getByRole('button', { name: /send for review/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/write a line first/i))
    expect(sendForReview).not.toHaveBeenCalled()
  })
})

describe('a held post', () => {
  test('in review: names the wait and offers Send back to draft', () => {
    controls({ intent: 'review' })
    expect(screen.getByText('Waiting for review')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send back to draft/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /send for review/i })).toBeNull()
    expect(screen.queryByText(/approval stays/i)).toBeNull()
  })

  test('approved: names who and when, and says edits keep the approval', () => {
    controls({ intent: 'approved', approvedBy: ME, approvedAt: AT })
    expect(screen.getByText('Approved by you on 10 Sept 2026')).toBeInTheDocument()
    expect(screen.getByText('Changes go out as they are. Approval stays.')).toBeInTheDocument()
  })

  test('scheduled: names the booking in the workspace zone', () => {
    controls({ intent: 'scheduled', approvedBy: 'user_other', approvedAt: AT, scheduledAt: AT })
    expect(screen.getByText('Booked for 10 Sept 2026, 09:00 am IST')).toBeInTheDocument()
    expect(screen.getByText('Changes go out as they are. Approval stays.')).toBeInTheDocument()
  })

  test('Send back opens a form that requires a reason, then calls returnToDraft with it', async () => {
    returnToDraft.mockResolvedValue({ ok: true, status: 'draft' })
    const user = userEvent.setup()
    const { onIntentChange } = controls({ intent: 'review' })

    await user.click(screen.getByRole('button', { name: /send back to draft/i }))
    const box = screen.getByLabelText(/what should change in this post/i)
    expect(box).toHaveFocus()

    // Empty: refused without a round trip.
    await user.click(screen.getByRole('button', { name: /^send back$/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/say in a sentence what should change/i)
    expect(returnToDraft).not.toHaveBeenCalled()

    await user.type(box, 'Add the price.')
    await user.click(screen.getByRole('button', { name: /^send back$/i }))

    await waitFor(() => expect(returnToDraft).toHaveBeenCalledWith('p1', 'Add the price.'))
    expect(onIntentChange).toHaveBeenCalledWith('draft')
    expect(screen.getByRole('status')).toHaveTextContent('Sent back to draft with your note.')
  })

  test('Escape closes the form and sends nothing', async () => {
    const user = userEvent.setup()
    controls({ intent: 'review' })
    await user.click(screen.getByRole('button', { name: /send back to draft/i }))
    await user.keyboard('{Escape}')
    expect(screen.queryByLabelText(/what should change/i)).toBeNull()
    expect(returnToDraft).not.toHaveBeenCalled()
  })
})
