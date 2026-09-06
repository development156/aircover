import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import type { DisplayPost } from '@/lib/posts/display-post'

import { ReviewQueue } from './review-queue'

const BARE = { context: {}, zone: 'Asia/Calcutta', currentUserId: null, decides: true }

vi.mock('@/app/actions/approvals', () => ({ approvePosts: vi.fn() }))
vi.mock('@/app/actions/posts-review', () => ({ returnToDraft: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }))

const WS_ID = '22222222-2222-4222-8222-222222222222'

function post(overrides: Partial<DisplayPost> & { id: string; intent: DisplayPost['intent'] }) {
  return {
    workspace_id: WS_ID,
    title: 'A post',
    body: null,
    channels: ['x'],
    scheduled_at: '2026-07-25T18:00:00.000Z',
    origin: 'plan_week',
    created_by: 'user_abc',
    created_at: '2026-07-20T00:00:00.000Z',
    updated_at: '2026-07-20T01:00:00.000Z',
    ...overrides,
  } as unknown as DisplayPost
}

/**
 * The row badge says WHY the post is in this queue, not what it is.
 *
 * A dated draft with a channel sits here because nothing goes out until a
 * person approves it (`lib/approvals/queue.ts`). "Draft" beside it named the
 * status and left the reader to work out why a draft was in a queue called
 * "Waiting for you". "Needs approval" is the reason, and it is also what the
 * bulk button does.
 */
describe('ReviewQueue · the row badge', () => {
  test('a dated draft reads "Needs approval", not its status word', () => {
    render(<ReviewQueue posts={[post({ id: 'a', intent: 'draft' })]} {...BARE} />)

    expect(screen.getByText('Needs approval')).toBeInTheDocument()
    expect(screen.queryByText('Draft')).toBeNull()
  })

  test('a dated idea reads "Needs approval" too', () => {
    render(<ReviewQueue posts={[post({ id: 'a', intent: 'idea' })]} {...BARE} />)

    expect(screen.getByText('Needs approval')).toBeInTheDocument()
  })

  test('a post in review keeps "In review"', () => {
    render(<ReviewQueue posts={[post({ id: 'a', intent: 'review' })]} {...BARE} />)

    expect(screen.getByText('In review')).toBeInTheDocument()
    expect(screen.queryByText('Needs approval')).toBeNull()
  })
})

describe('ReviewQueue · who may decide', () => {
  test('a viewer sees the queue read-only: no checkbox, no Approve, no Send back, and the note says why', () => {
    render(<ReviewQueue posts={[post({ id: 'a', intent: 'draft' })]} {...BARE} decides={false} />)

    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Approve/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Send back/ })).toBeNull()
    expect(screen.getByText(/only an owner, editor or approver/i)).toBeInTheDocument()
  })

  test('a decider gets Approve on every row, and Send back only where the database would accept it', () => {
    const { unmount } = render(
      <ReviewQueue posts={[post({ id: 'a', intent: 'review' })]} {...BARE} />,
    )
    expect(screen.getByRole('button', { name: /^Approve$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Send back/ })).toBeInTheDocument()
    unmount()

    // A dated draft is in the queue to be approved, not returned: `return_post_to_draft`
    // refuses it, so the control is not offered.
    render(<ReviewQueue posts={[post({ id: 'b', intent: 'draft' })]} {...BARE} />)
    expect(screen.getByRole('button', { name: /^Approve$/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Send back/ })).toBeNull()
  })
})
