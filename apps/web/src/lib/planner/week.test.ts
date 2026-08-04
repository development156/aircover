import { describe, expect, test } from 'vitest'
import type { Post } from '@sahoda/shared'

import { bucketWeek } from './week'

/**
 * Buckets are keyed by IST calendar day — the same zone the UI renders and
 * labels (`post-card.tsx` says "IST" out loud). A UTC-keyed bucket would file
 * an 00:01 IST post under yesterday's column.
 */

const NOW = new Date('2026-07-20T06:00:00.000Z') // 11:30 IST, Mon 20 Jul

function post(overrides: Partial<Post>): Post {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    workspace_id: '22222222-2222-4222-8222-222222222222',
    title: 'T',
    body: null,
    status: 'draft',
    channels: ['x'],
    scheduled_at: null,
    origin: 'plan_week',
    created_by: 'user_abc',
    created_at: '2026-07-20T00:00:00.000Z',
    updated_at: '2026-07-20T00:00:00.000Z',
    ...overrides,
  }
}

describe('bucketWeek', () => {
  test('produces 7 day buckets starting today (IST)', () => {
    const { days } = bucketWeek([], NOW)

    expect(days).toHaveLength(7)
    expect(days[0]?.key).toBe('2026-07-20')
    expect(days[6]?.key).toBe('2026-07-26')
  })

  test('files a post by its IST day, not its UTC day', () => {
    // 18:31 UTC on the 20th is 00:01 IST on the 21st.
    const p = post({ scheduled_at: '2026-07-20T18:31:00.000Z' })

    const { days } = bucketWeek([p], NOW)

    expect(days.find((d) => d.key === '2026-07-21')?.posts).toEqual([p])
    expect(days.find((d) => d.key === '2026-07-20')?.posts).toEqual([])
  })

  test('null and unparseable timestamps land in unscheduled', () => {
    const missing = post({ id: '11111111-1111-4111-8111-111111111112', scheduled_at: null })
    const garbage = post({ id: '11111111-1111-4111-8111-111111111113', scheduled_at: 'soon' })

    const { unscheduled } = bucketWeek([missing, garbage], NOW)

    expect(unscheduled).toEqual([missing, garbage])
  })

  test('posts outside the 7-day window go to `outside`, never silently dropped', () => {
    const nextMonth = post({ scheduled_at: '2026-08-15T10:00:00.000Z' })
    const lastWeek = post({
      id: '11111111-1111-4111-8111-111111111114',
      scheduled_at: '2026-07-13T10:00:00.000Z',
    })

    const { days, outside, unscheduled } = bucketWeek([nextMonth, lastWeek], NOW)

    expect(outside).toEqual(expect.arrayContaining([nextMonth, lastWeek]))
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

    const { days } = bucketWeek([late, early], NOW)

    expect(days.find((d) => d.key === '2026-07-21')?.posts.map((p) => p.id)).toEqual([
      early.id,
      late.id,
    ])
  })
})
