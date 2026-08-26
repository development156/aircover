import { describe, expect, test } from 'vitest'

import { auditChange, hasDigit } from './evidence'
import {
  bindChanges,
  type CollectorChangeRow,
  type CollectorSnapshotRow,
  type SourceFacts,
} from './from-collector'

/**
 * THE COLLECTOR'S ROWS SURVIVE THE TRIP INTO THIS SCREEN'S VOCABULARY.
 *
 * ── WHY THIS FILE HAS TO EXIST ──────────────────────────────────────────────
 * The two halves of Radar were written by different lanes against different
 * briefs and share not one change name. MEASURED 2026-08-25:
 *
 *   the collector writes   new_posts | audience_moved | page_content
 *   this screen models     post_published | cadence_shift | price_changed |
 *                          offer_appeared | offer_ended | page_changed
 *
 * A translation between two vocabularies is exactly the kind of code that looks
 * finished and is wrong in the middle, and there are no rows in production to
 * catch it: all five Radar tables are EMPTY, so shipping this binding and
 * watching the screen proves nothing at all. These fixtures are the only place
 * the mapping is exercised until the first scan runs.
 *
 * ── THE ASSERTION THAT MATTERS MOST IS `auditChange` ────────────────────────
 * Not the shape of the output — the PROVENANCE of it. `auditChange` is the
 * screen's own auditor: it fails a figure citing a snapshot that is not in the
 * change's evidence, a change resting on another competitor's reads, and any
 * number spelled inside prose. Running it over every mapped change is how this
 * file tests the thing that actually matters, rather than restating the mapping
 * back to itself.
 *
 * The digit rule is the one a naive binding breaks instantly, because the
 * collector's own summaries are good sentences full of numbers — `Posted 4
 * times.`, `Followers up 1.2k, to 8.4k.` — and passing them straight through
 * would put unprovenanced figures on the one screen built entirely around
 * provenance.
 */

const SOURCES = new Map<string, SourceFacts>([
  ['src-1', { competitorId: 'comp-1', locator: 'https://example.com/menu' }],
  ['src-2', { competitorId: 'comp-2', locator: 'instagram.com/theothershop' }],
])

const NAMES = new Map([
  ['comp-1', 'The Corner Bakery'],
  ['comp-2', 'The Other Shop'],
])

function snap(id: string, sourceId: string, at: string): CollectorSnapshotRow {
  return { id, source_id: sourceId, captured_at: at }
}

const SNAPSHOTS = new Map<string, CollectorSnapshotRow>([
  ['snap-a', snap('snap-a', 'src-1', '2026-08-18T03:40:00.000Z')],
  ['snap-b', snap('snap-b', 'src-1', '2026-08-25T03:40:00.000Z')],
  ['snap-c', snap('snap-c', 'src-2', '2026-08-18T03:41:00.000Z')],
  ['snap-d', snap('snap-d', 'src-2', '2026-08-25T03:41:00.000Z')],
])

function row(over: Partial<CollectorChangeRow> = {}): CollectorChangeRow {
  return {
    id: 'chg-1',
    source_id: 'src-1',
    from_snapshot_id: 'snap-a',
    to_snapshot_id: 'snap-b',
    change_kind: 'page_content',
    day_span: 7,
    summary: 'Their page prices changed (1 new, 0 gone, now showing ₹499).',
    detail: {
      pricesAdded: [{ raw: '₹499' }],
      pricesRemoved: [],
      titleFrom: 'A',
      titleTo: 'A',
      wordDelta: 12,
    },
    detected_at: '2026-08-25T03:40:11.000Z',
    ...over,
  }
}

function bind(rows: CollectorChangeRow[]) {
  return bindChanges(rows, SNAPSHOTS, SOURCES, NAMES)
}

describe('the vocabularies are translated', () => {
  test('new_posts becomes a post, counted as a figure', () => {
    const { changes } = bind([
      row({
        change_kind: 'new_posts',
        source_id: 'src-2',
        from_snapshot_id: 'snap-c',
        to_snapshot_id: 'snap-d',
        detail: { count: 4, postIds: ['p1', 'p2', 'p3', 'p4'] },
      }),
    ])
    expect(changes[0]?.kind).toBe('post_published')
    expect(changes[0]?.observation.figures).toEqual([
      { label: 'New posts', value: 4, unit: 'posts', snapshotId: 'snap-d' },
    ])
  })

  test('page_content with a price move becomes price_changed, not page_changed', () => {
    // A REFINEMENT, not a guess: the collector bundles a price move and a copy
    // edit under one name and this screen has the more useful word for it.
    expect(bind([row()]).changes[0]?.kind).toBe('price_changed')
  })

  test('page_content with no price move stays page_changed', () => {
    const { changes } = bind([
      row({
        detail: { pricesAdded: [], pricesRemoved: [], titleFrom: 'A', titleTo: 'A', wordDelta: -8 },
      }),
    ])
    expect(changes[0]?.kind).toBe('page_changed')
    expect(changes[0]?.observation.figures).toEqual([
      { label: 'Words changed', value: 8, unit: 'words', snapshotId: 'snap-b' },
    ])
  })

  test('a kind this screen has never heard of is DROPPED and counted, never coerced', () => {
    // Rendering it under a borrowed name would be a false statement about
    // somebody's business. Dropping it silently would be a feed claiming to show
    // everything, so the count is the honest middle.
    const result = bind([row({ change_kind: 'something_new' })])
    expect(result.changes).toEqual([])
    expect(result.dropped.unknownKind).toBe(1)
  })

  test('a change whose evidence is missing is dropped, not rendered bare', () => {
    const result = bind([row({ to_snapshot_id: 'snap-gone' })])
    expect(result.changes).toEqual([])
    expect(result.dropped.danglingEvidence).toBe(1)
  })
})

describe('the direction is prose and the amount is a figure', () => {
  const followers = (delta: number, to: number) =>
    bind([
      row({
        change_kind: 'audience_moved',
        source_id: 'src-2',
        from_snapshot_id: 'snap-c',
        to_snapshot_id: 'snap-d',
        detail: { from: to - delta, to, delta },
      }),
    ]).changes[0]

  test('up says up', () => {
    expect(followers(1200, 8400)?.observation.summary).toBe('Their follower count went up.')
  })

  test('down says down', () => {
    // A rewrite that flattened both to "moved" would be VAGUER THAN THE TRUTH we
    // already hold, which this repository treats as a defect rather than a style
    // choice.
    expect(followers(-300, 8100)?.observation.summary).toBe('Their follower count went down.')
  })

  test('the figure carries the magnitude, because the sentence carries the sign', () => {
    const change = followers(-300, 8100)
    expect(change?.observation.figures).toEqual([
      { label: 'Change', value: 300, unit: 'followers', snapshotId: 'snap-d' },
      { label: 'Followers now', value: 8100, unit: null, snapshotId: 'snap-d' },
    ])
  })
})

describe('a price is counted, never valued', () => {
  test('two prices appearing is a count of two and no rupee figure', () => {
    const { changes } = bind([
      row({
        detail: {
          pricesAdded: [{ raw: '₹499' }, { raw: '₹1,299' }],
          pricesRemoved: [{ raw: '₹450' }],
          titleFrom: 'A',
          titleTo: 'A',
          wordDelta: 0,
        },
      }),
    ])
    // Parsing `₹1,299` into 1299 means guessing currency, separators and locale —
    // inventing a measurement out of a label. The COUNT is observed; the value is
    // a string somebody else wrote.
    expect(changes[0]?.observation.figures).toEqual([
      { label: 'Prices added', value: 2, unit: null, snapshotId: 'snap-b' },
      { label: 'Prices removed', value: 1, unit: null, snapshotId: 'snap-b' },
    ])
    expect(changes[0]?.observation.figures.some((f) => f.value === 499)).toBe(false)
  })
})

describe('every mapped change survives the screen’s own auditor', () => {
  const ALL = [
    row(),
    row({ id: 'chg-2', change_kind: 'new_posts', detail: { count: 2, postIds: ['a', 'b'] } }),
    row({
      id: 'chg-3',
      change_kind: 'audience_moved',
      source_id: 'src-2',
      from_snapshot_id: 'snap-c',
      to_snapshot_id: 'snap-d',
      detail: { from: 8000, to: 8400, delta: 400 },
    }),
    row({
      id: 'chg-4',
      detail: { pricesAdded: [], pricesRemoved: [], titleFrom: 'A', titleTo: 'B', wordDelta: 3 },
    }),
  ]

  test('auditChange finds nothing to report', () => {
    const { changes } = bind(ALL)
    expect(changes).toHaveLength(4)
    expect(changes.flatMap(auditChange)).toEqual([])
  })

  test('and the collector’s digit-laden prose never reaches the summary', () => {
    // The input summaries all carry numbers. Not one may survive into the field
    // `auditChange` holds to no-digits.
    expect(ALL.some((r) => hasDigit(r.summary))).toBe(true)
    for (const change of bind(ALL).changes) {
      expect(hasDigit(change.observation.summary), change.observation.summary).toBe(false)
    }
  })

  test('every figure cites a snapshot that is really in the evidence', () => {
    for (const change of bind(ALL).changes) {
      const ids = new Set(change.evidence.map((s) => s.id))
      for (const figure of change.observation.figures) {
        expect(ids.has(figure.snapshotId), `${change.id}/${figure.label}`).toBe(true)
      }
    }
  })

  test('evidence never borrows another competitor’s reads', () => {
    for (const change of bind(ALL).changes) {
      for (const snapshot of change.evidence) {
        expect(snapshot.competitorId).toBe(change.competitorId)
      }
    }
  })

  test('no reading is invented, because nothing generates one yet', () => {
    // An empty string would be an interpretation that said nothing. Null is the
    // absence the screen already knows how to draw.
    for (const change of bind(ALL).changes) expect(change.reading).toBeNull()
  })
})
