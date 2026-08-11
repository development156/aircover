import { describe, it, expect } from 'vitest'

import type { MetricAvailability } from '@sahoda/publishing'

import {
  byChannel,
  coverageFor,
  coverageNote,
  measuredFor,
  rankBy,
  shareOfMeasured,
  totalFor,
  unmeasuredFor,
  type ComparableRow,
} from '@/lib/analytics/compare'

/**
 * The zero does not come back in through the comparison.
 *
 * Every refusal `classifyPostMetrics` makes about one number, this module has to
 * make again about a relationship between numbers — and the failures look nothing
 * like a rendered "0". They look like a row in last place, a total that is really a
 * subtotal, and a percentage of a population that was never measured.
 */

const STAMP = '2026-08-11T13:16:55Z'

const ready = (over: Partial<Record<string, number | null>> = {}): MetricAvailability => ({
  kind: 'ready',
  metrics: {
    impressions: 100,
    reach: 80,
    engagement: 5,
    engagementRate: 5,
    measuredAt: STAMP,
    ...over,
  } as MetricAvailability extends { kind: 'ready'; metrics: infer M } ? M : never,
})

const pending: MetricAvailability = {
  kind: 'pending',
  reason: 'lag',
  availableAfter: '2026-08-13T00:00:00.000Z',
}

const unknownWindow: MetricAvailability = {
  kind: 'pending',
  reason: 'unknown-window',
  availableAfter: null,
}

const row = (over: Partial<ComparableRow> = {}): ComparableRow => ({
  postId: 'p1',
  title: 'A post',
  channel: 'instagram',
  state: ready(),
  ...over,
})

describe('only a real number is counted', () => {
  it('leaves out a pending row entirely', () => {
    const rows = [row({ state: ready({ impressions: 40 }) }), row({ postId: 'p2', state: pending })]
    expect(measuredFor(rows, 'impressions').map((r) => r.value)).toEqual([40])
    expect(unmeasuredFor(rows, 'impressions').map((r) => r.postId)).toEqual(['p2'])
  })

  /**
   * The subtle one. `ready` does NOT mean every field arrived — the payload is cast,
   * not validated, so a measured post can hold `impressions: null`. Counting every
   * ready row would slide that absence into a total as a zero, through the one state
   * allowed to carry numbers.
   */
  it('leaves out a ready row whose own field was never reported', () => {
    const rows = [
      row({ state: ready({ impressions: 40 }) }),
      row({ postId: 'p2', state: ready({ impressions: null, reach: 12 }) }),
    ]
    expect(measuredFor(rows, 'impressions').map((r) => r.value)).toEqual([40])
    // And it is still measured for the field it DID report. The exclusion is
    // per metric, not per row.
    expect(measuredFor(rows, 'reach').map((r) => r.value)).toEqual([80, 12])
  })

  it('counts a REPORTED zero, which is a measurement', () => {
    const rows = [row({ state: ready({ impressions: 0 }) })]
    expect(measuredFor(rows, 'impressions').map((r) => r.value)).toEqual([0])
    expect(totalFor(rows, 'impressions')).toEqual({
      value: 0,
      coverage: { counted: 1, of: 1 },
    })
  })
})

describe('a total never pretends to be one', () => {
  it('states the coverage it was computed from', () => {
    const rows = [
      row({ state: ready({ impressions: 40 }) }),
      row({ postId: 'p2', state: ready({ impressions: 60 }) }),
      row({ postId: 'p3', state: pending }),
    ]
    expect(totalFor(rows, 'impressions')).toEqual({
      value: 100,
      coverage: { counted: 2, of: 3 },
    })
  })

  /**
   * NOT `{ value: 0, coverage: { counted: 0, of: 3 } }`. That is technically honest
   * and still renders a big "0" the reader takes at face value. With nothing
   * reported there is no total, so there is no figure to print.
   */
  it('is null — not zero — when nothing reported', () => {
    const rows = [row({ state: pending }), row({ postId: 'p2', state: unknownWindow })]
    expect(totalFor(rows, 'impressions')).toBeNull()
  })

  it('distinguishes "no total" from "a total of zero"', () => {
    expect(totalFor([row({ state: pending })], 'impressions')).toBeNull()
    expect(totalFor([row({ state: ready({ impressions: 0 }) })], 'impressions')).toMatchObject({
      value: 0,
    })
  })

  it('says so in words, both ways round', () => {
    expect(coverageNote({ counted: 3, of: 3 })).toBe('All 3 channels reported.')
    expect(coverageNote({ counted: 2, of: 5 })).toContain('2 of 5 channels reported')
  })
})

describe('an unmeasured post is not ranked last — it is not ranked', () => {
  /**
   * The failure this prevents: a pending post given 0 to sort by lands at the
   * bottom, which is the position that means "reached the fewest people". The card
   * for that post is careful to show a dash; the list would have said it anyway.
   */
  it('omits pending rows from the ranking rather than sinking them', () => {
    const rows = [
      row({ postId: 'p1', title: 'Middle', state: ready({ impressions: 50 }) }),
      row({ postId: 'p2', title: 'Pending', state: pending }),
      row({ postId: 'p3', title: 'Best', state: ready({ impressions: 90 }) }),
    ]
    const ranked = rankBy(rows, 'impressions')
    expect(ranked.map((r) => r.title)).toEqual(['Best', 'Middle'])
    expect(ranked.map((r) => r.postId)).not.toContain('p2')
  })

  it('places a genuine zero last, because that IS its position', () => {
    const rows = [
      row({ postId: 'p1', title: 'Zero', state: ready({ impressions: 0 }) }),
      row({ postId: 'p2', title: 'Some', state: ready({ impressions: 5 }) }),
    ]
    expect(rankBy(rows, 'impressions').map((r) => r.title)).toEqual(['Some', 'Zero'])
  })

  it('breaks ties on title, so the order does not depend on who answered first', () => {
    const rows = [
      row({ postId: 'p1', title: 'Beta', state: ready({ impressions: 10 }) }),
      row({ postId: 'p2', title: 'Alpha', state: ready({ impressions: 10 }) }),
    ]
    expect(rankBy(rows, 'impressions').map((r) => r.title)).toEqual(['Alpha', 'Beta'])
  })

  it('honours a limit without changing what is eligible', () => {
    const rows = [
      row({ postId: 'p1', title: 'A', state: ready({ impressions: 3 }) }),
      row({ postId: 'p2', title: 'B', state: ready({ impressions: 2 }) }),
      row({ postId: 'p3', title: 'C', state: pending }),
    ]
    expect(rankBy(rows, 'impressions', 1).map((r) => r.title)).toEqual(['A'])
  })
})

describe('channels are rolled up on their own coverage', () => {
  const rows = [
    row({ postId: 'p1', channel: 'instagram', state: ready({ impressions: 40 }) }),
    row({ postId: 'p2', channel: 'instagram', state: ready({ impressions: 60 }) }),
    row({ postId: 'p3', channel: 'linkedin', state: ready({ impressions: 61 }) }),
    row({ postId: 'p4', channel: 'linkedin', state: unknownWindow }),
  ]

  it('gives each channel its own denominator', () => {
    const byC = byChannel(rows, 'impressions')
    expect(byC.find((c) => c.channel === 'instagram')?.total).toEqual({
      value: 100,
      coverage: { counted: 2, of: 2 },
    })
    // One of LinkedIn's two reported. The number is real; the coverage is not the
    // same as Instagram's, and a bare figure would invite comparing them as if it were.
    expect(byC.find((c) => c.channel === 'linkedin')?.total).toEqual({
      value: 61,
      coverage: { counted: 1, of: 2 },
    })
  })

  it('gives a channel that reported nothing a null total, not a zero row', () => {
    const byC = byChannel([row({ channel: 'x', state: pending })], 'impressions')
    expect(byC[0]?.total).toBeNull()
    // The channel is still LISTED — omitting it would read as "X has nothing to say"
    // rather than "we have nothing from X yet".
    expect(byC[0]?.channel).toBe('x')
  })

  it('keeps every row, measured or not, so the caller can explain the gap', () => {
    expect(byChannel(rows, 'impressions').find((c) => c.channel === 'linkedin')?.rows).toHaveLength(
      2,
    )
  })
})

describe('a share is refused unless the whole population reported', () => {
  /**
   * "Instagram drove 62% of your reach" is arithmetic on a denominator. Build the
   * denominator from partial coverage and the sentence describes a population that
   * was never measured — not a rougher truth, a different quantity.
   */
  it('is null when any row in scope is unmeasured', () => {
    const rows = [
      row({ postId: 'p1', channel: 'instagram', state: ready({ impressions: 40 }) }),
      row({ postId: 'p2', channel: 'linkedin', state: pending }),
    ]
    expect(shareOfMeasured(rows, 'instagram', 'impressions')).toBeNull()
  })

  it('is a real fraction when everything reported', () => {
    const rows = [
      row({ postId: 'p1', channel: 'instagram', state: ready({ impressions: 40 }) }),
      row({ postId: 'p2', channel: 'linkedin', state: ready({ impressions: 60 }) }),
    ]
    expect(shareOfMeasured(rows, 'instagram', 'impressions')).toBeCloseTo(0.4)
  })

  /** No division by zero, and no "0% of nothing" either. */
  it('is null when the measured whole is zero', () => {
    const rows = [
      row({ postId: 'p1', channel: 'instagram', state: ready({ impressions: 0 }) }),
      row({ postId: 'p2', channel: 'linkedin', state: ready({ impressions: 0 }) }),
    ]
    expect(shareOfMeasured(rows, 'instagram', 'impressions')).toBeNull()
  })
})

describe('coverage is reported per metric, not per row', () => {
  it('counts a row for the field it reported and not for the one it did not', () => {
    const rows = [
      row({ state: ready({ impressions: 10, reach: null }) }),
      row({ postId: 'p2', state: ready({ impressions: 20, reach: 15 }) }),
    ]
    expect(coverageFor(rows, 'impressions')).toEqual({ counted: 2, of: 2 })
    expect(coverageFor(rows, 'reach')).toEqual({ counted: 1, of: 2 })
  })
})
