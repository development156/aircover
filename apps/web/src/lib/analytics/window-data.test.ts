import { describe, expect, it } from 'vitest'

import { valueAtAge } from '@/lib/analytics/like-age'
import {
  ROW_CAP,
  SNAPSHOT_METRICS,
  SNAPSHOT_ROW_CAP,
  agedFor,
  type SnapshotReading,
} from '@/lib/analytics/window-data'

/**
 * SPLITTING ONE SNAPSHOT TABLE INTO THREE METRICS, WITHOUT MIXING THEM.
 *
 * ── WHY THIS FILE EXISTS AT ALL ──────────────────────────────────────────────
 * `window-data.ts` only fetches, and its header says so: the decisions live in
 * `timing.ts`, `headline.ts` and `like-age.ts`, which hold no I/O. That split is
 * why it had no test of its own. Reading three metrics out of ONE query put a
 * real decision back into it — which readings belong to which metric — and the
 * decision is pure, so it is extracted and asserted here rather than left to a
 * database nobody can run in this sandbox.
 *
 * ── THE FAILURE THIS GUARDS IS INVISIBLE ─────────────────────────────────────
 * `post_metric_snapshots` stores impressions, reach and engagement as rows that
 * differ only by a `metric` column, and every value is a plain count.
 * `readingAtAge` picks a reading by DAY. So a day carrying impressions but not
 * reach would answer the REACH question with an impressions number, and nothing
 * downstream could tell: both are integers, both are plausible, and the larger
 * one flatters us. There is no shape to notice it by. Only this.
 *
 * ── WHAT IT CANNOT SEE ───────────────────────────────────────────────────────
 * Whether the query in `readSnapshots` actually asks for all three metrics, or
 * parses the column it selects — that needs a database. It asserts the shape
 * the parse must produce and the arithmetic of the cap, not the SQL. And it says
 * nothing about whether the nightly job captured anything: a workspace whose
 * history holds only reach reads exactly like one where the other two were
 * dropped, which is why an absence downstream is a null and never a zero.
 */

const LEGS = [
  { postId: 'p1', channel: 'instagram' as const, publishedAt: '2026-08-01T09:00:00Z' },
  { postId: 'p2', channel: 'x' as const, publishedAt: '2026-08-01T09:00:00Z' },
]

const reading = (over: Partial<SnapshotReading> & { metric: SnapshotReading['metric'] }) => ({
  postId: 'p1',
  channel: 'instagram' as const,
  value: 100,
  measuredOn: '2026-08-04',
  ...over,
})

describe('one metric per map', () => {
  it('keeps a reading out of every map but its own', () => {
    const snapshots = [
      reading({ metric: 'reach', value: 10 }),
      reading({ metric: 'impressions', value: 20 }),
      reading({ metric: 'engagement', value: 30 }),
    ]

    // Age 3: published 2026-08-01, measured 2026-08-04.
    expect(valueAtAge(agedFor(LEGS, snapshots, 'reach').get('p1:instagram')!, 3)).toBe(10)
    expect(valueAtAge(agedFor(LEGS, snapshots, 'impressions').get('p1:instagram')!, 3)).toBe(20)
    expect(valueAtAge(agedFor(LEGS, snapshots, 'engagement').get('p1:instagram')!, 3)).toBe(30)
  })

  it('answers null for a metric recorded on no day, rather than a neighbour’s number', () => {
    // The whole point. Reach was captured; impressions was not. A day-matching
    // lookup over an unfiltered list would have handed back 10 here.
    const snapshots = [reading({ metric: 'reach', value: 10 })]

    expect(valueAtAge(agedFor(LEGS, snapshots, 'reach').get('p1:instagram')!, 3)).toBe(10)
    expect(valueAtAge(agedFor(LEGS, snapshots, 'impressions').get('p1:instagram')!, 3)).toBeNull()
  })

  it('answers null on a day THIS metric missed, even when it has other days', () => {
    // The collecting job missing one night is the ordinary case `like-age.ts`
    // names. It must not be filled in from the metric's own neighbouring days
    // either — that would be an interpolation presented as a measurement.
    const snapshots = [
      reading({ metric: 'impressions', measuredOn: '2026-08-03', value: 90 }),
      reading({ metric: 'impressions', measuredOn: '2026-08-05', value: 110 }),
    ]
    const aged = agedFor(LEGS, snapshots, 'impressions').get('p1:instagram')!

    expect(valueAtAge(aged, 2)).toBe(90)
    expect(valueAtAge(aged, 4)).toBe(110)
    expect(valueAtAge(aged, 3)).toBeNull()
  })

  it('does not carry one post’s readings onto another', () => {
    const snapshots = [reading({ metric: 'reach', postId: 'p1', value: 10 })]
    const aged = agedFor(LEGS, snapshots, 'reach')

    expect(valueAtAge(aged.get('p1:instagram')!, 3)).toBe(10)
    expect(valueAtAge(aged.get('p2:x')!, 3)).toBeNull()
  })

  it('does not carry one channel’s readings onto another leg of the same post', () => {
    const legs = [
      { postId: 'p1', channel: 'instagram' as const, publishedAt: '2026-08-01T09:00:00Z' },
      { postId: 'p1', channel: 'x' as const, publishedAt: '2026-08-01T09:00:00Z' },
    ]
    const snapshots = [reading({ metric: 'reach', channel: 'instagram', value: 10 })]
    const aged = agedFor(legs, snapshots, 'reach')

    expect(valueAtAge(aged.get('p1:instagram')!, 3)).toBe(10)
    expect(valueAtAge(aged.get('p1:x')!, 3)).toBeNull()
  })
})

describe('the cap, now that one read carries three metrics', () => {
  it('is the per-metric cap times the metrics asked for, not a hand-typed number', () => {
    // Written as arithmetic so a fourth metric moves it without anyone doing the
    // multiplication — and so this assertion fails if someone types 15000.
    expect(SNAPSHOT_ROW_CAP).toBe(ROW_CAP * SNAPSHOT_METRICS.length)
  })

  it('leaves room for a full history of every metric', () => {
    // The guarantee the cap exists for: a read that comes back short of its
    // limit was not truncated, so no total is a subtotal. Capping three metrics
    // at the one-metric number would have made a busy workspace report the whole
    // page unreadable.
    expect(SNAPSHOT_ROW_CAP).toBeGreaterThan(ROW_CAP)
    expect(SNAPSHOT_METRICS).toHaveLength(3)
  })

  it('names the three metrics the column actually allows', () => {
    // `post_metric_snapshots` has
    // `check (metric in ('impressions', 'reach', 'engagement'))`. A name here
    // that the column refuses would read as an absent metric for ever, silently.
    expect([...SNAPSHOT_METRICS].sort()).toEqual(['engagement', 'impressions', 'reach'])
  })
})
