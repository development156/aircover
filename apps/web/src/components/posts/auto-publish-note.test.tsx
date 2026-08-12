import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import type { Channel, Post, VariantPublishStatus } from '@sahoda/shared'

import { AutoPublishNote } from '@/components/posts/auto-publish-note'
import { PostCard } from '@/components/posts/post-card'
import { PlannerRow } from '@/components/planner/planner-row'
import { WeekGrid } from '@/components/planner/week-grid'
import { bucketWeek } from '@/lib/planner/week'
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

const post = (overrides: Partial<Post> = {}): Post => ({
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
    retryable: false,
    ...overrides,
  }
}

/** Still waiting — what a post that genuinely never published looks like. */
const WAITING = [row('x', 'pending')]
/** Live on the platform. The case the old rule got wrong. */
const PUBLISHED = [row('x', 'published')]

const NOT_LIVE = /auto-publish isn't live yet/i
const NOTHING_PUBLISHED = /nothing was published/i
const COPY_IT_ACROSS = /copy it across/i

describe('AutoPublishNote', () => {
  test('says a scheduled post will not post itself', () => {
    render(<AutoPublishNote status="scheduled" scheduledAt={FUTURE} now={NOW} variants={WAITING} />)

    expect(screen.getByText(NOT_LIVE)).toBeInTheDocument()
  })

  test('says outright that a past-due one did not publish', () => {
    render(<AutoPublishNote status="scheduled" scheduledAt={PAST} now={NOW} variants={WAITING} />)

    expect(screen.getByText(NOTHING_PUBLISHED)).toBeInTheDocument()
  })

  test('stays silent on a post that promises nothing', () => {
    const { container } = render(
      <AutoPublishNote status="draft" scheduledAt={PAST} now={NOW} variants={WAITING} />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  test('the compact form still carries the full sentence for screen readers', () => {
    // The week grid abbreviates for space. Sighted users get "Missed · not
    // posted"; anyone on a screen reader must not get LESS of the truth.
    render(
      <AutoPublishNote
        status="scheduled"
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
      <AutoPublishNote status="scheduled" scheduledAt={PAST} now={NOW} variants={PUBLISHED} />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  test('never asks for a second publish of a post already on a platform', () => {
    // The defect, stated as the sentence the user read: a past-due post whose
    // channels were already done, told to publish itself again.
    render(
      <AutoPublishNote
        status="scheduled"
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
        status="scheduled"
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

describe('the posts list', () => {
  test('labels a past-due scheduled post', () => {
    render(
      <PostCard
        post={post({ scheduled_at: PAST })}
        now={NOW}
        mode={null}
        variantStates={WAITING}
      />,
    )

    expect(screen.getByText(NOTHING_PUBLISHED)).toBeInTheDocument()
  })

  test('labels an upcoming scheduled post too', () => {
    render(<PostCard post={post()} now={NOW} mode={null} variantStates={WAITING} />)

    expect(screen.getByText(NOT_LIVE)).toBeInTheDocument()
  })

  test('leaves a dated draft alone', () => {
    render(
      <PostCard
        post={post({ status: 'draft', scheduled_at: PAST })}
        now={NOW}
        mode={null}
        variantStates={WAITING}
      />,
    )

    expect(screen.queryByText(NOT_LIVE)).not.toBeInTheDocument()
  })

  test('passes the variant rows down, so a published post is not told to publish', () => {
    // Pins the WIRING, not the rule. The card holds the rows already; dropping
    // the prop on the way to the note is a one-line regression that no test of
    // `autoPublishTruth` alone would ever see.
    render(
      <PostCard
        post={post({ scheduled_at: PAST })}
        now={NOW}
        mode={null}
        variantStates={PUBLISHED}
      />,
    )

    expect(screen.queryByText(NOTHING_PUBLISHED)).not.toBeInTheDocument()
    expect(screen.queryByText(COPY_IT_ACROSS)).not.toBeInTheDocument()
  })
})

describe('the planner list', () => {
  test('labels a past-due scheduled post', () => {
    render(
      <PlannerRow
        post={post({ scheduled_at: PAST })}
        now={NOW}
        mode={null}
        variantStates={WAITING}
      />,
    )

    expect(screen.getByText(NOTHING_PUBLISHED)).toBeInTheDocument()
  })

  test('leaves a dated draft alone', () => {
    render(
      <PlannerRow
        post={post({ status: 'draft', scheduled_at: PAST })}
        now={NOW}
        mode={null}
        variantStates={WAITING}
      />,
    )

    expect(screen.queryByText(NOT_LIVE)).not.toBeInTheDocument()
  })

  test('passes the variant rows down, so a published post is not told to publish', () => {
    render(
      <PlannerRow
        post={post({ scheduled_at: PAST })}
        now={NOW}
        mode={null}
        variantStates={PUBLISHED}
      />,
    )

    expect(screen.queryByText(NOTHING_PUBLISHED)).not.toBeInTheDocument()
  })
})

describe('the planner week grid', () => {
  /** Today's column, earlier in the day — the cell that reads as "this went out this morning". */
  const EARLIER_TODAY = '2026-07-25T03:00:00.000Z'
  /** Outside the 7-day window, so it falls through to a PlannerRow instead of a cell. */
  const LAST_MONTH = '2026-06-01T12:00:00.000Z'

  const statesFor = (rows: readonly VariantStatusRow[]) =>
    new Map([['11111111-1111-4111-8111-111111111111', rows]])

  test('marks a past-due scheduled post inside its day cell', () => {
    const buckets = bucketWeek([post({ scheduled_at: EARLIER_TODAY })], NOW)

    render(
      <WeekGrid buckets={buckets} now={NOW} modes={new Map()} variantStates={statesFor(WAITING)} />,
    )

    expect(screen.getByText(NOTHING_PUBLISHED)).toBeInTheDocument()
  })

  test('carries the note into its overflow rows as well', () => {
    // Posts outside the 7-day window fall through to PlannerRow. A post that
    // was due last month is the most misleading one on the screen.
    const buckets = bucketWeek([post({ scheduled_at: LAST_MONTH })], NOW)

    render(
      <WeekGrid buckets={buckets} now={NOW} modes={new Map()} variantStates={statesFor(WAITING)} />,
    )

    expect(screen.getByText(NOTHING_PUBLISHED)).toBeInTheDocument()
  })

  test('reaches the day cell with the variant rows, not just the overflow rows', () => {
    // The grid already forwarded `variantStates` to its overflow PlannerRows and
    // NOT to its own day cells — so the cell kept making the claim the rows
    // disprove. This is the assertion that was missing.
    const buckets = bucketWeek([post({ scheduled_at: EARLIER_TODAY })], NOW)

    render(
      <WeekGrid
        buckets={buckets}
        now={NOW}
        modes={new Map()}
        variantStates={statesFor(PUBLISHED)}
      />,
    )

    expect(screen.queryByText(NOTHING_PUBLISHED)).not.toBeInTheDocument()
  })
})
