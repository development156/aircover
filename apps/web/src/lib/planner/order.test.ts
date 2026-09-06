import { describe, expect, test } from 'vitest'
import { toChannelSet } from '@sahoda/shared'
import type { PostStatus } from '@sahoda/shared'

import type { DisplayPost } from '@/lib/posts/display-post'
import { byPlanOrder, inPlanOrder } from './order'

/**
 * A PLAN READS IN TIME ORDER.
 *
 * The list came back from the database by `updated_at`, which is the order you
 * EDITED things in, and the planner rendered it as-is: a post for Friday sat
 * above one for Tuesday because Friday's was touched last. That is the order of
 * a changelog, not of a plan. Undated posts have no place on a timeline, so they
 * come last, newest edit first — the one place edit order still means something.
 */
function post(over: Partial<DisplayPost> & { id: string }): DisplayPost {
  return {
    workspace_id: 'w1',
    title: null,
    body: null,
    channels: toChannelSet(['x']),
    scheduled_at: null,
    origin: 'manual',
    created_by: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    intent: 'draft' as PostStatus,
    ...over,
  } as DisplayPost
}

describe('byPlanOrder', () => {
  test('dated posts come first, soonest first, whatever their edit order', () => {
    const friday = post({
      id: 'fri',
      scheduled_at: '2026-09-11T09:00:00.000Z',
      updated_at: '2026-09-06T10:00:00.000Z',
    })
    const tuesday = post({
      id: 'tue',
      scheduled_at: '2026-09-08T09:00:00.000Z',
      updated_at: '2026-09-01T10:00:00.000Z',
    })

    expect(inPlanOrder([friday, tuesday]).map((p) => p.id)).toEqual(['tue', 'fri'])
  })

  test('undated posts come last, most recently edited first', () => {
    const dated = post({ id: 'dated', scheduled_at: '2026-09-11T09:00:00.000Z' })
    const older = post({ id: 'older', updated_at: '2026-09-01T10:00:00.000Z' })
    const newer = post({ id: 'newer', updated_at: '2026-09-05T10:00:00.000Z' })

    expect(inPlanOrder([older, dated, newer]).map((p) => p.id)).toEqual(['dated', 'newer', 'older'])
  })

  test('compares instants, so an offset-written time sorts by the moment it names', () => {
    // 20:00 New York on the 2nd IS 00:00Z on the 3rd. It must sort AFTER a post
    // at 23:00Z on the 2nd, not before it because the string starts "2026-09-02".
    const ny = post({ id: 'ny', scheduled_at: '2026-09-02T20:00:00-04:00' })
    const utc = post({ id: 'utc', scheduled_at: '2026-09-02T23:00:00.000Z' })

    expect(inPlanOrder([ny, utc]).map((p) => p.id)).toEqual(['utc', 'ny'])
    expect(byPlanOrder(ny, utc)).toBeGreaterThan(0)
  })

  test('an unparseable time is treated as no time, and does not throw', () => {
    const bad = post({
      id: 'bad',
      scheduled_at: 'not a date',
      updated_at: '2026-09-05T10:00:00.000Z',
    })
    const dated = post({ id: 'ok', scheduled_at: '2026-09-11T09:00:00.000Z' })

    expect(inPlanOrder([bad, dated]).map((p) => p.id)).toEqual(['ok', 'bad'])
  })

  test('returns a new array and leaves the input alone', () => {
    const a = post({ id: 'a', scheduled_at: '2026-09-11T09:00:00.000Z' })
    const b = post({ id: 'b', scheduled_at: '2026-09-08T09:00:00.000Z' })
    const input = [a, b]

    const out = inPlanOrder(input)

    expect(out).not.toBe(input)
    expect(input.map((p) => p.id)).toEqual(['a', 'b'])
  })
})
