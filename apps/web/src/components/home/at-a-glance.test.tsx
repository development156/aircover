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
    outside: [],
  }
  render(<AtAGlance posts={posts} buckets={buckets} publish={PUBLISH} balance={BALANCE} />)
}

const cell = (label: RegExp) => screen.getByRole('link', { name: label }).textContent ?? ''

describe('the board counts what the ladder counts', () => {
  test('"Scheduled" counts only committed posts in the week', () => {
    board([post('a', 'approved'), post('s', 'scheduled'), post('r', 'review'), post('d', 'draft')])
    expect(cell(/^Scheduled/)).toMatch(/2\s*posts/)
    expect(cell(/^Scheduled/)).toMatch(/approved/i)
  })

  test('"Waiting on you" counts review, failures and dated drafts, and nothing approved', () => {
    board([
      post('a', 'approved'),
      post('r', 'review'),
      post('f', 'failed'),
      post('d', 'draft'),
      post('u', 'draft', { scheduled_at: null }),
    ])
    expect(cell(/^Waiting on you/)).toMatch(/3\s*posts/)
  })

  test('a review post dated this week is waiting, not scheduled', () => {
    board([post('r', 'review')])
    expect(cell(/^Waiting on you/)).toMatch(/1\s*post/)
    expect(cell(/^Scheduled/)).toMatch(/0\s*posts/)
  })
})
