import { describe, it, expect } from 'vitest'

import { ASSET_FOLDERS, PEEK, folderCounts, folderMeta } from './folders'
import type { AssetCard } from './view'

/**
 * THE COUNT UNDER A FOLDER IS A PROMISE ABOUT THE LIST BELOW IT.
 *
 * These folders exist because the named ones asked for (Brand Assets, Campaigns,
 * …) had no column behind them, so "12 assets" would have been a number no query
 * could produce. That makes ONE property load-bearing: every count here must be
 * exactly what the same predicate selects. A folder saying 3 over a list of 2 is
 * the defect this whole design was chosen to avoid, reintroduced.
 *
 * So these tests never assert a literal. They assert the IDENTITY between the
 * count and the filter — which is the only thing that cannot rot when the
 * fixtures change.
 */
const card = (over: Partial<AssetCard>): AssetCard => ({
  id: crypto.randomUUID(),
  title: null,
  alt: null,
  kind: 'image',
  mime: 'image/png',
  bytes: 100,
  width: 10,
  height: 10,
  createdAt: '2026-08-25T00:00:00Z',
  previewUrl: null,
  usage: [],
  folderIds: [],
  deletedAt: null,
  ...over,
})

const usage = [{ postId: 'p1' }] as unknown as AssetCard['usage']

describe('asset folders', () => {
  it('counts exactly what its own filter selects, for every folder', () => {
    const cards = [
      card({ kind: 'image', usage: [] }),
      card({ kind: 'image', usage }),
      card({ kind: 'video', usage }),
    ]
    const counts = folderCounts(cards)

    // The identity, not a literal. If someone rewrites `match` and forgets the
    // count, or counts one thing and filters another, this is red.
    for (const folder of ASSET_FOLDERS) {
      expect(counts[folder.id], `${folder.name} count disagrees with its filter`).toBe(
        cards.filter(folder.match).length,
      )
    }
  })

  it('reports zero rather than dropping the folder', () => {
    // A folder that vanishes when it empties makes its absence something a
    // person has to interpret. "There is no Not used yet folder" and "nothing is
    // unused" are different sentences.
    const counts = folderCounts([card({ kind: 'image', usage })])

    expect(counts.unused).toBe(0)
    expect(Object.keys(counts)).toHaveLength(ASSET_FOLDERS.length)
  })

  it('splits in-use from unused with no file in both and none in neither', () => {
    // The two usage folders must PARTITION the library. An asset in both would
    // be double-counted against a library that holds it once.
    const cards = [card({ usage: [] }), card({ usage }), card({ usage: [] })]
    const inUse = ASSET_FOLDERS.find((f) => f.id === 'in-use')!
    const unused = ASSET_FOLDERS.find((f) => f.id === 'unused')!

    for (const c of cards) {
      expect(inUse.match(c) === unused.match(c), 'a file is in both folders or neither').toBe(false)
    }
    const counts = folderCounts(cards)
    expect(counts['in-use'] + counts.unused).toBe(cards.length)
  })

  it('reports the NEWEST file in each folder, not the first it walked past', () => {
    // Order of the input must not decide the answer. Built deliberately with the
    // newest in the middle, because a max written as "last one wins" and a max
    // written as "first one wins" both pass on a sorted fixture.
    const cards = [
      card({ createdAt: '2026-01-01T00:00:00Z' }),
      card({ createdAt: '2026-08-24T00:00:00Z' }),
      card({ createdAt: '2026-03-01T00:00:00Z' }),
    ]

    expect(folderMeta(cards).image.lastAdded).toBe('2026-08-24T00:00:00Z')
  })

  it('says NULL for an empty folder rather than inventing a date', () => {
    // "There is no newest file" and "the newest file is today" are different
    // claims. A fallback date here would make an empty folder state the second.
    const meta = folderMeta([card({ kind: 'image', usage })])

    expect(meta.unused.count).toBe(0)
    expect(meta.unused.lastAdded).toBeNull()
    expect(meta['in-use'].lastAdded).not.toBeNull()
  })

  it('peeks the NEWEST photos, newest first, capped', () => {
    // The photo on top of the stack must be the one the date line underneath is
    // talking about, so order is part of the claim and not decoration.
    const cards = [
      card({ createdAt: '2026-01-01T00:00:00Z', previewUrl: 'old' }),
      card({ createdAt: '2026-08-24T00:00:00Z', previewUrl: 'newest' }),
      card({ createdAt: '2026-03-01T00:00:00Z', previewUrl: 'mid' }),
    ]

    expect(folderMeta(cards).image.previews).toEqual(['newest', 'mid'])
    expect(folderMeta(cards).image.previews.length).toBeLessThanOrEqual(PEEK)
  })

  it('drops files whose preview link did not sign, and never invents one', () => {
    // signMediaPreviews degrades to null per row. A folder still COUNTS those
    // files — it holds them — but cannot show a picture it does not have.
    const cards = [
      card({ createdAt: '2026-08-24T00:00:00Z', previewUrl: null }),
      card({ createdAt: '2026-08-23T00:00:00Z', previewUrl: 'signed' }),
    ]
    const meta = folderMeta(cards).image

    expect(meta.count).toBe(2)
    expect(meta.previews).toEqual(['signed'])
  })

  it('has no folder for a kind the product cannot accept', () => {
    // Videos and documents render as inert "not yet" chips because nothing can
    // upload them. A folder for them would be a container for a thing that
    // cannot exist.
    expect(ASSET_FOLDERS.map((f) => f.id)).not.toContain('video')
    expect(ASSET_FOLDERS.map((f) => f.id)).not.toContain('document')
  })
})
