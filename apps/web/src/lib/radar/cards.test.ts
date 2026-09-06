import { describe, expect, test } from 'vitest'

import { changedCount, watchCards } from './cards'
import type { Competitor, RadarDay } from './types'

function competitor(over: Partial<Competitor> = {}): Competitor {
  return {
    id: 'c1',
    name: 'Sunrise Bakery',
    url: 'https://sunrise.example',
    kind: 'website',
    addedOn: '2026-09-01',
    lastObservedAt: '2026-09-02T03:41:00.000Z',
    ...over,
  }
}

/** One day carrying `n` changes for `competitorId`, and nothing else. */
function dayWith(competitorId: string, n: number): RadarDay {
  return {
    date: '2026-09-02',
    attempts: [],
    changes: Array.from({ length: n }, (_unused, i) => ({
      id: `ch${i}`,
      competitorId,
      competitorName: 'Sunrise Bakery',
      kind: 'offer_appeared' as const,
      observedOn: '2026-09-02',
      evidence: [],
      observation: { summary: 'A new bundle appeared', figures: [] },
      reading: null,
    })),
  }
}

describe('what a card may claim', () => {
  test('read, and something moved: changed, with the count it holds evidence for', () => {
    const [card] = watchCards({
      collector: 'reading',
      competitors: [competitor()],
      days: [dayWith('c1', 2)],
    })
    expect(card!.status).toEqual({ claim: 'changed', count: 2 })
  })

  test('read, and nothing moved: the ONLY case that may say nothing changed', () => {
    const [card] = watchCards({ collector: 'reading', competitors: [competitor()], days: [] })
    expect(card!.status).toEqual({ claim: 'quiet' })
  })

  /**
   * ── THE TWO SENTENCES THE REFERENCE DESIGN COLLAPSES ──────────────────────
   * Both render as an empty card everywhere else in this category. Neither is
   * "quiet", and a reader who is told they are will believe a competitor had a
   * calm week when in fact nobody looked.
   */
  test('never read is NOT quiet', () => {
    const [card] = watchCards({
      collector: 'reading',
      competitors: [competitor({ lastObservedAt: null })],
      days: [],
    })
    expect(card!.status).toEqual({ claim: 'not-read' })
  })

  test('an unbound collector is NOT quiet, whatever the last read says', () => {
    const [card] = watchCards({
      collector: 'watch-list-only',
      competitors: [competitor()],
      days: [],
    })
    expect(card!.status).toEqual({ claim: 'unwired' })
  })

  test('an unbound collector may not report changes either, even with days present', () => {
    // Changes that reached this screen from somewhere other than a bound
    // collector are a count of our own plumbing, not of their business.
    const [card] = watchCards({
      collector: 'watch-list-only',
      competitors: [competitor()],
      days: [dayWith('c1', 3)],
    })
    expect(card!.status).toEqual({ claim: 'unwired' })
  })

  test('changes are counted per business, never pooled', () => {
    const cards = watchCards({
      collector: 'reading',
      competitors: [competitor(), competitor({ id: 'c2', name: 'The Mill House' })],
      days: [dayWith('c1', 2)],
    })
    expect(cards[0]!.status).toEqual({ claim: 'changed', count: 2 })
    expect(cards[1]!.status).toEqual({ claim: 'quiet' })
    expect(changedCount(cards)).toBe(1)
  })

  test('the order the store returned is the order the cards keep', () => {
    const cards = watchCards({
      collector: 'reading',
      competitors: [competitor({ id: 'b', name: 'B' }), competitor({ id: 'a', name: 'A' })],
      days: [],
    })
    expect(cards.map((c) => c.competitor.id)).toEqual(['b', 'a'])
  })
})
