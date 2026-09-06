import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import type { DisplayPost } from '@/lib/posts/display-post'
import type { WeekBuckets } from '@/lib/planner/week'

import { WeekStrip } from './week-strip'

/**
 * A week cell at 1440 is ~110px wide and the entry's title truncates to about
 * ten characters (MEASURED 2026-09-06 on the wt-core preview with a
 * 200-character title: "Tuesday ro…"). Truncation is right for the calendar;
 * losing the rest of the sentence with no way to read it short of clicking is
 * not. The `title` attribute is the cheapest honest answer: hover reveals it,
 * and assistive tech that reads titles gets the whole name.
 */
const LONG_TITLE = 'Tuesday roast is back on the counter and this time we are doing the full spread'

const post = {
  id: 'p1',
  workspace_id: 'w1',
  title: LONG_TITLE,
  body: 'Roasted this week.',
  intent: 'review',
  channels: ['instagram'],
  scheduled_at: '2026-09-07T04:30:00.000Z',
  origin: 'manual',
  created_at: '2026-09-06T05:00:00.000Z',
  updated_at: '2026-09-06T05:00:00.000Z',
  created_by: 'u1',
} as unknown as DisplayPost

const buckets: WeekBuckets = {
  days: [{ key: '2026-09-07', date: new Date('2026-09-07T04:30:00.000Z'), posts: [post] }],
  unscheduled: [],
  outside: [],
}

describe('a week entry keeps its whole title reachable', () => {
  test('the truncated entry carries the full title as its tooltip', () => {
    render(<WeekStrip buckets={buckets} variantStates={new Map()} />)
    const entry = screen.getByRole('link', { name: new RegExp(LONG_TITLE.slice(0, 20)) })
    expect(entry).toHaveAttribute('title', LONG_TITLE)
  })

  test('an untitled post says so, and does not claim an empty tooltip', () => {
    const untitled = { ...post, id: 'p2', title: '   ' } as unknown as DisplayPost
    render(
      <WeekStrip
        buckets={{ ...buckets, days: [{ ...buckets.days[0]!, posts: [untitled] }] }}
        variantStates={new Map()}
      />,
    )
    expect(screen.getByRole('link', { name: /untitled post/i })).toHaveAttribute(
      'title',
      'Untitled post',
    )
  })
})
