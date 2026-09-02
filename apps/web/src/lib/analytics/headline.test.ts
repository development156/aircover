import { describe, it, expect } from 'vitest'

import {
  changeFor,
  changeSentence,
  absenceSentence,
  MIN_BASELINE_WEEKS,
  type Change,
  type HeadlineAbsence,
} from '@/lib/analytics/headline'

/** No em dash (U+2014) or en dash (U+2013) in any user-facing sentence. */
function hasDash(s: string): boolean {
  return /[–—]/.test(s)
}

describe('changeFor', () => {
  /**
   * THE GATE MUST WIN OVER EVERYTHING. Under MIN_BASELINE_WEEKS, `learning`
   * is returned regardless of what the numbers say — even numbers that would
   * otherwise produce a clean, plausible-looking comparison.
   */
  it('returns learning below MIN_BASELINE_WEEKS regardless of the numbers', () => {
    expect(changeFor(100, 50, MIN_BASELINE_WEEKS - 1)).toEqual({ kind: 'learning' })
    expect(changeFor(0, 0, 0)).toEqual({ kind: 'learning' })
    expect(changeFor(1000000, 1, 1)).toEqual({ kind: 'learning' })
  })

  it('returns no-previous when either side is null, once past the baseline gate', () => {
    expect(changeFor(null, 10, MIN_BASELINE_WEEKS)).toEqual({ kind: 'no-previous' })
    expect(changeFor(10, null, MIN_BASELINE_WEEKS)).toEqual({ kind: 'no-previous' })
    expect(changeFor(null, null, MIN_BASELINE_WEEKS)).toEqual({ kind: 'no-previous' })
  })

  it('returns from-none when previous is 0 and current is greater than 0', () => {
    expect(changeFor(5, 0, MIN_BASELINE_WEEKS)).toEqual({ kind: 'from-none' })
  })

  it('returns level-none when both are 0', () => {
    expect(changeFor(0, 0, MIN_BASELINE_WEEKS)).toEqual({ kind: 'level-none' })
  })

  it('returns compared with the right direction and a rounded whole percent', () => {
    const up = changeFor(150, 100, MIN_BASELINE_WEEKS)
    expect(up).toEqual({ kind: 'compared', direction: 'up', percent: 50, previous: 100 })

    const down = changeFor(50, 100, MIN_BASELINE_WEEKS)
    expect(down).toEqual({ kind: 'compared', direction: 'down', percent: 50, previous: 100 })

    const level = changeFor(105, 100, MIN_BASELINE_WEEKS)
    expect(level.kind).toBe('compared')
    if (level.kind !== 'compared') throw new Error('expected compared')
    expect(level.direction).toBe('level')
  })

  it('never returns Infinity or NaN, including for negatives and huge numbers', () => {
    const cases: Array<[number | null, number | null]> = [
      [-100, -50],
      [-100, 50],
      [100, -50],
      [Number.MAX_SAFE_INTEGER, 1],
      [1, Number.MAX_SAFE_INTEGER],
      [0, -5],
    ]
    for (const [current, previous] of cases) {
      const r = changeFor(current, previous, MIN_BASELINE_WEEKS)
      if (r.kind === 'compared') {
        expect(Number.isFinite(r.percent)).toBe(true)
        expect(Number.isNaN(r.percent)).toBe(false)
      }
    }
  })

  /**
   * A negative previous is still "zero or under" by this function's own
   * guard (`previous <= 0`), so it must not fall through to the division and
   * must land on one of the honest zero-previous kinds, never `compared`.
   */
  it('a negative previous never reaches the division branch', () => {
    const r = changeFor(10, -5, MIN_BASELINE_WEEKS)
    expect(['from-none', 'level-none']).toContain(r.kind)
  })
})

describe('changeSentence — every kind is a distinct sentence', () => {
  it('produces a distinct sentence per Change kind, so "not measured" and "measured as none" never collapse', () => {
    const changes: Change[] = [
      { kind: 'learning' },
      { kind: 'no-previous' },
      { kind: 'from-none' },
      { kind: 'level-none' },
      { kind: 'compared', direction: 'up', percent: 10, previous: 100 },
      { kind: 'compared', direction: 'down', percent: 10, previous: 100 },
      { kind: 'compared', direction: 'level', percent: 0, previous: 100 },
    ]
    const sentences = new Set(changes.map((c) => changeSentence(c, 'week')))
    expect(sentences.size).toBe(changes.length)
  })

  it('no changeSentence output contains an em dash or en dash', () => {
    const changes: Change[] = [
      { kind: 'learning' },
      { kind: 'no-previous' },
      { kind: 'from-none' },
      { kind: 'level-none' },
      { kind: 'compared', direction: 'up', percent: 10, previous: 100 },
      { kind: 'compared', direction: 'down', percent: 10, previous: 100 },
      { kind: 'compared', direction: 'level', percent: 0, previous: 100 },
    ]
    for (const c of changes) {
      expect(hasDash(changeSentence(c, 'week'))).toBe(false)
    }
  })
})

describe('absenceSentence — every kind of nothing is a distinct sentence', () => {
  const absences: HeadlineAbsence[] = ['not-measured', 'not-connected', 'unreadable', 'waiting']

  it('produces a distinct sentence per absence, across all four', () => {
    const sentences = new Set(absences.map((a) => absenceSentence(a)))
    expect(sentences.size).toBe(4)
  })

  it('no absenceSentence output contains an em dash or en dash', () => {
    for (const a of absences) {
      expect(hasDash(absenceSentence(a))).toBe(false)
    }
  })
})
