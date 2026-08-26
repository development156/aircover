import { describe, expect, it } from 'vitest'

import { marketingObservationSchema } from '@sahoda/shared'

import {
  channelReturn,
  engagementRate,
  CHANNEL_RETURN_SUBJECT,
  MIN_POSTS_PER_CHANNEL,
  type ChannelOutcome,
} from './channel-return'

/**
 * WHAT THESE TESTS CANNOT SEE.
 *
 * They pass `ChannelOutcome[]` straight in, so nothing here proves the store
 * reads the LATEST snapshot per post rather than summing eight days of
 * re-reported totals. That is the single most consequential decision in this
 * feature and it lives in `store.ts` SQL, which these tests do not execute.
 * `readChannelOutcomes` needs a PGlite test before this measurement is trusted
 * against real data.
 *
 * They also say nothing about whether `engagement` and `reach` mean the same
 * thing on Instagram as on LinkedIn. The arithmetic is sound; the comparability
 * of the two platforms' definitions is an assumption this file inherits.
 */

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

/** `days` apart so a caller can push the window over or under the floor. */
function outcomes(
  channel: string,
  count: number,
  engagement: number,
  reach: number,
  spanDays = 30,
  offset = 0,
): ChannelOutcome[] {
  return Array.from({ length: count }, (_, i) => ({
    postId: UUID(offset + i),
    channel,
    engagement,
    reach,
    measuredOn: new Date(Date.UTC(2026, 0, 1 + Math.round((i * spanDays) / Math.max(count - 1, 1))))
      .toISOString()
      .slice(0, 10),
  }))
}

describe('engagementRate', () => {
  it('is engagement over the people reached', () => {
    expect(engagementRate({ engagement: 5, reach: 100 })).toBe(0.05)
  })

  it('is zero when nobody was reached, rather than a division by zero', () => {
    const rate = engagementRate({ engagement: 5, reach: 0 })
    expect(Number.isFinite(rate)).toBe(true)
    expect(rate).toBe(0)
  })
})

describe('channelReturn', () => {
  it('names the channel that earns more per reader, and both figures', () => {
    const result = channelReturn(
      [...outcomes('linkedin', 5, 20, 100), ...outcomes('instagram', 5, 2, 100, 30, 50)],
      '2026-02-01',
    )
    expect(result.observation?.claim).toBe(
      'Your Linkedin posts earn more attention per reader than your Instagram: ' +
        '20% against 2%, across 10 posts.',
    )
  })

  it('emits a row the stored contract accepts', () => {
    const result = channelReturn(
      [...outcomes('linkedin', 5, 20, 100), ...outcomes('instagram', 5, 2, 100, 30, 50)],
      '2026-02-01',
    )
    expect(marketingObservationSchema.safeParse(result.observation).success).toBe(true)
    expect(result.observation?.kind).toBe('channel_return')
    expect(result.observation?.subject).toBe(CHANNEL_RETURN_SUBJECT)
  })

  it('carries every post it counted, so the claim has a receipt', () => {
    const result = channelReturn(
      [...outcomes('linkedin', 5, 20, 100), ...outcomes('instagram', 5, 2, 100, 30, 50)],
      '2026-02-01',
    )
    expect(result.observation?.evidence.postIds).toHaveLength(10)
  })

  it('declines when nothing has been measured', () => {
    expect(channelReturn([], '2026-02-01').reason).toBe('no_metrics')
  })

  it('declines when every post reached nobody, rather than calling it zero engagement', () => {
    const blind = [...outcomes('linkedin', 5, 20, 0), ...outcomes('instagram', 5, 2, 0, 30, 50)]
    expect(channelReturn(blind, '2026-02-01').reason).toBe('no_metrics')
  })

  it('declines when the measurements are packed into too short a stretch', () => {
    const short = [
      ...outcomes('linkedin', 5, 20, 100, 3),
      ...outcomes('instagram', 5, 2, 100, 3, 50),
    ]
    expect(channelReturn(short, '2026-02-01').reason).toBe('window_too_short')
  })

  it('declines when only one channel has enough posts, and accepts it one post later', () => {
    const thin = [
      ...outcomes('linkedin', 5, 20, 100),
      ...outcomes('instagram', MIN_POSTS_PER_CHANNEL - 1, 2, 100, 30, 50),
    ]
    expect(channelReturn(thin, '2026-02-01').reason).toBe('too_few_posts')

    const enough = [
      ...outcomes('linkedin', 5, 20, 100),
      ...outcomes('instagram', MIN_POSTS_PER_CHANNEL, 2, 100, 30, 50),
    ]
    expect(channelReturn(enough, '2026-02-01').observation).not.toBeNull()
  })

  it('declines to crown a winner when nothing is earning anything anywhere', () => {
    const flat = [...outcomes('linkedin', 5, 1, 100), ...outcomes('instagram', 5, 0, 100, 30, 50)]
    expect(channelReturn(flat, '2026-02-01').reason).toBe('no_engagement')
  })

  it('declines when the two channels are close enough that the gap is noise', () => {
    const close = [
      ...outcomes('linkedin', 5, 12, 100),
      ...outcomes('instagram', 5, 10, 100, 30, 50),
    ]
    expect(channelReturn(close, '2026-02-01').reason).toBe('too_close_to_call')
  })

  it('still speaks when the losing channel earns exactly nothing', () => {
    const shutout = [
      ...outcomes('linkedin', 5, 20, 100),
      ...outcomes('instagram', 5, 0, 100, 30, 50),
    ]
    const result = channelReturn(shutout, '2026-02-01')
    expect(result.observation).not.toBeNull()
    expect(result.observation?.claim).toContain('0%')
  })

  it('never lets one post measured many times clear a floor meant to need five', () => {
    const repeats: ChannelOutcome[] = Array.from({ length: 8 }, (_, i) => ({
      postId: UUID(1),
      channel: 'linkedin',
      engagement: 20,
      reach: 100,
      measuredOn: `2026-01-${String(i + 1).padStart(2, '0')}`,
    }))
    const result = channelReturn(
      [...repeats, ...outcomes('instagram', 5, 2, 100, 30, 50)],
      '2026-02-01',
    )
    expect(result.reason).toBe('too_few_posts')
  })

  it('spans the window end to end, not the gap between two channels', () => {
    const result = channelReturn(
      [...outcomes('linkedin', 5, 20, 100), ...outcomes('instagram', 5, 2, 100, 30, 50)],
      '2026-02-01',
    )
    expect(result.observation?.evidence.windowDays).toBe(31)
  })
})
