import { describe, expect, test } from 'vitest'
import type { Post } from '@sahoda/shared'

import { bucketWeek } from './week'
import { forDisplay, type DisplayPost } from '@/lib/posts/display-post'
import { toChannelSet } from '@sahoda/shared'

/**
 * Buckets are keyed by the calendar day of the WORKSPACE'S zone — the zone
 * every screen renders and labels. A UTC-keyed bucket would file an 00:01 post
 * under yesterday's column; an IST-keyed one, which is what this was, did the
 * same to every workspace outside India.
 */

const IST = 'Asia/Kolkata'
const NY = 'America/New_York'

const NOW = new Date('2026-07-20T06:00:00.000Z') // 11:30 IST, Mon 20 Jul

// Through `forDisplay`, like every real call site: the buckets carry what the
// RENDERING layer sees, which no longer includes `status`.
function post(overrides: Partial<Post>): DisplayPost {
  return forDisplay({
    id: '11111111-1111-4111-8111-111111111111',
    workspace_id: '22222222-2222-4222-8222-222222222222',
    title: 'T',
    body: null,
    status: 'draft',
    channels: toChannelSet(['x']),
    scheduled_at: null,
    origin: 'plan_week',
    created_by: 'user_abc',
    created_at: '2026-07-20T00:00:00.000Z',
    updated_at: '2026-07-20T00:00:00.000Z',
    ...overrides,
  })
}

describe('bucketWeek', () => {
  test('produces 7 day buckets starting today, in the zone', () => {
    const { days } = bucketWeek(IST, [], NOW)

    expect(days).toHaveLength(7)
    expect(days[0]?.key).toBe('2026-07-20')
    expect(days[6]?.key).toBe('2026-07-26')
  })

  test('files a post by its zone day, not its UTC day', () => {
    // 18:31 UTC on the 20th is 00:01 IST on the 21st.
    const p = post({ scheduled_at: '2026-07-20T18:31:00.000Z' })

    const { days } = bucketWeek(IST, [p], NOW)

    expect(days.find((d) => d.key === '2026-07-21')?.posts).toEqual([p])
    expect(days.find((d) => d.key === '2026-07-20')?.posts).toEqual([])
  })

  test('files the audit’s post on 2 September in New York and 3 September in Kolkata', () => {
    // One instant, 2026-09-02T20:00-04:00. The month cell, the mini calendar
    // and the week column all come from this function, so this is the one
    // assertion that keeps them agreeing with the list row.
    const p = post({ scheduled_at: '2026-09-02T20:00:00-04:00' })
    const start = new Date('2026-08-31T12:00:00Z')

    const ny = bucketWeek(NY, [p], start)
    const ist = bucketWeek(IST, [p], start)

    expect(ny.days.find((d) => d.posts.includes(p))?.key).toBe('2026-09-02')
    expect(ist.days.find((d) => d.posts.includes(p))?.key).toBe('2026-09-03')
  })

  test('null and unparseable timestamps land in unscheduled', () => {
    const missing = post({ id: '11111111-1111-4111-8111-111111111112', scheduled_at: null })
    const garbage = post({ id: '11111111-1111-4111-8111-111111111113', scheduled_at: 'soon' })

    const { unscheduled } = bucketWeek(IST, [missing, garbage], NOW)

    expect(unscheduled).toEqual([missing, garbage])
  })

  test('a post outside the window is in no day bucket and is not called unscheduled', () => {
    // It HAS a day; it is simply not one of these. The planner counts such
    // posts against the drawn keys itself (`OffGridNote`), and the list shows
    // them, so nothing here needs to hold them.
    const nextMonth = post({ scheduled_at: '2026-08-15T10:00:00.000Z' })
    const lastWeek = post({
      id: '11111111-1111-4111-8111-111111111114',
      scheduled_at: '2026-07-13T10:00:00.000Z',
    })

    const { days, unscheduled } = bucketWeek(IST, [nextMonth, lastWeek], NOW)

    expect(unscheduled).toEqual([])
    expect(days.every((d) => d.posts.length === 0)).toBe(true)
  })

  test('sorts a day bucket by time ascending', () => {
    const late = post({
      id: '11111111-1111-4111-8111-111111111115',
      scheduled_at: '2026-07-21T12:00:00.000Z',
    })
    const early = post({
      id: '11111111-1111-4111-8111-111111111116',
      scheduled_at: '2026-07-21T06:00:00.000Z',
    })

    const { days } = bucketWeek(IST, [late, early], NOW)

    expect(days.find((d) => d.key === '2026-07-21')?.posts.map((p) => p.id)).toEqual([
      early.id,
      late.id,
    ])
  })

  test('42 New York days across the autumn transition are 42 distinct keys', () => {
    // The month grid is this function with dayCount 42. Stepping by 24 hours
    // used to repeat 1 November.
    const { days } = bucketWeek(NY, [], new Date('2026-10-26T04:00:00Z'), 42)
    expect(new Set(days.map((d) => d.key)).size).toBe(42)
    expect(days.map((d) => d.key)).toContain('2026-11-02')
  })
})
