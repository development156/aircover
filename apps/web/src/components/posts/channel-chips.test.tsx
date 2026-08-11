import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { PostSchema } from '@sahoda/shared'

import { PostCard } from '@/components/posts/post-card'
import { PlannerRow } from '@/components/planner/planner-row'

/**
 * The channel chips on the two list surfaces, against a row that repeats a channel.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * Both of these surfaces used to carry their own `[...new Set(post.channels)]`
 * and NEITHER had a test. That combination is how the duplicate-channel defect
 * kept moving: a fix landed on whichever consumer was reported, its sibling kept
 * a private copy of the guard, and no test would have noticed if either copy went
 * away. Both copies are now gone — the guarantee comes from `PostSchema` — so
 * these surfaces need the coverage the local guards were standing in for.
 *
 * The post is built by PARSING A ROW, not by handing a component a tidy literal.
 * A literal would test the fixture; the row is what the database can actually
 * produce, because `posts.channels` is a bare `text[]` with no unique constraint.
 *
 * ── THE MUTATION ─────────────────────────────────────────────────────────────
 * Delete the `new Set` from `toChannelSet` (packages/shared/src/db/channel-set.ts)
 * and both tests below fail: two chips for one channel, and two React children
 * under the same `key={channel}`. The user-visible defect is a post that looks
 * like it is going to two places when it is going to one.
 */

// The list controls are client islands over server actions that reach Clerk on
// import. Same mocks `auto-publish-note.test.tsx` uses for the same components.
vi.mock('@/app/actions/planner', () => ({ approvePost: vi.fn() }))
vi.mock('@/app/actions/posts', () => ({ savePost: vi.fn(), deletePost: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const NOW = new Date('2026-08-11T12:00:00.000Z')

/** A `posts` row exactly as PostgREST can hand it back — LinkedIn twice. */
const rowWithRepeatedChannel = {
  id: '11111111-1111-4111-8111-111111111111',
  workspace_id: '22222222-2222-4222-8222-222222222222',
  title: 'Monsoon menu',
  body: 'Hot filter coffee is back.',
  status: 'draft',
  channels: ['linkedin', 'linkedin'],
  scheduled_at: null,
  origin: 'manual',
  created_by: 'user_1',
  created_at: '2026-08-10T10:00:00.000Z',
  updated_at: '2026-08-10T10:00:00.000Z',
}

describe('a repeated channel on a posts row', () => {
  test('renders ONE chip on the posts list, not two destinations', () => {
    // Arrange — the row goes through the real read boundary.
    const post = PostSchema.parse(rowWithRepeatedChannel)

    // Act
    render(<PostCard post={post} now={NOW} mode={null} />)

    // Assert — `CHANNEL_SHORT.linkedin`. Two of these is the defect: the card
    // reads as a post aimed at two separate LinkedIn destinations.
    expect(screen.getAllByText('LinkedIn')).toHaveLength(1)
  })

  test('renders ONE chip on the planner row', () => {
    // Arrange
    const post = PostSchema.parse(rowWithRepeatedChannel)

    // Act
    render(<PlannerRow post={post} now={NOW} mode={null} />)

    // Assert
    expect(screen.getAllByText('LinkedIn')).toHaveLength(1)
  })
})
