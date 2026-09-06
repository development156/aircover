import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import type { DisplayPost } from '@/lib/posts/display-post'

import { ReviewQueue } from './review-queue'

vi.mock('@/app/actions/approvals', () => ({ approvePosts: vi.fn() }))
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
    render(<ReviewQueue posts={[post({ id: 'a', intent: 'draft' })]} />)

    expect(screen.getByText('Needs approval')).toBeInTheDocument()
    expect(screen.queryByText('Draft')).toBeNull()
  })

  test('a dated idea reads "Needs approval" too', () => {
    render(<ReviewQueue posts={[post({ id: 'a', intent: 'idea' })]} />)

    expect(screen.getByText('Needs approval')).toBeInTheDocument()
  })

  test('a post in review keeps "In review"', () => {
    render(<ReviewQueue posts={[post({ id: 'a', intent: 'review' })]} />)

    expect(screen.getByText('In review')).toBeInTheDocument()
    expect(screen.queryByText('Needs approval')).toBeNull()
  })
})
