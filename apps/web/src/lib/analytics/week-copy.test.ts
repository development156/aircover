import { describe, it, expect } from 'vitest'

import { weekLabel, verdictCopy, normalCopy, rankingCaption, nothingChangedCopy } from './week-copy'
import type { GroupComparison, GroupLift, NoLearningReason } from './grouped-lift'
import type { Normal, NoNormalReason } from './like-age'

const DASH = /[—–]/

const ALL_NO_LEARNING_REASONS: NoLearningReason[] = [
  'no_history',
  'too_few_posts',
  'single_group',
  'too_few_days',
  'numbers_too_small',
  'difference_too_small',
]

function lift(overrides: Partial<GroupLift> = {}): GroupLift {
  return {
    metric: 'reach',
    leader: 'Tuesday',
    runnerUp: 'Friday',
    leaderMean: 400,
    runnerUpMean: 200,
    lift: 2,
    postIds: ['a', 'b', 'c', 'd', 'e', 'f'],
    sampleSize: 6,
    windowDays: 40,
    leaderPosts: 3,
    runnerUpPosts: 3,
    ...overrides,
  }
}

describe('weekLabel', () => {
  it('renders a same-month range with no en dash or em dash', () => {
    const label = weekLabel('2026-08-03', '2026-08-09')
    expect(label).not.toMatch(DASH)
    expect(label).toContain('3')
    expect(label).toContain('9')
    expect(label).toContain('August')
  })

  it('renders a cross-month range with no en dash or em dash', () => {
    const label = weekLabel('2026-07-29', '2026-08-04')
    expect(label).not.toMatch(DASH)
    expect(label).toContain('July')
    expect(label).toContain('August')
  })
})

describe('verdictCopy — a real lift', () => {
  it('sets found true and the detail mentions both arms’ post counts', () => {
    const comparison: GroupComparison = {
      kind: 'lift',
      lift: lift({ leaderPosts: 5, runnerUpPosts: 4 }),
    }
    const result = verdictCopy({ basis: 'weekday', comparison }, ['instagram'])
    expect(result.found).toBe(true)
    expect(result.detail).toContain('5')
    expect(result.detail).toContain('4')
  })
})

describe('verdictCopy — the six no-lift reasons', () => {
  it('produces six DISTINCT headlines — six different facts, not one apology', () => {
    const headlines = ALL_NO_LEARNING_REASONS.map((reason) => {
      const comparison: GroupComparison = { kind: 'none', reason }
      return verdictCopy({ basis: 'weekday', comparison }, ['instagram']).headline
    })
    expect(new Set(headlines).size).toBe(6)
  })

  it('difference_too_small must not read as a failure', () => {
    const comparison: GroupComparison = { kind: 'none', reason: 'difference_too_small' }
    const result = verdictCopy({ basis: 'weekday', comparison }, ['instagram'])
    expect(result.found).toBe(false)
    expect(result.headline).not.toMatch(/not enough|no data|cannot|could not/i)
  })
})

describe('normalCopy — compared', () => {
  const compared: Normal = {
    kind: 'compared',
    direction: 'up',
    movePercent: 34,
    weekValue: 340,
    normalValue: 253,
    basedOnPosts: 8,
    ageDays: 7,
  }

  it('always states the age and the number of prior posts', () => {
    const result = normalCopy('instagram', compared)
    expect(result.detail).toContain('7')
    expect(result.detail).toContain('8')
  })

  it('returns direction "level" and does not claim up or down when kind is level', () => {
    const level: Normal = { ...compared, direction: 'level', movePercent: 3 }
    const result = normalCopy('instagram', level)
    expect(result.direction).toBe('level')
    expect(result.headline).not.toMatch(/\bup\b|\bdown\b/i)
  })
})

describe('normalCopy — the four no-normal reasons', () => {
  const ALL: NoNormalReason[] = [
    'no-history',
    'too-few-prior-posts',
    'week-too-young',
    'numbers-too-small',
  ]

  it('produces a distinct headline for each reason', () => {
    const headlines = ALL.map(
      (reason) => normalCopy('instagram', { kind: 'none', reason }).headline,
    )
    expect(new Set(headlines).size).toBe(4)
  })

  it('every no-normal case reports direction null', () => {
    for (const reason of ALL) {
      expect(normalCopy('instagram', { kind: 'none', reason }).direction).toBeNull()
    }
  })
})

describe('nothingChangedCopy', () => {
  it('returns null for an unrecognised reason — never invent a sentence for a value nothing stored', () => {
    expect(nothingChangedCopy('some-future-reason-this-build-does-not-know')).toBeNull()
    expect(nothingChangedCopy(null)).toBeNull()
  })

  it('returns a sentence for each reason this build does recognise', () => {
    const reasons = [
      'no_history',
      'too_few_posts',
      'single_group',
      'too_few_days',
      'numbers_too_small',
      'difference_too_small',
    ]
    for (const reason of reasons) {
      expect(nothingChangedCopy(reason)).not.toBeNull()
    }
  })
})

describe('no string returned by this module carries an en dash or em dash in prose', () => {
  it('across weekLabel, verdictCopy, normalCopy, rankingCaption and nothingChangedCopy', () => {
    const strings: string[] = [
      weekLabel('2026-08-03', '2026-08-09'),
      weekLabel('2026-07-29', '2026-08-04'),
    ]

    for (const reason of ALL_NO_LEARNING_REASONS) {
      const comparison: GroupComparison = { kind: 'none', reason }
      const r = verdictCopy({ basis: 'weekday', comparison }, ['instagram'])
      strings.push(r.headline, r.detail)
    }
    const liftResult = verdictCopy(
      { basis: 'weekday', comparison: { kind: 'lift', lift: lift() } },
      ['instagram'],
    )
    strings.push(liftResult.headline, liftResult.detail)

    const normalReasons: NoNormalReason[] = [
      'no-history',
      'too-few-prior-posts',
      'week-too-young',
      'numbers-too-small',
    ]
    for (const reason of normalReasons) {
      const r = normalCopy('instagram', { kind: 'none', reason })
      strings.push(r.headline, r.detail)
    }
    const comparedResult = normalCopy('instagram', {
      kind: 'compared',
      direction: 'up',
      movePercent: 34,
      weekValue: 340,
      normalValue: 253,
      basedOnPosts: 8,
      ageDays: 7,
    })
    strings.push(comparedResult.headline, comparedResult.detail)

    strings.push(
      rankingCaption({
        top: { postId: 'a', title: 'A', channel: 'instagram', value: 10 },
        bottom: { postId: 'b', title: 'B', channel: 'instagram', value: 5 },
        ageDays: 7,
        of: 2,
      }),
    )

    for (const reason of [
      'no_history',
      'too_few_posts',
      'single_group',
      'too_few_days',
      'numbers_too_small',
      'difference_too_small',
    ]) {
      const s = nothingChangedCopy(reason)
      if (s !== null) strings.push(s)
    }

    for (const s of strings) {
      expect(s).not.toMatch(DASH)
    }
  })
})
