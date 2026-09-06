import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import type { Channel, Post, VariantPublishStatus } from '@sahoda/shared'

import { AutoPublishNote } from '@/components/posts/auto-publish-note'
import { PostCard } from '@/components/posts/post-card'
import { PlannerRow } from '@/components/planner/planner-row'
import { WeekTimeline } from '@/components/planner/week-timeline'
import { weekWindow } from '@/lib/planner/week-window'
import { forDisplay, type DisplayPost } from '@/lib/posts/display-post'
import type { VariantStatusRow } from '@/lib/posts/variant-status'
import { toChannelSet } from '@sahoda/shared'

/**
 * The note, and every surface that owes it.
 *
 * A "Scheduled" chip next to a date and time is read as "this goes out on its
 * own". Nothing publishes it — no cron, no dispatch, no dependency on
 * @sahoda/jobs from apps/web at all — so for a past-due post that reading is
 * provably false: the time came and went in silence. An investor or customer
 * looking at that screen concludes auto-publish works.
 *
 * These pin the note onto every surface that shows a scheduled post, because a
 * surface that quietly omits it is exactly where the false impression survives.
 *
 * Since the note started reading `post_variants.publish_status`, each surface
 * also owes it the ROWS. A surface that forgets them says "won't post itself"
 * over a post that is already on two platforms, so every one of them is pinned
 * twice: once on the unpublished post, once on the published one.
 */

// The planner row's controls are client islands over server actions; they reach
// Clerk on import and are not what this file is about.
vi.mock('@/app/actions/planner', () => ({ approvePost: vi.fn() }))
vi.mock('@/app/actions/posts', () => ({ savePost: vi.fn(), deletePost: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const NOW = new Date('2026-07-25T12:00:00.000Z')
const PAST = '2026-07-24T12:00:00.000Z'
const FUTURE = '2026-07-26T12:00:00.000Z'
const ZONE = 'Asia/Kolkata'

const post = (overrides: Partial<Post> = {}): DisplayPost =>
  forDisplay({
    id: '11111111-1111-4111-8111-111111111111',
    workspace_id: '22222222-2222-4222-8222-222222222222',
    title: 'Diwali teaser',
    body: 'Lights on.',
    status: 'scheduled',
    channels: toChannelSet(['x']),
    scheduled_at: FUTURE,
    origin: 'manual',
    created_by: 'user_1',
    created_at: '2026-07-20T10:00:00.000Z',
    updated_at: '2026-07-20T10:00:00.000Z',
    ...overrides,
  })

function row(
  channel: Channel,
  status: VariantPublishStatus,
  overrides: Partial<VariantStatusRow> = {},
): VariantStatusRow {
  return {
    channel,
    status,
    permalink: status === 'published' ? `https://example.test/${channel}` : null,
    platformPostId: status === 'published' ? `pp_${channel}` : null,
    simulated: false,
    errorMessage: null,
    errorCode: null,
    gateRefusal: null,
    retryable: false,
    ...overrides,
  }
}

/** The channel every direct render below is aimed at. */
const ONE_CHANNEL = toChannelSet(['x'])

/** Still waiting — what a post that genuinely never published looks like. */
const WAITING = [row('x', 'pending')]
/** Live on the platform. The case the old rule got wrong. */
const PUBLISHED = [row('x', 'published')]

const NOT_LIVE = /auto-publish isn't live yet/i
const NOTHING_PUBLISHED = /nothing was published/i
const COPY_IT_ACROSS = /copy it across/i

describe('AutoPublishNote', () => {
  test('says a scheduled post will not post itself', () => {
    render(
      <AutoPublishNote
        channels={ONE_CHANNEL}
        intent="scheduled"
        scheduledAt={FUTURE}
        now={NOW}
        variants={WAITING}
      />,
    )

    expect(screen.getByText(NOT_LIVE)).toBeInTheDocument()
  })

  test('says outright that a past-due one did not publish', () => {
    render(
      <AutoPublishNote
        channels={ONE_CHANNEL}
        intent="scheduled"
        scheduledAt={PAST}
        now={NOW}
        variants={WAITING}
      />,
    )

    expect(screen.getByText(NOTHING_PUBLISHED)).toBeInTheDocument()
  })

  test('stays silent on a post that promises nothing', () => {
    const { container } = render(
      <AutoPublishNote
        channels={ONE_CHANNEL}
        intent="draft"
        scheduledAt={PAST}
        now={NOW}
        variants={WAITING}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  test('the compact form still carries the full sentence for screen readers', () => {
    // The week grid abbreviates for space. Sighted users get "Missed · not
    // posted"; anyone on a screen reader must not get LESS of the truth.
    render(
      <AutoPublishNote
        channels={ONE_CHANNEL}
        intent="scheduled"
        scheduledAt={PAST}
        now={NOW}
        variants={WAITING}
        variant="compact"
      />,
    )

    expect(screen.getByText(NOTHING_PUBLISHED)).toBeInTheDocument()
  })

  test('says nothing at all over a post that is fully out', () => {
    const { container } = render(
      <AutoPublishNote
        channels={ONE_CHANNEL}
        intent="scheduled"
        scheduledAt={PAST}
        now={NOW}
        variants={PUBLISHED}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  test('never asks for a second publish of a post already on a platform', () => {
    // The defect, stated as the sentence the user read: a past-due post whose
    // channels were already done, told to publish itself again.
    render(
      <AutoPublishNote
        channels={ONE_CHANNEL}
        intent="scheduled"
        scheduledAt={PAST}
        now={NOW}
        variants={[row('instagram', 'published'), row('linkedin', 'pending')]}
      />,
    )

    expect(screen.queryByText(NOTHING_PUBLISHED)).not.toBeInTheDocument()
    expect(screen.queryByText(COPY_IT_ACROSS)).not.toBeInTheDocument()
    expect(screen.getByText(/out on some channels and not on others/i)).toBeInTheDocument()
  })

  test('names the simulation when every publish ran on the fixture rail', () => {
    render(
      <AutoPublishNote
        channels={ONE_CHANNEL}
        intent="scheduled"
        scheduledAt={PAST}
        now={NOW}
        variants={[
          row('instagram', 'published', { simulated: true, permalink: null, platformPostId: null }),
        ]}
      />,
    )

    expect(screen.getByText(/ran as a simulation/i)).toBeInTheDocument()
    expect(screen.queryByText(NOTHING_PUBLISHED)).not.toBeInTheDocument()
  })
})

describe('a post with no channel at all', () => {
  test('never says it goes out on its own — nothing can, with nowhere to go', () => {
    // MEASURED 2026-09-06: an empty post with zero channels, scheduled from the
    // composer, read "Scheduled" + "Goes out on its own at this time." on the
    // planner. The dispatcher has nothing to send to.
    render(
      <AutoPublishNote
        channels={toChannelSet([])}
        intent="scheduled"
        scheduledAt={FUTURE}
        now={NOW}
        variants={[]}
        autoPublish
      />,
    )

    expect(screen.queryByText(/goes out on its own/i)).not.toBeInTheDocument()
    expect(screen.getByText(/no channel picked/i)).toBeInTheDocument()
  })

  test('says the same when auto-publish is not live here', () => {
    render(
      <AutoPublishNote
        channels={toChannelSet([])}
        intent="scheduled"
        scheduledAt={FUTURE}
        now={NOW}
        variants={[]}
      />,
    )

    expect(screen.getByText(/no channel picked/i)).toBeInTheDocument()
  })

  test('the compact form carries it for screen readers too', () => {
    render(
      <AutoPublishNote
        channels={toChannelSet([])}
        intent="scheduled"
        scheduledAt={FUTURE}
        now={NOW}
        variants={[]}
        variant="compact"
        autoPublish
      />,
    )

    expect(screen.getByText(/no channel picked/i)).toBeInTheDocument()
  })
})

describe('the posts list', () => {
  test('labels a past-due scheduled post', () => {
    render(<PostCard post={post({ scheduled_at: PAST })} now={NOW} variantStates={WAITING} />)

    expect(screen.getByText(NOTHING_PUBLISHED)).toBeInTheDocument()
  })

  test('labels an upcoming scheduled post too', () => {
    render(<PostCard post={post()} now={NOW} variantStates={WAITING} />)

    expect(screen.getByText(NOT_LIVE)).toBeInTheDocument()
  })

  test('leaves a dated draft alone', () => {
    render(
      <PostCard
        post={post({ status: 'draft', scheduled_at: PAST })}
        now={NOW}
        variantStates={WAITING}
      />,
    )

    expect(screen.queryByText(NOT_LIVE)).not.toBeInTheDocument()
  })

  test('passes the variant rows down, so a published post is not told to publish', () => {
    // Pins the WIRING, not the rule. The card holds the rows already; dropping
    // the prop on the way to the note is a one-line regression that no test of
    // `autoPublishTruth` alone would ever see.
    render(<PostCard post={post({ scheduled_at: PAST })} now={NOW} variantStates={PUBLISHED} />)

    expect(screen.queryByText(NOTHING_PUBLISHED)).not.toBeInTheDocument()
    expect(screen.queryByText(COPY_IT_ACROSS)).not.toBeInTheDocument()
  })
})

describe('the planner list', () => {
  test('labels a past-due scheduled post', () => {
    render(
      <PlannerRow
        zone={ZONE}
        post={post({ scheduled_at: PAST })}
        now={NOW}
        variantStates={WAITING}
      />,
    )

    expect(screen.getByText(NOTHING_PUBLISHED)).toBeInTheDocument()
  })

  test('leaves a dated draft alone', () => {
    render(
      <PlannerRow
        zone={ZONE}
        post={post({ status: 'draft', scheduled_at: PAST })}
        now={NOW}
        variantStates={WAITING}
      />,
    )

    expect(screen.queryByText(NOT_LIVE)).not.toBeInTheDocument()
  })

  test('passes the variant rows down, so a published post is not told to publish', () => {
    render(
      <PlannerRow
        zone={ZONE}
        post={post({ scheduled_at: PAST })}
        now={NOW}
        variantStates={PUBLISHED}
      />,
    )

    expect(screen.queryByText(NOTHING_PUBLISHED)).not.toBeInTheDocument()
  })
})

/**
 * ── THE WEEK VIEW IS `WeekTimeline` NOW ──────────────────────────────────────
 * `WeekGrid`, which these used to render, was imported by this file and by
 * nothing else: no route drew it. The claims below are retargeted at the
 * surface `/planner?view=week` actually renders. A timeline card has no room
 * for the auto-publish sentence, so what it owes instead is the CERTAINTY rung:
 * a past-due post nothing sent is drawn as committed and never as real, and the
 * variant rows are what decide that — the wiring the third case pins.
 */
describe('the planner week timeline', () => {
  /** Today's column, earlier in the day — the card that reads as "this went out this morning". */
  const EARLIER_TODAY = '2026-07-25T03:00:00.000Z'

  const statesFor = (rows: readonly VariantStatusRow[]) =>
    new Map([['11111111-1111-4111-8111-111111111111', rows]])

  const timeline = (rows: ReadonlyMap<string, readonly VariantStatusRow[]>) =>
    render(
      <WeekTimeline
        days={weekWindow(ZONE, NOW, 0).days}
        posts={[post({ scheduled_at: EARLIER_TODAY })]}
        variantStates={rows}
        today={NOW}
        zone={ZONE}
      />,
    )

  const card = () => screen.getByRole('link', { name: /diwali teaser/i })

  test('draws a past-due post nothing sent as committed, never as real', () => {
    timeline(statesFor(WAITING))

    expect(card().getAttribute('data-certainty')).toBe('committed')
  })

  test('draws a post that is out on the platform as real', () => {
    timeline(statesFor(PUBLISHED))

    expect(card().getAttribute('data-certainty')).toBe('real')
  })

  test('reaches the card with the variant rows — a missing entry under-claims', () => {
    // The evidence is the rows, not the post's own status. With no rows read
    // for this post the card must fall to the weaker claim, not the stronger.
    timeline(new Map())

    expect(card().getAttribute('data-certainty')).toBe('committed')
  })

  test('carries the seeded tour anchor the retired grid held and no route rendered', () => {
    const { container } = timeline(statesFor(WAITING))

    expect(container.querySelector('[data-guide="planner.week"]')).not.toBeNull()
  })
})
