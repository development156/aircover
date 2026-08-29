import { describe, expect, it } from 'vitest'

import { ALL_KINDS, kindFacets, matchesQuery, type Categorised } from './kinds'
import { CATALOGUE } from './catalogue'

/**
 * The category rail's arithmetic, checked against the REAL catalogue rather than
 * a fixture wherever the claim is about this product. A fixture would let the
 * counts stay green after a channel was added, which is the one failure this
 * whole file exists to prevent.
 */

const entry = (label: string, kind: string, blurb = ''): Categorised => ({ label, kind, blurb })

describe('kindFacets', () => {
  it('counts every catalogue entry exactly once', () => {
    const facets = kindFacets(CATALOGUE)
    const all = facets.find((facet) => facet.id === ALL_KINDS)!

    expect(all.count).toBe(CATALOGUE.length)
    // The per-kind counts must SUM to the total. A facet that double-counts or
    // drops an entry passes every other assertion here and fails this one.
    expect(facets.filter((f) => f.id !== ALL_KINDS).reduce((n, f) => n + f.count, 0)).toBe(
      CATALOGUE.length,
    )
  })

  it('names every kind the catalogue uses, and invents none', () => {
    const facets = kindFacets(CATALOGUE).filter((facet) => facet.id !== ALL_KINDS)
    expect(new Set(facets.map((facet) => facet.id))).toEqual(
      new Set(CATALOGUE.map((entry) => entry.kind)),
    )
  })

  it('puts All first and keeps the catalogue’s own order after it', () => {
    const facets = kindFacets([
      entry('B', 'Broadcast'),
      entry('A', 'Social feed'),
      entry('C', 'Broadcast'),
    ])
    expect(facets.map((facet) => `${facet.id}:${facet.count}`)).toEqual([
      'all:3',
      'Broadcast:2',
      'Social feed:1',
    ])
  })

  it('has nothing to show for nothing', () => {
    expect(kindFacets([])).toEqual([{ id: ALL_KINDS, label: 'All', count: 0 }])
  })
})

describe('matchesQuery', () => {
  const instagram = entry('Instagram', 'Social feed', 'Publish posts, reels and stories.')

  it('matches an unfinished word, case-insensitively', () => {
    expect(matchesQuery(instagram, 'insta')).toBe(true)
    expect(matchesQuery(instagram, 'INSTAGRAM')).toBe(true)
  })

  it('searches the sentence and the category, not just the name', () => {
    expect(matchesQuery(instagram, 'reels')).toBe(true)
    expect(matchesQuery(instagram, 'social')).toBe(true)
  })

  it('narrows on every token rather than widening', () => {
    // Both words are present, in different fields.
    expect(matchesQuery(instagram, 'social instagram')).toBe(true)
    // One is not, so the whole query fails. An OR here would return the entire
    // catalogue for a two-word search, which reads as a search that ignored you.
    expect(matchesQuery(instagram, 'social telegram')).toBe(false)
  })

  it('treats an empty query as no search at all', () => {
    expect(matchesQuery(instagram, '')).toBe(true)
    expect(matchesQuery(instagram, '   ')).toBe(true)
  })

  it('finds nothing for a word nobody wrote', () => {
    expect(matchesQuery(instagram, 'zzz')).toBe(false)
  })
})
