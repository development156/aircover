import { describe, expect, it } from 'vitest'

import {
  OBSERVATION_BASIS,
  OBSERVATION_KINDS,
  basisOf,
  marketingObservationSchema,
  type MarketingObservation,
} from './observations'

/**
 * THE RECEIPT RULE.
 *
 * `postIds` was `.min(1)` on every row until `audience_growth` existed, which
 * was correct while every kind counted something inside posts. The rule is now
 * conditional on what the kind measured, and these tests exist because a
 * conditional rule can fail in two directions where a flat one could only fail
 * in one — and the second direction is the one that matters. A follower claim
 * citing posts is not a missing receipt, it is a BORROWED one, and it would put
 * a causal claim on the page that nothing ever measured.
 *
 * WHAT THESE CANNOT SEE: whether each computer passes the right thing. That is
 * pinned in each computer's own test file.
 */

const UUID = '00000000-0000-4000-8000-000000000001'

function row(overrides: Partial<MarketingObservation> = {}): unknown {
  return {
    kind: 'tone_drift',
    subject: 'exclamation_marks',
    claim: 'You have stopped using exclamation marks.',
    evidence: {
      data: [
        { label: 'Earlier', value: 3, unit: 'per_post' },
        { label: 'Since', value: 0, unit: 'per_post' },
      ],
      postIds: [UUID],
      windowDays: 30,
    },
    computedOn: '2026-03-08',
    ...overrides,
  }
}

describe('the receipt rule', () => {
  it('accepts a posts-basis row that names its posts', () => {
    expect(marketingObservationSchema.safeParse(row()).success).toBe(true)
  })

  it('refuses a posts-basis row with no posts behind it', () => {
    const parsed = marketingObservationSchema.safeParse(
      row({
        evidence: {
          data: [
            { label: 'Earlier', value: 3, unit: 'per_post' },
            { label: 'Since', value: 0, unit: 'per_post' },
          ],
          postIds: [],
          windowDays: 30,
        },
      }),
    )
    expect(parsed.success).toBe(false)
    expect(JSON.stringify(parsed)).toContain('must name at least one')
  })

  it('accepts an audience-basis row that cites no posts', () => {
    const parsed = marketingObservationSchema.safeParse(
      row({
        kind: 'audience_growth',
        subject: 'instagram',
        claim:
          'Your Instagram audience is growing: 40 more followers than 30 days ago, 100 to 140.',
        evidence: {
          data: [
            { label: 'Followers 30 days ago', value: 100, unit: 'count' },
            { label: 'Followers now', value: 140, unit: 'count' },
          ],
          postIds: [],
          windowDays: 30,
        },
      }),
    )
    expect(parsed.success).toBe(true)
  })

  it('REFUSES an audience-basis row that borrows a post as its receipt', () => {
    const parsed = marketingObservationSchema.safeParse(
      row({
        kind: 'audience_growth',
        subject: 'instagram',
        claim:
          'Your Instagram audience is growing: 40 more followers than 30 days ago, 100 to 140.',
        evidence: {
          data: [
            { label: 'Followers 30 days ago', value: 100, unit: 'count' },
            { label: 'Followers now', value: 140, unit: 'count' },
          ],
          postIds: [UUID],
          windowDays: 30,
        },
      }),
    )
    expect(parsed.success).toBe(false)
    expect(JSON.stringify(parsed)).toContain('would imply')
  })

  it('makes every kind declare what it measured, so a new one cannot forget', () => {
    for (const kind of OBSERVATION_KINDS) {
      expect(OBSERVATION_BASIS[kind]).toBeDefined()
      expect(['posts', 'audience']).toContain(basisOf(kind))
    }
    expect(Object.keys(OBSERVATION_BASIS)).toHaveLength(OBSERVATION_KINDS.length)
  })

  it('still requires two data points, whatever the basis', () => {
    const parsed = marketingObservationSchema.safeParse(
      row({
        kind: 'audience_growth',
        subject: 'instagram',
        evidence: {
          data: [{ label: 'Followers now', value: 140, unit: 'count' }],
          postIds: [],
          windowDays: 30,
        },
      }),
    )
    expect(parsed.success).toBe(false)
  })
})
