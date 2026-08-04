import { describe, expect, it } from 'vitest'
import { currentPeriod, isPeriod, parsePeriod, PeriodSchema } from './period'

/**
 * `period` is the sole replay anchor inside monthlyGrantKey (`grant:${plan}:${period}:${ws}`).
 * Two spellings of the same month produce two different keys — i.e. a double-grant. These
 * tests pin the format so that can never happen.
 */
describe('PeriodSchema — the billing period format contract', () => {
  it('accepts a zero-padded YYYY-MM', () => {
    expect(PeriodSchema.parse('2026-07')).toBe('2026-07')
  })

  it('accepts both boundary months', () => {
    expect(PeriodSchema.parse('2026-01')).toBe('2026-01')
    expect(PeriodSchema.parse('2026-12')).toBe('2026-12')
  })

  // The exact vector this contract exists to close: '2026-7' and '2026-07' are the same
  // month but would key two separate grants.
  it('rejects an unpadded month', () => {
    expect(() => PeriodSchema.parse('2026-7')).toThrow()
  })

  it.each([
    ['month 00', '2026-00'],
    ['month 13', '2026-13'],
    ['a full date', '2026-07-01'],
    ['a two-digit year', '26-07'],
    ['an empty string', ''],
    ['whitespace padding', ' 2026-07'],
    ['a trailing newline', '2026-07\n'],
    ['a slash separator', '2026/07'],
    ['nothing at all', 'not-a-period'],
  ])('rejects %s', (_label, bad) => {
    expect(() => PeriodSchema.parse(bad)).toThrow()
  })

  it('rejects non-strings', () => {
    expect(() => PeriodSchema.parse(202607)).toThrow()
    expect(() => PeriodSchema.parse(null)).toThrow()
  })
})

describe('parsePeriod', () => {
  it('returns the period when valid', () => {
    expect(parsePeriod('2026-07')).toBe('2026-07')
  })

  it('throws on an invalid period', () => {
    expect(() => parsePeriod('2026-7')).toThrow()
  })
})

describe('isPeriod', () => {
  it('narrows a valid period', () => {
    expect(isPeriod('2026-07')).toBe(true)
  })

  it('rejects an invalid period without throwing', () => {
    expect(isPeriod('2026-7')).toBe(false)
    expect(isPeriod(undefined)).toBe(false)
  })
})

describe('currentPeriod', () => {
  it('formats a mid-year date', () => {
    expect(currentPeriod(new Date('2026-07-19T12:00:00Z'))).toBe('2026-07')
  })

  it('zero-pads single-digit months', () => {
    expect(currentPeriod(new Date('2026-01-05T00:00:00Z'))).toBe('2026-01')
    expect(currentPeriod(new Date('2026-09-30T23:59:59Z'))).toBe('2026-09')
  })

  /**
   * UTC, not local time. A server in IST (+05:30) reading local time on the 1st at 02:00
   * would still be in the PREVIOUS month locally — minting a second grant key for a month
   * that was already granted. The ledger would treat it as a new period and grant twice.
   */
  it('derives from UTC so a +05:30 server cannot roll the period early', () => {
    // 2026-07-31T20:00:00Z is 2026-08-01 01:30 IST — UTC must still say July.
    expect(currentPeriod(new Date('2026-07-31T20:00:00Z'))).toBe('2026-07')
  })

  it('derives from UTC at the far edge of a month boundary', () => {
    expect(currentPeriod(new Date('2026-08-01T00:00:00Z'))).toBe('2026-08')
    expect(currentPeriod(new Date('2026-07-31T23:59:59Z'))).toBe('2026-07')
  })

  it('always produces a value its own schema accepts', () => {
    for (const month of [0, 5, 11]) {
      const d = new Date(Date.UTC(2026, month, 15))
      expect(() => PeriodSchema.parse(currentPeriod(d))).not.toThrow()
    }
  })
})
