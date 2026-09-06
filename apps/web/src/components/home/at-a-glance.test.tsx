import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import type { DisplayPost } from '@/lib/posts/display-post'
import type { WeekBuckets } from '@/lib/planner/week'
import type { PublishSummary } from '@/lib/home/publishing'

import { AtAGlance } from './at-a-glance'

/**
 * The board's first two numbers are claims about the same posts, read through
 * two different filters, and the audit of 2026-09-06 measured them disagreeing
 * with the certainty ladder: a post in review, dated tomorrow, counted as
 * "Scheduled · 1 post · In the next seven days" while the week strip beneath
 * drew it as a neutral outline. "Scheduled" now means what the ladder means by
 * committed: approved, scheduled or publishing. "Waiting on you" gained the
 * dated, channelled draft, per the founder's delegation.
 */
const post = (id: string, intent: string, over: Partial<DisplayPost> = {}): DisplayPost =>
  ({
    id,
    intent,
    title: id,
    body: '',
    channels: ['instagram'],
    scheduled_at: '2026-09-07T04:30:00.000Z',
    origin: 'manual',
    ...over,
  }) as unknown as DisplayPost

const PUBLISH: PublishSummary = {
  status: 'empty',
  attempts: 0,
  succeeded: 0,
  failed: 0,
  live: 0,
  fixture: 0,
  capped: false,
  coveredFrom: null,
}

const BALANCE = {
  status: 'ok',
  balance: { total: 100, held: 0, available: 100, hasHold: false, heldNote: null },
} as const

function board(posts: DisplayPost[]) {
  const buckets: WeekBuckets = {
    days: [{ key: '2026-09-07', date: new Date('2026-09-07T04:30:00.000Z'), posts }],
    unscheduled: [],
  }
  render(
    <AtAGlance
      zone="Asia/Kolkata"
      posts={posts}
      buckets={buckets}
      publish={PUBLISH}
      balance={BALANCE}
    />,
  )
}

const cell = (label: RegExp) => screen.getByRole('link', { name: label }).textContent ?? ''

describe('the board draws only what it can prove', () => {
  test('the credits cell carries the ledger line once two days are known', () => {
    const buckets: WeekBuckets = { days: [], unscheduled: [] }
    render(
      <AtAGlance
        zone="Asia/Kolkata"
        posts={[]}
        buckets={buckets}
        publish={PUBLISH}
        balance={BALANCE}
        history={[
          { date: '2026-09-04', total: 0 },
          { date: '2026-09-05', total: 100 },
          { date: '2026-09-06', total: 70 },
        ]}
      />,
    )
    expect(
      screen.getByRole('img', { name: /credits over the last 3 days, from 0 to 70/i }),
    ).toBeInTheDocument()
  })

  test('no line is drawn from an empty or one-day history', () => {
    const buckets: WeekBuckets = { days: [], unscheduled: [] }
    render(
      <AtAGlance
        zone="Asia/Kolkata"
        posts={[]}
        buckets={buckets}
        publish={PUBLISH}
        balance={BALANCE}
        history={[{ date: '2026-09-06', total: 100 }]}
      />,
    )
    expect(screen.queryByRole('img', { name: /credits over/i })).toBeNull()
  })

  test('the waiting cell wears the wash only while something waits', () => {
    board([post('r', 'review')])
    expect(screen.getByRole('link', { name: /^Needs your OK/ }).className).toMatch(/--brand-wash/)
    expect(screen.getByRole('link', { name: /^Posted/ }).className).not.toMatch(/--brand-wash/)
  })

  test('the week bars say what is on which day', () => {
    board([post('a', 'approved'), post('d', 'draft')])
    expect(
      screen.getByRole('img', { name: /posts ready to go, by day: mon 1/i }),
    ).toBeInTheDocument()
  })
})

describe('the board counts what the ladder counts', () => {
  test('"Scheduled" counts only committed posts in the week', () => {
    board([post('a', 'approved'), post('s', 'scheduled'), post('r', 'review'), post('d', 'draft')])
    expect(cell(/^Going out this week/)).toMatch(/2\s*posts/)
    expect(cell(/^Going out this week/)).toMatch(/ready and set to post/i)
  })

  test('"Waiting on you" counts review, failures and dated drafts, and nothing approved', () => {
    board([
      post('a', 'approved'),
      post('r', 'review'),
      post('f', 'failed'),
      post('d', 'draft'),
      post('u', 'draft', { scheduled_at: null }),
    ])
    expect(cell(/^Needs your OK/)).toMatch(/3\s*posts/)
  })

  test('a review post dated this week is waiting, not scheduled', () => {
    board([post('r', 'review')])
    expect(cell(/^Needs your OK/)).toMatch(/1\s*post/)
    expect(cell(/^Going out this week/)).toMatch(/0\s*posts/)
  })
})
