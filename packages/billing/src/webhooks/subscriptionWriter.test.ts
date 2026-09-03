import { describe, expect, it } from 'vitest'
import { periodBounds } from './subscriptionWriter'

describe('periodBounds', () => {
  it('bounds a period from the first instant of its month to the first of the next, in UTC', () => {
    const { start, end } = periodBounds('2026-07')
    expect(start.toISOString()).toBe('2026-07-01T00:00:00.000Z')
    expect(end.toISOString()).toBe('2026-08-01T00:00:00.000Z')
  })

  it('rolls December into the next year', () => {
    const { start, end } = periodBounds('2026-12')
    expect(start.toISOString()).toBe('2026-12-01T00:00:00.000Z')
    expect(end.toISOString()).toBe('2027-01-01T00:00:00.000Z')
  })
})
