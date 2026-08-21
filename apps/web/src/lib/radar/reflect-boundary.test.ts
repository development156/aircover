import { describe, expect, test } from 'vitest'

import { reflect } from '@/lib/loop/reflect'
import { FIXTURE_SNAPSHOT } from './fixtures'

/**
 * A COMPETITOR'S MOVE IS AN OBSERVATION, NOT A PERFORMANCE INSIGHT.
 *
 * ── THE HONESTY THIS PROTECTS ───────────────────────────────────────────────
 * `reflect()` refuses to produce a learning until four gates pass, and on a
 * workspace with no measurements at all it returns `no_history` and calls no
 * model. That refusal is one of the most valuable things in the product: it is
 * the difference between "we have nothing to tell you yet" and a fabricated
 * insight built from two data points.
 *
 * Radar arrives as a NEW SOURCE OF SIGNAL, and the tempting wiring is to let a
 * competitor change count as something to reflect on — a workspace with no posts
 * would then have "something to say" for the first time. It would be a lie of a
 * particular kind: a real observation about SOMEONE ELSE, reported in the slot
 * reserved for findings about the READER'S OWN performance.
 *
 * FSD M2 already puts Radar in the right stage. The digest is an input to
 * COLLECT (stage 1), alongside metrics and calendar events; REFLECT (stage 2) is
 * the insight pass over the workspace's own numbers. This file holds that line.
 *
 * ── WHY THE CHECK IS SHAPE-BASED AND NOT A CALL ASSERTION ───────────────────
 * "reflect is not called with radar data" is a claim about today's callers and
 * says nothing about tomorrow's. What is asserted instead is that a Radar change
 * CANNOT BE CONVERTED into the thing reflect consumes or the thing it emits —
 * it has no `post_id`, no `metric`, no `value` and no `measured_on`, and a
 * `PendingLearning`'s evidence needs a sampleSize and a postCount that no
 * observation of a stranger's page could ever supply.
 */

const CHANGES = FIXTURE_SNAPSHOT.days.flatMap((day) => day.changes)

describe('Radar signals cannot reach the Reflect stage', () => {
  test('the fixture really does carry changes, so the checks below are not vacuous', () => {
    expect(CHANGES.length).toBeGreaterThan(0)
  })

  test('no Radar change carries the fields a MetricObservation requires', () => {
    for (const change of CHANGES) {
      const asRecord = change as unknown as Record<string, unknown>
      // Every field `reflect()` reads off an observation.
      for (const field of ['post_id', 'channel', 'metric', 'value', 'measured_on']) {
        expect(asRecord[field], `${change.id} carries ${field}`).toBeUndefined()
      }
    }
  })

  test('a workspace with Radar changes and no measurements still has nothing to reflect on', () => {
    // The honest answer, unchanged by the existence of competitor observations.
    const result = reflect([])
    expect(result).toEqual({ learnings: [], reason: 'no_history', skippedNoHistory: true })
  })

  /**
   * The figures a Radar change DOES carry are about the competitor, and none of
   * them is a sample size or a post count. Feeding an observed figure in as a
   * metric value would need a `post_id` this product does not have — there is no
   * post of the reader's for it to name.
   */
  test('an observed figure has no post to attach a measurement to', () => {
    const figures = CHANGES.flatMap((c) => c.observation.figures)
    expect(figures.length).toBeGreaterThan(0)
    for (const figure of figures) {
      expect(Object.keys(figure).sort()).toEqual(['label', 'snapshotId', 'unit', 'value'])
    }
  })
})
