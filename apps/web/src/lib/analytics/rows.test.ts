import { describe, it, expect } from 'vitest'

import {
  normalOf,
  versusNormal,
  versusSentence,
  sortRows,
  pageOf,
  byChannel,
} from '@/lib/analytics/rows'
import { MIN_BASELINE_POSTS } from '@/lib/analytics/like-age'
import type { PublishedRow } from '@/lib/analytics/window-data'

/**
 * THE TABLE'S OWN RULES — mirrors like-age.test.ts's house style: assert the
 * CLAIM a case makes, not incidental wording, and say in a comment why the
 * case exists.
 */

/** One row, defaulted so each test only names what it is testing. */
function row(over: Partial<PublishedRow> & { postId: string }): PublishedRow {
  return {
    postId: over.postId,
    title: over.title ?? over.postId,
    channel: over.channel ?? 'instagram',
    publishedAt: over.publishedAt ?? '2026-08-01',
    reachAtAge: over.reachAtAge ?? null,
  }
}

describe('sortRows — an unmeasured post is never ordered as a low one', () => {
  const measuredLow = row({ postId: 'a', title: 'A', reachAtAge: 1 })
  const measuredHigh = row({ postId: 'b', title: 'B', reachAtAge: 100 })
  const unmeasured1 = row({ postId: 'c', title: 'C', reachAtAge: null })
  const unmeasured2 = row({ postId: 'd', title: 'D', reachAtAge: null })
  const rows = [unmeasured1, measuredHigh, unmeasured2, measuredLow]

  /**
   * MUTATION (a): `sign * ((a.reachAtAge ?? 0) - (b.reachAtAge ?? 0))` would
   * fold nulls into 0, and in DESCENDING order a real zero-reach post outranks
   * an unmeasured one only by luck of comparison direction — the bug this test
   * catches is unmeasured rows leaking into the measured comparison at all,
   * which changes their position relative to measured rows depending on the
   * sign. Assert: every unmeasured row comes strictly after every measured row.
   */
  it('desc: every unmeasured row sorts after every measured row', () => {
    const sorted = sortRows(rows, 'reach', 'desc')
    const firstUnmeasuredIndex = sorted.findIndex((r) => r.reachAtAge === null)
    const lastMeasuredIndex = sorted.map((r) => r.reachAtAge !== null).lastIndexOf(true)
    expect(firstUnmeasuredIndex).toBeGreaterThan(lastMeasuredIndex)
  })

  /**
   * The other half of the same claim: ascending must NOT promote unmeasured
   * rows to the top. "We have not measured this" is not a small number, so
   * unmeasured rows stay after the measured ones in BOTH directions.
   */
  it('asc: every unmeasured row still sorts after every measured row, not promoted to the top', () => {
    const sorted = sortRows(rows, 'reach', 'asc')
    const firstUnmeasuredIndex = sorted.findIndex((r) => r.reachAtAge === null)
    const lastMeasuredIndex = sorted.map((r) => r.reachAtAge !== null).lastIndexOf(true)
    expect(firstUnmeasuredIndex).toBeGreaterThan(lastMeasuredIndex)
    // And within the measured group, ascending really is ascending.
    expect(sorted[0]?.postId).toBe('a')
    expect(sorted[1]?.postId).toBe('b')
  })

  it('ties among measured rows are broken by title, deterministically', () => {
    const tie1 = row({ postId: 'z', title: 'Zulu', reachAtAge: 5 })
    const tie2 = row({ postId: 'y', title: 'Alpha', reachAtAge: 5 })
    const sorted = sortRows([tie1, tie2], 'reach', 'desc')
    expect(sorted.map((r) => r.title)).toEqual(['Alpha', 'Zulu'])
  })
})

describe('versusNormal', () => {
  /**
   * MUTATION (b): treating a null `reachAtAge` as 0 would make an unmeasured
   * post read as "100% below your normal" instead of refusing a percentage.
   * The claim: an unmeasured post never gets a percentage at all.
   */
  it('an unmeasured row gets kind "unmeasured", never a percent', () => {
    const r = versusNormal(row({ postId: 'a', reachAtAge: null }), 100)
    expect(r.kind).toBe('unmeasured')
    expect((r as { percent?: number }).percent).toBeUndefined()
  })

  it('no-normal when normal is null', () => {
    expect(versusNormal(row({ postId: 'a', reachAtAge: 50 }), null)).toEqual({ kind: 'no-normal' })
  })

  it('no-normal when normal is zero or negative — never Infinity or NaN', () => {
    expect(versusNormal(row({ postId: 'a', reachAtAge: 50 }), 0)).toEqual({ kind: 'no-normal' })
    expect(versusNormal(row({ postId: 'a', reachAtAge: 50 }), -5)).toEqual({ kind: 'no-normal' })
  })

  it('reports up/down/level with a rounded whole percent', () => {
    const up = versusNormal(row({ postId: 'a', reachAtAge: 150 }), 100)
    expect(up).toEqual({ kind: 'compared', direction: 'up', percent: 50 })

    const down = versusNormal(row({ postId: 'a', reachAtAge: 50 }), 100)
    expect(down).toEqual({ kind: 'compared', direction: 'down', percent: 50 })

    // Inside MIN_MOVE (0.1) reads as level, a finding rather than a refusal.
    const level = versusNormal(row({ postId: 'a', reachAtAge: 105 }), 100)
    expect(level.kind).toBe('compared')
    if (level.kind !== 'compared') throw new Error('expected compared')
    expect(level.direction).toBe('level')
  })
})

describe('versusSentence — a distinct sentence per kind', () => {
  it('every VersusNormal kind produces a distinct sentence', () => {
    const sentences = new Set([
      versusSentence({ kind: 'no-normal' }),
      versusSentence({ kind: 'unmeasured' }),
      versusSentence({ kind: 'compared', direction: 'up', percent: 10 }),
      versusSentence({ kind: 'compared', direction: 'down', percent: 10 }),
      versusSentence({ kind: 'compared', direction: 'level', percent: 0 }),
    ])
    expect(sentences.size).toBe(5)
  })
})

describe('normalOf', () => {
  it('is null below MIN_BASELINE_POSTS measured rows', () => {
    const rows = Array.from({ length: MIN_BASELINE_POSTS - 1 }, (_, i) =>
      row({ postId: `p${i}`, reachAtAge: 100 }),
    )
    expect(normalOf(rows)).toBeNull()
  })

  it('ignores unmeasured rows when counting toward MIN_BASELINE_POSTS', () => {
    const measured = Array.from({ length: MIN_BASELINE_POSTS - 1 }, (_, i) =>
      row({ postId: `m${i}`, reachAtAge: 100 }),
    )
    const unmeasured = [row({ postId: 'u0', reachAtAge: null })]
    expect(normalOf([...measured, ...unmeasured])).toBeNull()
  })

  /**
   * MEDIAN, not mean: a single post that went unusually far would drag a mean
   * upward. Three ordinary posts at 20 and one outlier at 2000 — the mean
   * (510) and the median (20) disagree materially, and the function must
   * report the median.
   */
  it('uses the median, not the mean, so one outlier does not drag the normal', () => {
    const rows = [20, 20, 20, 2000].map((v, i) => row({ postId: `o${i}`, reachAtAge: v }))
    expect(normalOf(rows)).toBe(20)
  })
})

describe('pageOf', () => {
  const rows = Array.from({ length: 30 }, (_, i) => i)

  it('page 0, negative, and NaN all clamp to page 1', () => {
    expect(pageOf(rows, 0, 10).page).toBe(1)
    expect(pageOf(rows, -5, 10).page).toBe(1)
    expect(pageOf(rows, NaN, 10).page).toBe(1)
  })

  it('a page number past the end clamps to the last page, never an empty page for a non-empty set', () => {
    const result = pageOf(rows, 999, 10)
    expect(result.page).toBe(3)
    expect(result.rows.length).toBeGreaterThan(0)
  })

  it('reports the correct page count', () => {
    expect(pageOf(rows, 1, 10).pages).toBe(3)
    expect(pageOf([], 1, 10).pages).toBe(1)
  })

  it('an empty set never errors and reports one page with no rows', () => {
    const result = pageOf([], 1, 10)
    expect(result.pages).toBe(1)
    expect(result.rows).toEqual([])
    expect(result.total).toBe(0)
  })
})

describe('byChannel', () => {
  /**
   * MUTATION (c): `(b.reach ?? 0) - (a.reach ?? 0)` would tie a channel with
   * nothing measured against a channel whose genuine reach summed to zero.
   * The claim: a channel with nothing measured sorts LAST, never tied with a
   * genuine zero.
   */
  it('a channel with nothing measured sorts strictly after a channel with a genuine zero reach', () => {
    // The unmeasured channel's name ('facebook') sorts BEFORE the measured
    // channel's name ('gbp') alphabetically, so a mutation that treats a
    // missing reach as 0 (a tie, broken alphabetically) would wrongly put
    // the unmeasured channel first. The real rule must beat the tiebreak.
    const rows: PublishedRow[] = [
      row({ postId: 'a', channel: 'facebook', reachAtAge: null }),
      row({ postId: 'b', channel: 'gbp', reachAtAge: 0 }),
    ]
    const result = byChannel(rows)
    expect(result[0]?.channel).toBe('gbp')
    expect(result[0]?.reach).toBe(0)
    expect(result[1]?.channel).toBe('facebook')
    expect(result[1]?.reach).toBeNull()
  })

  it('counts distinct posts: the same post on the same channel twice counts as one post', () => {
    const rows: PublishedRow[] = [
      row({ postId: 'same', channel: 'instagram', reachAtAge: 10 }),
      row({ postId: 'same', channel: 'instagram', reachAtAge: 10 }),
    ]
    const result = byChannel(rows)
    expect(result[0]?.posts).toBe(1)
  })

  it('reach is null, not 0, when nothing on the channel reported', () => {
    const rows: PublishedRow[] = [row({ postId: 'a', channel: 'gbp', reachAtAge: null })]
    const result = byChannel(rows)
    expect(result[0]?.reach).toBeNull()
    expect(result[0]?.measured).toBe(0)
  })

  it('measured is visible and less than posts when only some of a channel reported', () => {
    const rows: PublishedRow[] = [
      row({ postId: 'a', channel: 'linkedin', reachAtAge: 10 }),
      row({ postId: 'b', channel: 'linkedin', reachAtAge: null }),
      row({ postId: 'c', channel: 'linkedin', reachAtAge: null }),
    ]
    const result = byChannel(rows)
    expect(result[0]?.posts).toBe(3)
    expect(result[0]?.measured).toBe(1)
    expect(result[0]?.measured).toBeLessThan(result[0]?.posts as number)
    expect(result[0]?.reach).toBe(10)
  })
})
