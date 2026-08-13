import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { toChannelSet } from '@sahoda/shared'

import { LiveChannelChips } from '@/components/posts/live/live-channel-chips'
import { LiveStatusBadge } from '@/components/posts/live/live-status-badge'
import { PublishStateProvider } from '@/components/posts/live/publish-state-provider'
import type { PublishSnapshot } from '@/lib/posts/live-state'
import type { VariantStatusRow } from '@/lib/posts/variant-status'

/**
 * The live regions: what they render before a poll, after one, and what they
 * refuse to render at all.
 *
 * The server action is mocked because these assert RENDERING, not fetching. The
 * cadence — when and whether a poll is even armed — is a pure function with its
 * own tests in `lib/posts/live-state.test.ts`, which is the point of it being
 * pure.
 */
vi.mock('@/app/actions/publish-state', () => ({ readPublishState: vi.fn(async () => null) }))

const POST_ID = '11111111-1111-4111-8111-111111111111'

const variant = (over: Partial<VariantStatusRow> = {}): VariantStatusRow => ({
  channel: 'instagram',
  status: 'pending',
  permalink: null,
  platformPostId: null,
  simulated: false,
  errorMessage: null,
  errorCode: null,
  gateRefusal: null,
  retryable: true,
  ...over,
})

const snapshot = (over: Partial<PublishSnapshot['posts'][number]> = {}): PublishSnapshot => ({
  readAt: '2026-08-11T12:00:00.000Z',
  posts: [
    {
      postId: POST_ID,
      intent: 'draft',
      scheduledAt: null,
      variants: [],
      ...over,
    },
  ],
})

describe('LiveStatusBadge', () => {
  test('renders the server status when there is no provider above it', () => {
    // A live region is an ENHANCEMENT. Nothing on these screens may depend on it
    // to be correct, so the un-wired case must be exactly `StatusBadge`.
    render(<LiveStatusBadge postId={POST_ID} intent="scheduled" variants={[]} />)

    expect(screen.getByText('Scheduled')).toBeInTheDocument()
  })

  test('follows the row when a poll moves it', () => {
    // Arrange — the page was rendered while the post was still scheduled.
    // Act
    render(
      <PublishStateProvider initial={snapshot({ intent: 'publishing' })}>
        <LiveStatusBadge postId={POST_ID} intent="scheduled" variants={[]} />
      </PublishStateProvider>,
    )

    // Assert — this is the whole feature: the user did not reload.
    expect(screen.getByText('Publishing')).toBeInTheDocument()
    expect(screen.queryByText('Scheduled')).not.toBeInTheDocument()
  })

  test('takes intent and evidence from the SAME read, never one of each', () => {
    // The honesty rule that is easiest to break by accident. `certaintyFor`
    // grants `.is-real` — "it happened" — only on a live outcome. A fresh intent
    // paired with the stale SERVER rows is the one combination that can
    // manufacture a claim neither read supports.
    const { container } = render(
      <PublishStateProvider initial={snapshot({ intent: 'published', variants: [] })}>
        {/* The server prop carries a live publish; the fresh read has no rows. */}
        <LiveStatusBadge
          postId={POST_ID}
          intent="draft"
          variants={[variant({ status: 'published', permalink: 'https://example.test/p/1' })]}
        />
      </PublishStateProvider>,
    )

    // The weaker claim wins, because the evidence came from the same object as
    // the intent. `.is-real` here would be an unearned "it happened".
    expect(screen.getByText('Published')).toBeInTheDocument()
    expect(container.querySelector('.is-real')).toBeNull()
  })
})

describe('LiveChannelChips', () => {
  const channels = toChannelSet(['instagram'])

  test('shows a published channel with no link as exactly that', () => {
    render(
      <LiveChannelChips
        postId={POST_ID}
        channels={channels}
        initialRows={[variant({ status: 'published', permalink: null })]}
      />,
    )

    expect(screen.getByText(/published, no link yet/)).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })

  test('renders the platform link the moment the permalink lands', () => {
    // Arrange — the server rendered a publish that had no URL yet. The poll has
    // since seen `platformPostUrl` arrive on the variant row.
    const live = snapshot({
      intent: 'published',
      variants: [
        variant({
          status: 'published',
          permalink: 'https://instagram.com/p/abc123',
          platformPostId: 'abc123',
        }),
      ],
    })

    // Act
    render(
      <PublishStateProvider initial={live}>
        <LiveChannelChips
          postId={POST_ID}
          channels={channels}
          initialRows={[variant({ status: 'publishing' })]}
        />
      </PublishStateProvider>,
    )

    // Assert
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://instagram.com/p/abc123')
  })

  test('never links a fixture run, however published it says it is', () => {
    // `variantStatusRow` nulls a `fixture://` permalink and keeps `simulated` as
    // the only field that still knows. A payload that carried `status` and
    // `permalink` but dropped `simulated` would look complete and would relabel
    // every simulated run as a real publish — so the row travels whole.
    const live = snapshot({
      intent: 'published',
      variants: [variant({ status: 'published', simulated: true, permalink: null })],
    })

    render(
      <PublishStateProvider initial={live}>
        <LiveChannelChips postId={POST_ID} channels={channels} initialRows={[]} />
      </PublishStateProvider>,
    )

    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText(/published, no link yet/)).toBeInTheDocument()
  })

  test('renders the SERVER list of channels, never a channel a poll invented', () => {
    // A poll reports what each channel is DOING. Which channels a post is aimed
    // at is the writer's own edit, and `use-autosave` owns it.
    const live = snapshot({
      variants: [variant({ channel: 'x', status: 'published' }), variant({ status: 'published' })],
    })

    render(
      <PublishStateProvider initial={live}>
        <LiveChannelChips
          postId={POST_ID}
          channels={toChannelSet(['instagram'])}
          initialRows={[]}
        />
      </PublishStateProvider>,
    )

    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('Instagram')).toBeInTheDocument()
  })
})
