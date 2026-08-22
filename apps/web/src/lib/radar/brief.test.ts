import { describe, expect, test } from 'vitest'

import { briefFromChange } from './brief'
import { FIXTURE_SNAPSHOT } from './fixtures'
import type { RadarChange } from './types'

/**
 * WHAT A BRIEF MAY CARRY INTO A GENERATOR.
 *
 * A brief is expanded by a model into copy a customer may publish, and that
 * transformation strips every visual signal this screen relies on. A hatched
 * inference arrives in a caption as a flat assertion. So the rule enforced here
 * is stricter than the rule on screen: the READING NEVER GOES IN, and only
 * figures whose snapshots resolve are quoted.
 */

const CHANGES = FIXTURE_SNAPSHOT.days.flatMap((day) => day.changes)

function find(id: string): RadarChange {
  const found = CHANGES.find((c) => c.id === id)
  if (!found) throw new Error(`fixture has no change ${id}`)
  return found
}

describe('briefFromChange', () => {
  test('quotes an observed figure with the date it was read on', () => {
    const change = find('chg-sun-weekend')
    const brief = briefFromChange(change, change.reading?.brandBasis ?? null)
    expect(brief.body).toContain('Weekend offer posts this month: 4 posts (read on 2026-08-21)')
  })

  test('never carries the reading, even when there is one', () => {
    const change = find('chg-sun-weekend')
    expect(change.reading).not.toBeNull()
    const brief = briefFromChange(change, change.reading?.brandBasis ?? null)
    // The inference's own words must not survive into something a model expands.
    expect(brief.body).not.toContain('This looks like')
    expect(brief.body).not.toContain('push on weekend footfall')
  })

  test('grounds the answer in the Brand Brain field it was given', () => {
    const change = find('chg-sun-weekend')
    const brief = briefFromChange(change, change.reading?.brandBasis ?? null)
    expect(brief.body).toContain('Same-day freshness, never day-old')
    expect(brief.body).toContain('Say what we do, not what they do.')
  })

  test('with no brand fact it says so rather than inventing a position', () => {
    const brief = briefFromChange(find('chg-corner-price'), null)
    expect(brief.body).toContain('no confirmed positioning in the Brand Brain')
    // The filler every competitor tool prints, explicitly absent.
    expect(brief.body).not.toMatch(/highlight your strengths|stand out from the competition/i)
  })

  test('drops a figure whose snapshot does not resolve', () => {
    const change = find('chg-corner-price')
    const tampered: RadarChange = {
      ...change,
      observation: {
        ...change.observation,
        figures: change.observation.figures.map((f) => ({ ...f, snapshotId: 'snap-gone' })),
      },
    }
    const brief = briefFromChange(tampered, null)
    expect(brief.body).not.toContain('120')
  })

  test('instructs the writer never to name the other business', () => {
    const brief = briefFromChange(find('chg-sun-weekend'), null)
    expect(brief.body).toContain('Do not name or refer to the other business')
  })

  test('clamps unbounded text so model input stays bounded', () => {
    const change = find('chg-corner-price')
    const long: RadarChange = {
      ...change,
      competitorName: 'N'.repeat(400),
      observation: { summary: 'A'.repeat(2000), figures: [] },
    }
    const brief = briefFromChange(long, null)
    expect([...brief.title].length).toBeLessThanOrEqual(120)
    expect([...brief.body].length).toBeLessThanOrEqual(900)
  })
})
