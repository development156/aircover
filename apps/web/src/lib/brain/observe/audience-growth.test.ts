import { describe, expect, it } from 'vitest'

import { marketingObservationSchema } from '@sahoda/shared'

import { audienceGrowth, MIN_AUDIENCE, type AudienceReading } from './audience-growth'

/**
 * WHAT THESE TESTS CANNOT SEE.
 *
 * They pass readings straight in, so nothing here proves the store reads the
 * `total` bucket rather than `gained`/`lost`. That choice is the whole reason
 * this computer works against real data — MEASURED, both other buckets are zero
 * on every production row — and it lives in `store.ts` SQL, which these do not
 * execute.
 *
 * They also cannot see whether a platform's follower count is comparable with
 * itself over time. A platform that re-bases its own definition would look
 * exactly like growth here.
 */

/** One account's daily series, ending `days` after it starts. */
function series(
  accountId: string,
  from: number,
  to: number,
  days: number,
  channel = 'instagram',
): AudienceReading[] {
  return [
    { accountId, channel, measuredOn: '2026-02-01', total: from },
    {
      accountId,
      channel,
      measuredOn: new Date(Date.UTC(2026, 1, 1 + days - 1)).toISOString().slice(0, 10),
      total: to,
    },
  ]
}

describe('audienceGrowth', () => {
  it('says plainly that the audience grew, and by how much', () => {
    const result = audienceGrowth(series('a', 100, 140, 30), 'instagram', '2026-03-08')
    expect(result.observation?.claim).toBe(
      'Your Instagram audience is growing: 40 more followers than 30 days ago, 100 to 140.',
    )
  })

  it('says a fall as plainly as a rise, rather than going quiet', () => {
    const result = audienceGrowth(series('a', 140, 100, 30), 'instagram', '2026-03-08')
    expect(result.observation?.claim).toContain('shrinking')
    expect(result.observation?.claim).toContain('40 fewer followers')
  })

  it('emits a row the stored contract accepts', () => {
    const result = audienceGrowth(series('a', 100, 140, 30), 'instagram', '2026-03-08')
    expect(marketingObservationSchema.safeParse(result.observation).success).toBe(true)
    expect(result.observation?.kind).toBe('audience_growth')
  })

  it('cites no posts, because followers are not posts', () => {
    const result = audienceGrowth(series('a', 100, 140, 30), 'instagram', '2026-03-08')
    expect(result.observation?.evidence.postIds).toEqual([])
  })

  it('files itself under the channel, so two platforms cannot collide', () => {
    const result = audienceGrowth(series('a', 100, 140, 30, 'linkedin'), 'linkedin', '2026-03-08')
    expect(result.observation?.subject).toBe('linkedin')
  })

  it('declines when there is no follower reading at all', () => {
    expect(audienceGrowth([], 'instagram', '2026-03-08').reason).toBe('no_audience_data')
  })

  it('declines when the readings are packed into too short a stretch', () => {
    expect(audienceGrowth(series('a', 100, 140, 5), 'instagram', '2026-03-08').reason).toBe(
      'window_too_short',
    )
  })

  it('declines when no account has two readings to compare', () => {
    const single: AudienceReading[] = [
      { accountId: 'a', channel: 'instagram', measuredOn: '2026-02-01', total: 100 },
      { accountId: 'b', channel: 'instagram', measuredOn: '2026-03-05', total: 200 },
    ]
    expect(audienceGrowth(single, 'instagram', '2026-03-08').reason).toBe('too_few_readings')
  })

  it('refuses to call one follower becoming two a hundred percent of growth', () => {
    const tiny = series('a', 1, 2, 30)
    expect(audienceGrowth(tiny, 'instagram', '2026-03-08').reason).toBe('audience_too_small')

    const enough = series('a', MIN_AUDIENCE, MIN_AUDIENCE * 2, 30)
    expect(audienceGrowth(enough, 'instagram', '2026-03-08').observation).not.toBeNull()
  })

  it('declines when the audience moved by less than ordinary churn', () => {
    expect(audienceGrowth(series('a', 100, 102, 30), 'instagram', '2026-03-08').reason).toBe(
      'change_too_small',
    )
  })

  it('adds each account to itself rather than summing totals per day', () => {
    // Two accounts whose series do not overlap in time. Summed by day, the
    // second account appearing would read as a jump; per account, the truth is
    // that both grew by 20.
    const both = [...series('a', 100, 120, 30), ...series('b', 200, 220, 30)]
    const result = audienceGrowth(both, 'instagram', '2026-03-08')
    expect(result.observation?.claim).toContain('300 to 340')
  })

  it('never counts an account that reported only once', () => {
    const mixed = [
      ...series('a', 100, 140, 30),
      { accountId: 'ghost', channel: 'instagram', measuredOn: '2026-02-15', total: 9999 },
    ]
    const result = audienceGrowth(mixed, 'instagram', '2026-03-08')
    expect(result.observation?.claim).toContain('100 to 140')
  })
})
