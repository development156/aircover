import { describe, it, expect } from 'vitest'
import { creditCost, type AutonomyLevel, type Channel } from '@sahoda/shared'

import { proposeFestivals } from './propose'

const DRAFT = creditCost('post_variants')
const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

const dial = (entries: [Channel, AutonomyLevel][]) => new Map<Channel, AutonomyLevel>(entries)

const PARAMS = {
  channels: ['instagram', 'linkedin'],
  calendars: ['india', 'global'],
  lead_days: 7,
}

describe('what a festival run proposes', () => {
  it('prices each item at the dial’s level, and charges NOTHING at L0', () => {
    const at = (level: AutonomyLevel) =>
      proposeFestivals(
        PARAMS,
        dial([
          ['instagram', level],
          ['linkedin', level],
        ]),
        'post_variants',
        day(2026, 1, 20),
      )
    // At L0 the item IS the suggestion: no model is called, so a price would be
    // a charge for work nobody does.
    expect(at(0).items.map((i) => i.estimatedCredits)).toEqual([0])
    expect(at(1).items.map((i) => i.estimatedCredits)).toEqual([DRAFT])
    expect(at(2).items.map((i) => i.estimatedCredits)).toEqual([DRAFT])
  })

  it('takes the MOST CAUTIOUS level across the channels, not the first', () => {
    // One item is one post with one body and one schedule, so there is no way to
    // act at L1 for Instagram and L0 for LinkedIn. The lowest governs.
    const mixed = proposeFestivals(
      PARAMS,
      dial([
        ['instagram', 2],
        ['linkedin', 0],
      ]),
      'post_variants',
      day(2026, 1, 20),
    )
    expect(mixed.items[0]!.estimatedCredits).toBe(0)
    expect(mixed.triggerDetail.autonomy_level).toBe(0)
  })

  it('proposes NOTHING when the window is empty, and that is not a failure', () => {
    const quiet = proposeFestivals(PARAMS, dial([]), 'post_variants', day(2026, 3, 20))
    expect(quiet.items).toEqual([])
    // The detail still records what was looked for, so "why did this run do
    // nothing" is answerable from the row.
    expect(quiet.triggerDetail.festivals).toEqual([])
    expect(quiet.triggerDetail.lead_days).toBe(7)
  })

  it('records WHICH festivals set it off, with their dates', () => {
    // Twenty days of warning rather than seven, so the window reaches across the
    // year end and the wrap is part of what is recorded.
    const p = proposeFestivals(
      { ...PARAMS, lead_days: 20 },
      dial([]),
      'post_variants',
      day(2026, 12, 20),
    )
    expect(p.triggerDetail.festivals).toEqual([
      { key: 'christmas', on: '2026-12-25' },
      { key: 'new-years-eve', on: '2026-12-31' },
      { key: 'new-year', on: '2027-01-01' },
    ])
  })

  it('suggests a slot the day BEFORE, not the morning of', () => {
    const p = proposeFestivals(PARAMS, dial([]), 'post_variants', day(2026, 1, 20))
    expect(p.items[0]!.suggestedSlot).toBe('2026-01-25T00:00:00.000Z')
  })

  it('carries the channels as a set, de-duplicated', () => {
    const p = proposeFestivals(
      { ...PARAMS, channels: ['instagram', 'instagram', 'linkedin'] },
      dial([]),
      'post_variants',
      day(2026, 1, 20),
    )
    expect(p.items[0]!.channels).toEqual(['instagram', 'linkedin'])
  })

  it('refuses parameters that are not this recipe’s shape', () => {
    expect(() =>
      proposeFestivals({ channels: [] }, dial([]), 'post_variants', new Date()),
    ).toThrow()
  })

  it('writes a brief that steers away from a stock greeting', () => {
    const p = proposeFestivals(PARAMS, dial([]), 'post_variants', day(2026, 1, 20))
    // The one thing a festival post must not be. Asserted on the CLAIM, not the
    // wording, so the sentence can be rewritten freely.
    expect(p.items[0]!.body).toMatch(/stock greeting/i)
    expect(p.items[0]!.title).toBe('Republic Day')
  })
})
