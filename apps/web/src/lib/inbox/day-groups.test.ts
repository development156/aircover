import { describe, expect, it } from 'vitest'

import { dayKey, dayLabel, groupByDay } from './day-groups'

/**
 * `DEFAULT_ZONE` is `Asia/Kolkata`, UTC+5:30. `2026-08-08T19:00:00.000Z` is
 * already `2026-08-09` in Kolkata — the case that discriminates a zone-aware
 * grouping from `toDateString()`, which would read this as the 8th.
 */
const LATE_UTC_EARLY_IST = '2026-08-08T19:00:00.000Z'
const SAME_IST_DAY_LATER = '2026-08-08T20:30:00.000Z'
const NEXT_IST_DAY = '2026-08-09T10:00:00.000Z'

describe('dayKey', () => {
  it('keys by the Kolkata calendar day, not the UTC one', () => {
    expect(dayKey(LATE_UTC_EARLY_IST)).toBe('2026-08-09')
    expect(dayKey(SAME_IST_DAY_LATER)).toBe('2026-08-09')
  })

  it('returns null for an unreadable timestamp', () => {
    expect(dayKey(undefined)).toBeNull()
    expect(dayKey('not a date')).toBeNull()
  })
})

describe('dayLabel', () => {
  it('renders a short weekday, day and month', () => {
    expect(dayLabel('2026-08-08T10:00:00.000Z')).toBe('Sat, 8 Aug')
  })
})

describe('groupByDay', () => {
  it('separates messages that land on different Kolkata calendar days', () => {
    const groups = groupByDay([
      { id: 'm1', createdAt: LATE_UTC_EARLY_IST },
      { id: 'm2', createdAt: SAME_IST_DAY_LATER },
      { id: 'm3', createdAt: NEXT_IST_DAY },
    ])
    expect(groups.map((g) => g.key)).toEqual(['2026-08-09', '2026-08-10'])
    expect(groups[0]!.items.map((m: { id: string }) => m.id)).toEqual(['m1', 'm2'])
    expect(groups[1]!.items.map((m: { id: string }) => m.id)).toEqual(['m3'])
  })

  it('gives an unreadable-timestamp message its own group, keyed null', () => {
    const groups = groupByDay([{ id: 'm1', createdAt: undefined }])
    expect(groups).toEqual([{ key: null, label: null, items: [{ id: 'm1', createdAt: undefined }] }])
  })

  it('returns nothing for an empty list', () => {
    expect(groupByDay([])).toEqual([])
  })
})
