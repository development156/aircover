import { describe, expect, test } from 'vitest'

import { auditChange, hasDigit, resolveFigure } from './evidence'
import type { RadarChange, Snapshot } from './types'

/**
 * Every way a Radar claim can be dishonest, executed rather than described.
 *
 * The cases below are not hypothetical shapes: each is a way a real collector
 * fails. A snapshot id that no longer exists after a retention sweep. A change
 * assembled from two competitors' reads by a join on the wrong column. A model
 * asked for prose that returns a number in it anyway.
 */

const SNAP: Snapshot = {
  id: 'snap-1',
  competitorId: 'comp-1',
  observedAt: '2026-08-21T04:00:00.000Z',
  source: 'https://example.com/a',
}

function change(overrides: Partial<RadarChange> = {}): RadarChange {
  return {
    id: 'chg-1',
    competitorId: 'comp-1',
    competitorName: 'A Shop',
    kind: 'offer_appeared',
    observedOn: '2026-08-21',
    evidence: [SNAP],
    observation: { summary: 'An offer block appeared.', figures: [] },
    reading: null,
    ...overrides,
  }
}

describe('hasDigit', () => {
  test('finds a standalone number', () => {
    expect(hasDigit('posted 4 times')).toBe(true)
  })

  test('ignores digits welded into a word, matching the e2e regex', () => {
    // Same expression as roadmap-honesty.spec.ts, deliberately: two rules for
    // "what counts as a number on screen" would disagree, and the disagreement
    // would show up as one guard passing while the other failed.
    expect(hasDigit('the H2 heading')).toBe(false)
    expect(hasDigit('no numbers here at all')).toBe(false)
  })
})

describe('resolveFigure', () => {
  test('returns the value when the snapshot is in evidence', () => {
    expect(
      resolveFigure({ label: 'x', value: 4, unit: null, snapshotId: 'snap-1' }, [SNAP]),
    ).toEqual({ value: 4, observedAt: SNAP.observedAt })
  })

  test('refuses a snapshot that is not in THIS change evidence', () => {
    // The weaker check — "a snapshot with that id exists somewhere" — passes
    // for a figure copied from one competitor's card onto another's, which is
    // the failure that matters: real evidence, cited for a claim it does not
    // support.
    expect(
      resolveFigure({ label: 'x', value: 4, unit: null, snapshotId: 'snap-9' }, [SNAP]),
    ).toBeNull()
  })

  test('refuses an empty evidence set', () => {
    expect(resolveFigure({ label: 'x', value: 4, unit: null, snapshotId: 'snap-1' }, [])).toBeNull()
  })
})

describe('auditChange', () => {
  test('a well-formed change has nothing to say about it', () => {
    expect(auditChange(change())).toEqual([])
  })

  test('figures with no evidence at all are named', () => {
    const problems = auditChange(
      change({
        evidence: [],
        observation: {
          summary: 'Something moved.',
          figures: [{ label: 'Posts', value: 4, unit: null, snapshotId: 'snap-1' }],
        },
      }),
    )
    expect(problems).toHaveLength(2)
    expect(problems[0]).toContain('rests on no snapshot at all')
  })

  test('evidence borrowed from another competitor is named', () => {
    const problems = auditChange(change({ evidence: [{ ...SNAP, competitorId: 'comp-2' }] }))
    expect(problems).toEqual([
      'chg-1: rests on snapshot snap-1, which was taken of a different competitor (comp-2)',
    ])
  })

  test('a number spelled inside the observation prose is named', () => {
    // The bypass that looks innocent: the figure list is empty and clean, and
    // the number rides in the sentence beside it with no snapshot attached.
    const problems = auditChange(
      change({ observation: { summary: 'They posted 4 weekend offers.', figures: [] } }),
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('spells a number inside prose')
  })

  test('a reading that states a number is named', () => {
    const problems = auditChange(
      change({
        reading: { text: 'They appear to have cut prices by 15 percent.', brandBasis: null },
      }),
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('An inference is not a measurement')
  })

  test('a reading with no number is fine, grounded or not', () => {
    expect(
      auditChange({
        ...change(),
        reading: { text: 'This looks like a push on weekends.', brandBasis: null },
      }),
    ).toEqual([])
  })
})
