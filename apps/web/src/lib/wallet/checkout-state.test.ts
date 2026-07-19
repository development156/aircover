import { describe, expect, test } from 'vitest'

import { currentBillingPeriod } from './checkout-state'

describe('currentBillingPeriod', () => {
  test('formats as YYYY-MM with a zero-padded month', () => {
    expect(currentBillingPeriod(new Date('2026-07-19T12:00:00Z'))).toBe('2026-07')
    expect(currentBillingPeriod(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01')
  })

  test('uses UTC so one instant never yields two periods across server zones', () => {
    // 23:30 on Jan 31 UTC is already Feb 1 in IST (+05:30). Reading local parts
    // would key the monthly grant differently depending on where this runs.
    expect(currentBillingPeriod(new Date('2026-01-31T23:30:00Z'))).toBe('2026-01')
  })

  test('rolls to the next year at the December boundary', () => {
    expect(currentBillingPeriod(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12')
    expect(currentBillingPeriod(new Date('2027-01-01T00:00:00Z'))).toBe('2027-01')
  })

  test('rejects an invalid date rather than emitting a NaN period', () => {
    // 'NaN-NaN' would silently key a grant to a nonexistent period.
    expect(() => currentBillingPeriod(new Date('not a date'))).toThrow(RangeError)
  })
})
