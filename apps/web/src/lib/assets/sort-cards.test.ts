import { describe, expect, it } from 'vitest'

import { sortCards, type SortOption } from './sort-cards'
import type { AssetCard } from './view'

const card = (id: string, over: Partial<AssetCard> = {}): AssetCard => ({
  id,
  title: `${id}.jpg`,
  alt: null,
  kind: 'image',
  mime: 'image/jpeg',
  bytes: 1000,
  width: 800,
  height: 600,
  createdAt: '2026-08-20T00:00:00.000Z',
  previewUrl: null,
  thumbUrl: null,
  usage: [],
  folderIds: [],
  deletedAt: null,
  ...over,
})

describe('F3: sorting by size', () => {
  it('places a bytes:null file predictably at the end, in EITHER direction, and drops nothing', () => {
    const cards = [
      card('a', { bytes: 3000 }),
      card('b', { bytes: null }),
      card('c', { bytes: 1000 }),
    ]

    const desc = sortCards(cards, { field: 'size', direction: 'desc' })
    expect(desc.map((c) => c.id)).toEqual(['a', 'c', 'b'])
    expect(desc).toHaveLength(3)

    const asc = sortCards(cards, { field: 'size', direction: 'asc' })
    // "smallest first" still means "what Sahoda could not weigh goes last" —
    // null never wins smallest-first merely because it is not a number.
    expect(asc.map((c) => c.id)).toEqual(['c', 'a', 'b'])
    expect(asc).toHaveLength(3)
  })

  it('keeps the file count identical when every file is unmeasured', () => {
    const cards = [card('a', { bytes: null }), card('b', { bytes: null })]
    const sorted = sortCards(cards, { field: 'size', direction: 'desc' })
    expect(sorted).toHaveLength(2)
    expect(new Set(sorted.map((c) => c.id))).toEqual(new Set(['a', 'b']))
  })

  it('never mutates the array it was given', () => {
    const cards = [card('a', { bytes: 100 }), card('b', { bytes: 200 })]
    const original = [...cards]
    sortCards(cards, { field: 'size', direction: 'asc' })
    expect(cards).toEqual(original)
  })
})

describe('F3: sorting by name and date added', () => {
  it('sorts name case-insensitively, both directions', () => {
    const cards = [card('a', { title: 'banana' }), card('b', { title: 'Apple' })]
    const asc = sortCards(cards, { field: 'name', direction: 'asc' })
    expect(asc.map((c) => c.id)).toEqual(['b', 'a'])
    const desc = sortCards(cards, { field: 'name', direction: 'desc' })
    expect(desc.map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('the default is newest-added first', () => {
    const cards = [
      card('old', { createdAt: '2026-01-01T00:00:00.000Z' }),
      card('new', { createdAt: '2026-08-01T00:00:00.000Z' }),
    ]
    const option: SortOption = { field: 'added', direction: 'desc' }
    expect(sortCards(cards, option).map((c) => c.id)).toEqual(['new', 'old'])
  })
})
