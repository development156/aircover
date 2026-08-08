import { describe, it, expect } from 'vitest'

import { seriesFrom } from '@/lib/analytics/account-insights'

/**
 * Zernio hands follower history back as `Record<string, unknown>`, so every point is
 * untyped until this function narrows it. The rule under test is the same one the
 * post half enforces: an unreadable point is DROPPED, never coerced to 0. A zero on
 * a follower chart is a cliff, and a fabricated cliff is worse than a short line.
 */
describe('follower series narrowing', () => {
  it('reads an array of points', () => {
    expect(
      seriesFrom(
        {
          follower_count: [
            { date: '2026-08-01', value: 1200 },
            { date: '2026-08-02', value: 1214 },
          ],
        },
        'follower_count',
      ),
    ).toEqual([
      { date: '2026-08-01', value: 1200 },
      { date: '2026-08-02', value: 1214 },
    ])
  })

  it('reads a date→value object, oldest first', () => {
    expect(seriesFrom({ f: { '2026-08-02': 1214, '2026-08-01': 1200 } }, 'f')).toEqual([
      { date: '2026-08-01', value: 1200 },
      { date: '2026-08-02', value: 1214 },
    ])
  })

  it('DROPS a point whose value is not a number instead of calling it 0', () => {
    const points = seriesFrom(
      {
        f: [
          { date: '2026-08-01', value: 1200 },
          { date: '2026-08-02', value: null },
          { date: '2026-08-03', value: 'n/a' },
          { date: '2026-08-04' },
        ],
      },
      'f',
    )
    expect(points).toEqual([{ date: '2026-08-01', value: 1200 }])
  })

  it('keeps a genuine zero, which is a measurement', () => {
    expect(seriesFrom({ f: [{ date: '2026-08-01', value: 0 }] }, 'f')).toEqual([
      { date: '2026-08-01', value: 0 },
    ])
  })

  it('drops non-finite numbers rather than plotting them', () => {
    expect(
      seriesFrom({ f: [{ date: '2026-08-01', value: Number.NaN }] }, 'f'),
    ).toEqual([])
  })

  it('accepts the alternate field names Zernio uses', () => {
    expect(seriesFrom({ f: [{ end_time: '2026-08-01', count: 42 }] }, 'f')).toEqual([
      { date: '2026-08-01', value: 42 },
    ])
  })

  it.each([
    ['a missing key', {}],
    ['a string', { f: 'nope' }],
    ['a number', { f: 7 }],
    ['null', { f: null }],
  ])('returns an empty series for %s', (_name, metrics) => {
    expect(seriesFrom(metrics as Record<string, unknown>, 'f')).toEqual([])
  })
})
