import { describe, expect, it } from 'vitest'
import type { AssetFolder, AssetSmartFolder } from '@sahoda/shared'

import {
  contentsAt,
  folderTally,
  locationName,
  unfiledCount,
  type LibraryLocation,
} from '@/lib/assets/organize-view'
import type { AssetCard } from '@/lib/assets/view'

const NOW = new Date('2026-08-26T12:00:00.000Z')

const card = (id: string, over: Partial<AssetCard> = {}): AssetCard => ({
  id,
  title: `${id}.jpg`,
  alt: 'A description',
  kind: 'image',
  mime: 'image/jpeg',
  bytes: 120_000,
  width: 1600,
  height: 900,
  createdAt: '2026-08-25T09:00:00.000Z',
  previewUrl: null,
  thumbUrl: null,
  usage: [],
  folderIds: [],
  deletedAt: null,
  ...over,
})

const folder = (id: string, parent_id: string | null, name = id): AssetFolder => ({
  id,
  workspace_id: 'w',
  parent_id,
  name,
  created_by: null,
  created_at: '2026-08-26T00:00:00.000Z',
  updated_at: '2026-08-26T00:00:00.000Z',
})

const smartFolder = (id: string, query: AssetSmartFolder['query']): AssetSmartFolder => ({
  id,
  workspace_id: 'w',
  name: `smart ${id}`,
  query,
  created_by: null,
  created_at: '2026-08-26T00:00:00.000Z',
  updated_at: '2026-08-26T00:00:00.000Z',
})

// campaign → autumn, plus an unrelated root "brand"
const FOLDERS = [folder('campaign', null), folder('autumn', 'campaign'), folder('brand', null)]

describe('contentsAt — a real folder', () => {
  const cards = [
    card('direct', { folderIds: ['campaign'] }),
    card('nested', { folderIds: ['autumn'] }),
    card('elsewhere', { folderIds: ['brand'] }),
    card('nowhere'),
  ]

  it('shows only what is filed directly here by default', () => {
    const at: LibraryLocation = { at: 'folder', id: 'campaign', deep: false }
    const { files } = contentsAt(at, cards, FOLDERS, [], NOW, [])
    expect(files.map((f) => f.id)).toEqual(['direct'])
  })

  it('includes sub-folders when asked, which is the count Drive never shows', () => {
    const at: LibraryLocation = { at: 'folder', id: 'campaign', deep: true }
    const { files } = contentsAt(at, cards, FOLDERS, [], NOW, [])
    expect(files.map((f) => f.id)).toEqual(['direct', 'nested'])
  })

  it('lists the sub-folders of this folder and nothing deeper', () => {
    const at: LibraryLocation = { at: 'folder', id: 'campaign', deep: false }
    const { subfolders } = contentsAt(at, cards, FOLDERS, [], NOW, [])
    expect(subfolders.map((f) => f.id)).toEqual(['autumn'])
  })

  it('a file filed in two folders appears in BOTH, which is the whole point', () => {
    const both = [card('shopfront', { folderIds: ['campaign', 'brand'] })]
    const inCampaign = contentsAt(
      { at: 'folder', id: 'campaign', deep: false },
      both,
      FOLDERS,
      [],
      NOW,
      [],
    )
    const inBrand = contentsAt(
      { at: 'folder', id: 'brand', deep: false },
      both,
      FOLDERS,
      [],
      NOW,
      [],
    )
    expect(inCampaign.files.map((f) => f.id)).toEqual(['shopfront'])
    expect(inBrand.files.map((f) => f.id)).toEqual(['shopfront'])
  })

  it('a folder that no longer exists holds nothing rather than everything', () => {
    // The failure mode a `filter` with a missing key can produce: an unmatched
    // predicate that accidentally admits every row.
    const at: LibraryLocation = { at: 'folder', id: 'deleted', deep: true }
    expect(contentsAt(at, cards, FOLDERS, [], NOW, []).files).toEqual([])
  })
})

describe('contentsAt — a smart folder keeps what it could not check separate', () => {
  it('counts an undecidable file as unknown and leaves it out of the list', () => {
    const cards = [
      card('wide', { width: 1600, height: 900 }),
      card('tall', { width: 900, height: 1600 }),
      card('unmeasured', { width: null, height: null }),
    ]
    const smart = [
      smartFolder('s1', { mode: 'all', rules: [{ field: 'orientation', is: 'landscape' }] }),
    ]
    const { files, unknown } = contentsAt({ at: 'smart', id: 's1' }, cards, FOLDERS, smart, NOW, [])
    expect(files.map((f) => f.id)).toEqual(['wide'])
    // NOT 2 files, and NOT silently 1 file. One matched, one could not be told.
    expect(unknown).toBe(1)
  })

  it('a smart folder that no longer exists holds nothing and claims no unknowns', () => {
    const result = contentsAt({ at: 'smart', id: 'gone' }, [card('a')], FOLDERS, [], NOW, [])
    expect(result).toEqual({ files: [], unknown: 0, subfolders: [] })
  })

  it('finds files whose description is missing, which no Drive rule can express', () => {
    const cards = [card('described', { alt: 'A lit shopfront' }), card('bare', { alt: null })]
    const smart = [
      smartFolder('s2', { mode: 'all', rules: [{ field: 'description', is: 'missing' }] }),
    ]
    const { files, unknown } = contentsAt({ at: 'smart', id: 's2' }, cards, FOLDERS, smart, NOW, [])
    expect(files.map((f) => f.id)).toEqual(['bare'])
    // A missing description is a fact about the row, so nothing here is unknown.
    expect(unknown).toBe(0)
  })
})

describe('contentsAt — the derived folders still work and still own their meaning', () => {
  it('defers to the existing predicate rather than restating it', () => {
    const cards = [
      card('used', {
        usage: [{ postId: 'p1', postTitle: 'Diwali', postStatus: 'draft', variantStatuses: [] }],
      }),
      card('spare'),
    ]
    const inUse = contentsAt({ at: 'derived', id: 'in-use' }, cards, FOLDERS, [], NOW, [])
    const unused = contentsAt({ at: 'derived', id: 'unused' }, cards, FOLDERS, [], NOW, [])
    expect(inUse.files.map((f) => f.id)).toEqual(['used'])
    expect(unused.files.map((f) => f.id)).toEqual(['spare'])
  })
})

describe('contentsAt — the library root', () => {
  it('holds every file and lists only the top-level folders', () => {
    const cards = [card('a', { folderIds: ['autumn'] }), card('b')]
    const { files, subfolders } = contentsAt({ at: 'all' }, cards, FOLDERS, [], NOW, [])
    expect(files).toHaveLength(2)
    expect(subfolders.map((f) => f.id)).toEqual(['campaign', 'brand'])
  })
})

describe('folderTally', () => {
  const cards = [
    card('direct', { folderIds: ['campaign'] }),
    card('nested', { folderIds: ['autumn'] }),
    card('nowhere'),
  ]

  it('reports the direct count and the nested count as two numbers', () => {
    expect(folderTally('campaign', cards, FOLDERS)).toEqual({
      direct: 1,
      nested: 2,
      subfolders: 1,
    })
  })

  it('counts a file filed in both a folder and its sub-folder ONCE', () => {
    // Two membership rows, one file, one tile. A count that summed the rows
    // would say 2 and no amount of scrolling would find the second photo.
    const doubled = [card('both', { folderIds: ['campaign', 'autumn'] })]
    expect(folderTally('campaign', doubled, FOLDERS)).toEqual({
      direct: 1,
      nested: 1,
      subfolders: 1,
    })
  })

  it('a leaf folder reports nested equal to direct', () => {
    expect(folderTally('autumn', cards, FOLDERS)).toEqual({ direct: 1, nested: 1, subfolders: 0 })
  })
})

// ── "we did not look" is not "filed nowhere" ────────────────────────────────
// The composer's library picker builds cards without a memberships query. If
// `null` collapsed into `[]`, every photo in the composer would report as
// unfiled and the unfiled count on this screen would be wrong the moment
// anything reused that read.
describe('a card whose filings were never read', () => {
  it('is NOT counted as unfiled', () => {
    const cards = [card('unread', { folderIds: null }), card('genuinely-unfiled')]
    expect(unfiledCount(cards)).toBe(1)
  })

  it('is not placed in any folder, because membership was never established', () => {
    const cards = [card('unread', { folderIds: null })]
    const at: LibraryLocation = { at: 'folder', id: 'campaign', deep: true }
    expect(contentsAt(at, cards, FOLDERS, [], NOW, []).files).toEqual([])
  })

  it('does not inflate a folder tally', () => {
    const cards = [card('unread', { folderIds: null }), card('filed', { folderIds: ['campaign'] })]
    expect(folderTally('campaign', cards, FOLDERS)).toEqual({
      direct: 1,
      nested: 1,
      subfolders: 1,
    })
  })
})

describe('unfiledCount', () => {
  it('counts files filed nowhere', () => {
    const cards = [card('a', { folderIds: ['campaign'] }), card('b'), card('c')]
    expect(unfiledCount(cards)).toBe(2)
  })

  it('is zero when everything is filed, not when nothing is', () => {
    expect(unfiledCount([card('a', { folderIds: ['brand'] })])).toBe(0)
    expect(unfiledCount([])).toBe(0)
  })
})

describe('locationName', () => {
  const smart = [smartFolder('s1', { mode: 'all', rules: [{ field: 'kind', is: 'image' }] })]

  it('names each kind of place', () => {
    expect(locationName({ at: 'all' }, FOLDERS, smart)).toBe('All files')
    expect(locationName({ at: 'derived', id: 'in-use' }, FOLDERS, smart)).toBe('In use')
    expect(locationName({ at: 'folder', id: 'campaign', deep: false }, FOLDERS, smart)).toBe(
      'campaign',
    )
    expect(locationName({ at: 'smart', id: 's1' }, FOLDERS, smart)).toBe('smart s1')
  })

  it('says a deleted folder is gone rather than naming it or going blank', () => {
    // A header that renders an empty string reads as a stuck page, and a header
    // that silently says "All files" tells the person they are somewhere they
    // are not.
    const gone = locationName({ at: 'folder', id: 'deleted', deep: false }, FOLDERS, smart)
    expect(gone).not.toBe('')
    expect(gone.toLowerCase()).toContain('no longer here')
  })
})

// ── THE TRASH IS NOT A VIEW OVER THE LIBRARY ────────────────────────────────
describe('contentsAt: the trash', () => {
  it('returns the trashed list and NOT a filter of the live cards', () => {
    // The property that makes the separate parameter necessary. `readAssets`
    // excludes trashed rows in SQL, so if this ever tried to derive the trash
    // from `cards` it would always be empty — and an empty trash is the one
    // wrong answer a person cannot tell from a right one.
    const live = [card('live')]
    const gone = [card('gone', { deletedAt: '2026-08-26T00:00:00.000Z' })]
    const { files } = contentsAt({ at: 'trash' }, live, FOLDERS, [], NOW, gone)
    expect(files.map((f) => f.id)).toEqual(['gone'])
  })

  it('shows no sub-folders, at any location', () => {
    // A folder is not trashed by trashing the files in it. Rendering the live
    // tree here would invite a person to navigate INTO a folder from a place
    // where its contents mean something else entirely.
    const { subfolders } = contentsAt({ at: 'trash' }, [], FOLDERS, [], NOW, [card('gone')])
    expect(subfolders).toEqual([])
  })

  it('is empty when the trash is empty, even with a full library', () => {
    const { files } = contentsAt({ at: 'trash' }, [card('a'), card('b')], FOLDERS, [], NOW, [])
    expect(files).toEqual([])
  })
})
