import { describe, it, expect } from 'vitest'

import {
  daysBetween,
  valueAtAge,
  median,
  normalFor,
  COMPARE_AGE_DAYS,
  MIN_BASELINE_POSTS,
  MIN_BASELINE_VALUE,
  MIN_MOVE,
  type AgedPost,
} from './like-age'

/** Add `n` whole days to a `YYYY-MM-DD` string, staying inside the same format. */
function addDays(date: string, n: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`) + n * 86_400_000
  return new Date(ms).toISOString().slice(0, 10)
}

/** One post, published on `publishedOn`, with a reading at every age in `readingsAtAges`. */
function post(
  id: string,
  publishedOn: string,
  readingsAtAges: ReadonlyArray<{ age: number; value: number }>,
): AgedPost {
  return {
    postId: id,
    publishedOn,
    readings: readingsAtAges.map((r) => ({
      measuredOn: addDays(publishedOn, r.age),
      value: r.value,
    })),
  }
}

const PUBLISHED = '2026-08-01'

describe('daysBetween', () => {
  it('counts whole days between two YYYY-MM-DD days', () => {
    expect(daysBetween('2026-08-01', '2026-08-08')).toBe(7)
  })

  it('is zero for the same day', () => {
    expect(daysBetween('2026-08-01', '2026-08-01')).toBe(0)
  })

  it('returns null for an unparseable input rather than a fabricated number', () => {
    expect(daysBetween('not-a-date', '2026-08-08')).toBeNull()
    expect(daysBetween('2026-08-01', 'also-not-a-date')).toBeNull()
  })
})

describe('valueAtAge — exact age only', () => {
  it('returns the reading whose measured day is exactly `age` days after publishing', () => {
    const p = post('a', PUBLISHED, [{ age: 7, value: 500 }])
    expect(valueAtAge(p, 7)).toBe(500)
  })

  /**
   * THE ANTI-FABRICATION RULE. A reading taken one day short of the requested
   * age is NOT "close enough" — it is the total by day six, and calling it the
   * total by day seven understates the post by whatever it earned on day seven,
   * an amount this function has no way to know. There is no nearest-reading
   * fallback; a miss is a miss.
   */
  it('returns null when the only reading is one day short of the requested age — it does not round', () => {
    const p = post('a', PUBLISHED, [{ age: 6, value: 500 }])
    expect(valueAtAge(p, 7)).toBeNull()
  })

  it('returns null when the post has no readings at all', () => {
    const p = post('a', PUBLISHED, [])
    expect(valueAtAge(p, 7)).toBeNull()
  })
})

describe('median', () => {
  it('is the middle value for an odd count', () => {
    expect(median([5, 1, 3])).toBe(3)
  })

  it('averages the two middle values for an even count', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })

  it('is null for an empty list — there is no middle of nothing', () => {
    expect(median([])).toBeNull()
  })
})

/**
 * Three earlier posts, each with a valid reading at `age`, at `value` each,
 * spread across different publish dates so they read as distinct posts.
 */
function baseline(age: number, values: readonly number[]): AgedPost[] {
  return values.map((v, i) => post(`base-${i}`, addDays(PUBLISHED, -30 - i), [{ age, value: v }]))
}

describe('normalFor — the honest-empty paths, each a different sentence', () => {
  it('says no-history when there is nothing at all, in either arm', () => {
    expect(normalFor([], [])).toEqual({ kind: 'none', reason: 'no-history' })
  })

  it('says too-few-prior-posts when fewer than MIN_BASELINE_POSTS earlier posts have a valid reading at age', () => {
    const earlier = baseline(COMPARE_AGE_DAYS, [20, 20]) // one short of the floor
    const week = [post('w0', PUBLISHED, [{ age: COMPARE_AGE_DAYS, value: 20 }])]
    expect(normalFor(week, earlier)).toEqual({ kind: 'none', reason: 'too-few-prior-posts' })
  })

  it('says week-too-young when the baseline is solid but nothing in the week has aged in yet', () => {
    const earlier = baseline(COMPARE_AGE_DAYS, [20, 20, 20])
    // Published two days ago: no reading at COMPARE_AGE_DAYS can exist yet.
    const week = [post('w0', addDays(PUBLISHED, 60), [{ age: 2, value: 5 }])]
    expect(normalFor(week, earlier)).toEqual({ kind: 'none', reason: 'week-too-young' })
  })

  it('says numbers-too-small when the baseline median is under MIN_BASELINE_VALUE', () => {
    const earlier = baseline(COMPARE_AGE_DAYS, [3, 4, 5])
    const week = [post('w0', PUBLISHED, [{ age: COMPARE_AGE_DAYS, value: 20 }])]
    const r = normalFor(week, earlier)
    expect(r).toEqual({ kind: 'none', reason: 'numbers-too-small' })
  })

  /**
   * A baseline entirely of zeros. Without the MIN_BASELINE_VALUE gate landing
   * first, `(weekValue - 0) / 0` would be a division by zero — Infinity or NaN
   * reaching the report as a percentage. It must land safely on
   * numbers-too-small instead, never a crash, never an Infinity.
   */
  it('never divides by zero on a zero baseline — it lands on numbers-too-small', () => {
    const earlier = baseline(COMPARE_AGE_DAYS, [0, 0, 0])
    const week = [post('w0', PUBLISHED, [{ age: COMPARE_AGE_DAYS, value: 5 }])]
    const r = normalFor(week, earlier)
    expect(r).toEqual({ kind: 'none', reason: 'numbers-too-small' })
  })

  /**
   * THE ORDER. Both floors fail at once: two prior posts (too few) and a week
   * that has not aged in either. The baseline is checked first, deliberately —
   * with too few earlier posts the fix is more weeks of publishing, and telling
   * someone their week is too young would send them to wait for the wrong thing.
   */
  it('reports too-few-prior-posts over week-too-young when both are true', () => {
    const earlier = baseline(COMPARE_AGE_DAYS, [20, 20]) // one short
    const week = [post('w0', addDays(PUBLISHED, 60), [{ age: 2, value: 5 }])] // also too young
    expect(normalFor(week, earlier)).toEqual({ kind: 'none', reason: 'too-few-prior-posts' })
  })
})

describe('normalFor — a real comparison, in every direction', () => {
  it('reports up when the week clears normal by more than MIN_MOVE', () => {
    const earlier = baseline(COMPARE_AGE_DAYS, [100, 100, 100])
    const week = [post('w0', PUBLISHED, [{ age: COMPARE_AGE_DAYS, value: 150 }])]
    const r = normalFor(week, earlier)
    expect(r).toEqual({
      kind: 'compared',
      direction: 'up',
      movePercent: 50,
      weekValue: 150,
      normalValue: 100,
      basedOnPosts: 3,
      ageDays: COMPARE_AGE_DAYS,
    })
  })

  it('reports down when the week falls short of normal by more than MIN_MOVE', () => {
    const earlier = baseline(COMPARE_AGE_DAYS, [100, 100, 100])
    const week = [post('w0', PUBLISHED, [{ age: COMPARE_AGE_DAYS, value: 50 }])]
    const r = normalFor(week, earlier)
    expect(r).toEqual({
      kind: 'compared',
      direction: 'down',
      movePercent: 50,
      weekValue: 50,
      normalValue: 100,
      basedOnPosts: 3,
      ageDays: COMPARE_AGE_DAYS,
    })
  })

  /**
   * `level` is a finding, not a refusal — the week landed inside MIN_MOVE of
   * normal, which is a real answer ("about the same as usual"), not one of the
   * NoNormalReason states.
   */
  it('reports level when the move is under MIN_MOVE, as a finding rather than a refusal', () => {
    const earlier = baseline(COMPARE_AGE_DAYS, [100, 100, 100])
    const week = [post('w0', PUBLISHED, [{ age: COMPARE_AGE_DAYS, value: 105 }])]
    const r = normalFor(week, earlier)
    expect(r.kind).toBe('compared')
    if (r.kind !== 'compared') throw new Error('expected a comparison')
    expect(r.direction).toBe('level')
    expect(Math.abs((105 - 100) / 100)).toBeLessThan(MIN_MOVE)
  })
})

describe('normalFor uses the median, not the mean', () => {
  /**
   * Three ordinary earlier posts at 20 and one outlier at 2000 — a single post
   * going viral. The mean of that baseline is 510.5; the median is 20. A week
   * at 22 must read as roughly normal (median), not as a catastrophic collapse
   * against a mean the outlier alone inflated.
   */
  it('one huge outlier in the baseline barely moves the normal', () => {
    const earlier = baseline(COMPARE_AGE_DAYS, [20, 20, 20, 2000])
    // 21 against a median of 20 is a 5% move, safely under MIN_MOVE (0.1).
    // Against the MEAN of 510.5 it would read as an 96% collapse.
    const week = [post('w0', PUBLISHED, [{ age: COMPARE_AGE_DAYS, value: 21 }])]
    const r = normalFor(week, earlier)
    expect(r.kind).toBe('compared')
    if (r.kind !== 'compared') throw new Error('expected a comparison')
    // Median of [20, 20, 20, 2000] is (20 + 20) / 2 = 20, not the mean of 510.5.
    expect(r.normalValue).toBe(20)
    expect(r.direction).toBe('level')
  })
})
