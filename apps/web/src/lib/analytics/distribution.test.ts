import { describe, expect, it } from 'vitest'

import { postsPerChannel, postsPerWeek } from '@/lib/analytics/distribution'
import type { PublishedRow } from '@/lib/analytics/window-data'

const row = (over: Partial<PublishedRow> = {}): PublishedRow => ({
  postId: 'p1',
  title: 'A post',
  channel: 'instagram',
  publishedAt: '2026-08-10T09:00:00Z',
  reachAtAge: null,
  impressionsAtAge: null,
  engagementAtAge: null,
  ...over,
})

/**
 * ── EVERY ZERO IN THIS FILE IS A MEASUREMENT, AND THAT IS THE POINT ──────────
 * These two charts count PUBLISHES, not readings. The publish log is complete
 * by construction: a week with no bar did not go unmeasured, it had no posts.
 * So unlike every reach figure on this page, a zero here is real knowledge and
 * is drawn as `Bars`' measured-zero stub rather than left blank.
 */
describe('postsPerChannel', () => {
  it('counts a post once per channel it went to, and orders by count', () => {
    const counts = postsPerChannel([
      row({ postId: 'a', channel: 'instagram' }),
      row({ postId: 'b', channel: 'instagram' }),
      row({ postId: 'a', channel: 'linkedin' }),
    ])
    expect(counts).toEqual([
      { channel: 'instagram', posts: 2 },
      { channel: 'linkedin', posts: 1 },
    ])
  })

  it('never counts one post twice on one channel, however many legs it has', () => {
    // `post_publish_logs` has no unique key on (post_id, channel) and a retry
    // that eventually succeeded leaves two rows. `readWindow` already keeps the
    // latest, and this refuses the double independently.
    expect(
      postsPerChannel([
        row({ postId: 'a', channel: 'instagram' }),
        row({ postId: 'a', channel: 'instagram' }),
      ]),
    ).toEqual([{ channel: 'instagram', posts: 1 }])
  })

  it('is empty rather than a row of zeroes when nothing published', () => {
    expect(postsPerChannel([])).toEqual([])
  })
})

describe('postsPerWeek', () => {
  const view = { from: '2026-08-01', to: '2026-08-28' }

  it('gives every week in the window a column, including the empty ones', () => {
    const weeks = postsPerWeek([row({ publishedAt: '2026-08-03T09:00:00Z' })], view, 'UTC')
    expect(weeks.map((week) => week.from)).toEqual([
      '2026-08-01',
      '2026-08-08',
      '2026-08-15',
      '2026-08-22',
    ])
    // A week with nothing in it is a MEASURED zero, not an absence.
    expect(weeks.map((week) => week.posts)).toEqual([1, 0, 0, 0])
  })

  it('counts a post once however many channels it went to', () => {
    const weeks = postsPerWeek(
      [
        row({ postId: 'a', channel: 'instagram', publishedAt: '2026-08-03T09:00:00Z' }),
        row({ postId: 'a', channel: 'linkedin', publishedAt: '2026-08-03T09:00:00Z' }),
      ],
      view,
      'UTC',
    )
    expect(weeks[0]?.posts).toBe(1)
  })

  it('buckets a publish by the workspace clock, not by UTC', () => {
    // 23:30 UTC on 7 August is 05:00 on 8 August in Kolkata, which is the next
    // week's column. Bucketing in UTC would put it in the week the header does
    // not say it is in.
    const late = [row({ publishedAt: '2026-08-07T23:30:00Z' })]
    expect(postsPerWeek(late, view, 'UTC')[0]?.posts).toBe(1)
    expect(postsPerWeek(late, view, 'Asia/Kolkata')[1]?.posts).toBe(1)
  })

  it('says when the last column is short, rather than drawing a fall that is a calendar', () => {
    // 1 to 30 August is four full weeks and two days. A two-day column beside
    // four seven-day ones looks like a collapse in output.
    const weeks = postsPerWeek([], { from: '2026-08-01', to: '2026-08-30' }, 'UTC')
    expect(weeks).toHaveLength(5)
    expect(weeks[4]?.days).toBe(2)
    expect(weeks[0]?.days).toBe(7)
  })

  it('drops a publish outside the window rather than folding it into an end column', () => {
    expect(postsPerWeek([row({ publishedAt: '2026-07-30T09:00:00Z' })], view, 'UTC')).toEqual(
      postsPerWeek([], view, 'UTC'),
    )
  })
})
