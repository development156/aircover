import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { ZernioComment, ZernioReview } from '@sahoda/publishing'

import type { InboxSendState } from '@/app/actions/inbox-send'

const state: { result: InboxSendState; commentCalls: unknown[][]; reviewCalls: unknown[][] } = {
  result: { ok: true, platformId: '17901' },
  commentCalls: [],
  reviewCalls: [],
}

vi.mock('@/app/actions/inbox-send', () => ({
  sendCommentReply: vi.fn(async (...args: unknown[]) => {
    state.commentCalls.push(args)
    return state.result
  }),
  sendReviewReply: vi.fn(async (...args: unknown[]) => {
    state.reviewCalls.push(args)
    return state.result
  }),
}))

import { CommentCard } from './comment-card'
import { ReviewCard } from './review-card'

/**
 * The public reply surfaces: a comment under a post, and a reply to a review.
 *
 * Neither has a send window — public comments do not close after 24 hours — so what is
 * tested here is different from the DM composer: the per-row PERMISSION that decides
 * whether a reply is offered at all, and the id rule that decides what the customer is
 * told afterwards.
 */

const ACCOUNT = '6a75caf7d0fe733d1afcc1f4'
const POST = '18104441855596739'

const comment = (over: Partial<ZernioComment> = {}): ZernioComment =>
  ({
    id: 'c-1',
    message: 'Do you deliver to Bandra?',
    from: { name: 'Asha' },
    createdTime: '2026-08-10T10:00:00.000Z',
    ...over,
  }) as unknown as ZernioComment

const renderComment = (over: Partial<ZernioComment> = {}) =>
  render(<CommentCard comment={comment(over)} accountId={ACCOUNT} platformPostId={POST} />)

beforeEach(() => {
  state.result = { ok: true, platformId: '17901' }
  state.commentCalls = []
  state.reviewCalls = []
})

describe('the comment reply is offered only where the platform allows one', () => {
  /**
   * `canReply` is ABSENT on some rows, and absent is not the same as false. Treating a
   * missing permission as "cannot reply" would hide the control on comments that are
   * perfectly repliable, so the gate is `!== false`.
   */
  test('an absent canReply still offers the control', () => {
    renderComment({ canReply: undefined })
    expect(screen.getByRole('button', { name: 'Reply' })).toBeEnabled()
  })

  test('canReply true offers it', () => {
    renderComment({ canReply: true })
    expect(screen.getByRole('button', { name: 'Reply' })).toBeEnabled()
  })

  test('canReply false disables it, and the row says why', () => {
    renderComment({ canReply: false })
    expect(screen.getByRole('button', { name: 'Reply' })).toBeDisabled()
    expect(screen.getByText(/replies not allowed here/i)).toBeInTheDocument()
  })

  /** Collapsed by default: a post can carry dozens of comments. */
  test('the box only appears once Reply is pressed', async () => {
    const user = userEvent.setup()
    renderComment()

    expect(screen.queryByLabelText('Your reply')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Reply' }))
    expect(screen.getByLabelText('Your reply')).toBeInTheDocument()
  })
})

describe('sending a comment reply', () => {
  const openAndType = async (text: string) => {
    const user = userEvent.setup()
    renderComment()
    await user.click(screen.getByRole('button', { name: 'Reply' }))
    await user.type(screen.getByLabelText('Your reply'), text)
    return user
  }

  test('threads the reply under this comment, not loose on the post', async () => {
    const user = await openAndType('Yes, we deliver to Bandra')
    await user.click(screen.getByRole('button', { name: /send reply/i }))

    await waitFor(() => expect(state.commentCalls).toHaveLength(1))
    // The fourth argument is the comment id — without it this becomes a new top-level
    // comment on the post rather than an answer to the customer who asked.
    expect(state.commentCalls[0]).toEqual([ACCOUNT, POST, 'Yes, we deliver to Bandra', 'c-1'])
  })

  test('will not send an empty or whitespace-only reply', async () => {
    const user = await openAndType('   ')
    expect(screen.getByRole('button', { name: /send reply/i })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /send reply/i }))
    expect(state.commentCalls).toHaveLength(0)
  })

  test('a confirmed send names the platform id and clears the box', async () => {
    const user = await openAndType('Thank you!')
    await user.click(screen.getByRole('button', { name: /send reply/i }))

    expect(await screen.findByText(/17901/)).toBeInTheDocument()
    expect(screen.getByLabelText('Your reply')).toHaveValue('')
  })

  /** The `.is-real` rule: a 200 without an id is not a send, and must not look like one. */
  test('an unconfirmed send keeps the text and is not styled as success', async () => {
    state.result = {
      ok: false,
      status: 'unconfirmed',
      message: 'Sahoda could not confirm this reply was delivered.',
    }
    const user = await openAndType('Thank you!')
    await user.click(screen.getByRole('button', { name: /send reply/i }))

    expect(await screen.findByText(/could not confirm/i)).toBeInTheDocument()
    expect(document.querySelector('[data-send-result="sent"]')).toBeNull()
    expect(document.querySelector('[data-send-result="unconfirmed"]')).not.toBeNull()
    expect(screen.getByLabelText('Your reply')).toHaveValue('Thank you!')
  })

  /** A 403 — this account may not comment on this post — is reported, not swallowed. */
  test('a platform refusal is shown to the customer', async () => {
    state.result = {
      ok: false,
      status: 'failed',
      message: 'Could not send that reply — try again.',
    }
    const user = await openAndType('Thanks')
    await user.click(screen.getByRole('button', { name: /send reply/i }))

    expect(await screen.findByText(/try again/i)).toBeInTheDocument()
  })
})

describe('the review reply', () => {
  const review = (over: Partial<ZernioReview> = {}): ZernioReview =>
    ({
      id: 'accounts/111/locations/222/reviews/333',
      platform: 'googlebusiness',
      accountId: ACCOUNT,
      rating: 5,
      text: 'Lovely shop.',
      created: '2026-08-10T10:00:00.000Z',
      hasReply: false,
      ...over,
    }) as unknown as ZernioReview

  test('offers a reply on an unanswered review', async () => {
    const user = userEvent.setup()
    render(<ReviewCard review={review()} />)

    await user.click(screen.getByRole('button', { name: 'Reply' }))
    await user.type(screen.getByLabelText('Your reply'), 'Thank you!')
    await user.click(screen.getByRole('button', { name: /send reply/i }))

    await waitFor(() => expect(state.reviewCalls).toHaveLength(1))
    // The full GBP resource name travels intact — the transport encodes it, this does not.
    expect(state.reviewCalls[0]).toEqual([
      ACCOUNT,
      'accounts/111/locations/222/reviews/333',
      'Thank you!',
    ])
  })

  /**
   * Google keeps ONE reply per review; a second overwrites the first. So an answered
   * review shows the reply that exists rather than a control that would quietly replace
   * words the shop owner already wrote.
   */
  test('an answered review shows the existing reply and offers no second one', () => {
    render(
      <ReviewCard
        review={review({
          hasReply: true,
          reply: { id: 'r-1', text: 'Thanks for visiting!', created: '2026-08-10T12:00:00.000Z' },
        })}
      />,
    )

    expect(screen.getByText('Thanks for visiting!')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reply' })).toBeNull()
  })

  /**
   * `hasReply` true with no reply TEXT is a real shape: the flag and the body come from
   * different fields, and the flag is the one Google is authoritative about. The control
   * stays disabled rather than offering to overwrite a reply we simply cannot display.
   */
  test('hasReply without reply text still refuses a second reply', () => {
    render(<ReviewCard review={review({ hasReply: true, reply: null })} />)
    expect(screen.getByRole('button', { name: 'Reply' })).toBeDisabled()
  })
})
