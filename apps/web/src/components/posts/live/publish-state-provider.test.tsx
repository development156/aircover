import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import type { PostStatus } from '@sahoda/shared'

import type { PublishSnapshot } from '@/lib/posts/live-state'

/**
 * The chip must follow the SERVER after a refresh.
 *
 * MEASURED 2026-09-06 on /planner: after "Confirm schedule" the row's date and
 * its note re-rendered from the new server tree, while the chip kept reading
 * "Draft" for 8 s and more. The provider seeded `useState(initial)` once and
 * never looked at `initial` again, so a fresher snapshot arriving through the
 * RSC re-render was ignored until a full reload.
 */

vi.mock('@/app/actions/publish-state', () => ({
  readPublishState: vi.fn(() => Promise.resolve({ posts: [], readAt: '' })),
}))

const { PublishStateProvider } = await import('./publish-state-provider')
const { LiveStatusBadge } = await import('./live-status-badge')

const POST_ID = '11111111-1111-4111-8111-111111111111'
const T0 = '2026-09-06T10:00:00.000Z'
const T1 = '2026-09-06T10:00:05.000Z'

function snapshot(intent: PostStatus, readAt: string): PublishSnapshot {
  return { readAt, posts: [{ postId: POST_ID, intent, scheduledAt: null, variants: [] }] }
}

function page(intent: PostStatus, readAt: string) {
  return (
    <PublishStateProvider initial={snapshot(intent, readAt)}>
      <LiveStatusBadge postId={POST_ID} intent={intent} variants={[]} />
    </PublishStateProvider>
  )
}

describe('PublishStateProvider resyncs from a fresher server snapshot', () => {
  test('the chip follows a newer `initial` after a server re-render', () => {
    const { rerender } = render(page('draft', T0))
    expect(screen.getByTestId('status-chip')).toHaveAttribute('data-intent', 'draft')

    rerender(page('scheduled', T1))

    expect(screen.getByTestId('status-chip')).toHaveAttribute('data-intent', 'scheduled')
  })

  test('an OLDER snapshot handed back does not undo what the page already knows', () => {
    // A stale RSC payload (a refresh that raced a poll) must not turn a
    // scheduled chip back into a draft. Same ids, earlier readAt.
    const { rerender } = render(page('scheduled', T1))
    rerender(page('draft', T0))

    expect(screen.getByTestId('status-chip')).toHaveAttribute('data-intent', 'scheduled')
  })
})
