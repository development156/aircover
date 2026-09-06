import { describe, expect, test } from 'vitest'

import { attemptDay, scanOutcomeFor, toScanAttempts } from './attempts-map'

describe('scanOutcomeFor', () => {
  test('read outcomes are observed, a failed check is unreachable, the rest are not attempted', () => {
    expect(scanOutcomeFor('changed')).toBe('observed')
    expect(scanOutcomeFor('unchanged')).toBe('observed')
    expect(scanOutcomeFor('could_not_check')).toBe('unreachable')
    expect(scanOutcomeFor('pending')).toBe('not_attempted')
    expect(scanOutcomeFor('something_new')).toBe('not_attempted')
  })
})

describe('attemptDay', () => {
  test('buckets by the workspace clock, not UTC', () => {
    // 22:30 UTC on the 6th is already the 7th in Kolkata.
    expect(attemptDay('2026-09-06T22:30:00Z', 'Asia/Kolkata')).toBe('2026-09-07')
    expect(attemptDay('2026-09-06T22:30:00Z', null)).toBe('2026-09-06')
  })

  test('an unknown zone falls back to UTC instead of throwing', () => {
    expect(attemptDay('2026-09-06T22:30:00Z', 'Mars/Olympus')).toBe('2026-09-06')
  })
})

describe('toScanAttempts', () => {
  test('one attempt per competitor per day, and a failed source outranks a read one', () => {
    const attempts = toScanAttempts(
      [
        { competitorId: 'c1', outcome: 'unchanged', why: null, fetchedAt: '2026-09-06T03:40:00Z' },
        {
          competitorId: 'c1',
          outcome: 'could_not_check',
          why: 'thin: needs javascript',
          fetchedAt: '2026-09-06T03:41:00Z',
        },
        { competitorId: 'c1', outcome: 'changed', why: null, fetchedAt: '2026-09-05T03:40:00Z' },
      ],
      'UTC',
    )
    expect(attempts).toEqual([
      {
        competitorId: 'c1',
        attemptedOn: '2026-09-06',
        outcome: 'unreachable',
        note: 'thin: needs javascript',
      },
      { competitorId: 'c1', attemptedOn: '2026-09-05', outcome: 'observed', note: null },
    ])
  })

  test('a read that succeeded carries no note even when the row has one', () => {
    const [only] = toScanAttempts(
      [{ competitorId: 'c1', outcome: 'unchanged', why: '304', fetchedAt: '2026-09-06T03:40:00Z' }],
      null,
    )
    expect(only?.note).toBeNull()
  })
})
