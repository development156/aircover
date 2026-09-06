import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * The later reads: the page after the cap, the server search, the trash.
 *
 * Each hands the client the same `AssetCard` the page does, with the cursor or
 * the cap carried out honestly, and a failed read is a sentence rather than an
 * empty list.
 */

const state = vi.hoisted(() => ({
  older: { status: 'ok', assets: [], capped: false } as Record<string, unknown>,
  search: { status: 'ok', assets: [], capped: false } as Record<string, unknown>,
  trash: { status: 'ok', assets: [], capped: false } as Record<string, unknown>,
  askedOlder: [] as unknown[],
  askedSearch: [] as unknown[],
  signed: [] as { id: string; storage_path: string }[][],
  folderIds: new Map<string, string[]>() as Map<string, string[]> | null,
}))

vi.mock('@clerk/nextjs/server', () => ({ auth: () => Promise.resolve({ userId: 'user_abc' }) }))
vi.mock('@/lib/assets/read', () => ({
  readOlderAssets: (before: unknown) => {
    state.askedOlder.push(before)
    return Promise.resolve(state.older)
  },
  searchAssetsByText: (text: string) => {
    state.askedSearch.push(text)
    return Promise.resolve(state.search)
  },
  readTrashedAssets: () => Promise.resolve(state.trash),
}))
vi.mock('@/lib/assets/folders-read', () => ({
  readFolderIdsFor: () => Promise.resolve(state.folderIds),
}))
vi.mock('@/lib/posts/media-url', () => ({
  signMediaPreviews: (rows: { id: string; storage_path: string }[]) => {
    state.signed.push(rows)
    return Promise.resolve(rows.map((row) => ({ id: row.id, url: `signed:${row.storage_path}` })))
  },
}))
vi.mock('@/lib/observability/report', () => ({ reportServerError: vi.fn() }))

const { loadOlderAssets, loadTrash, searchAssets } = await import('./assets-list')

const asset = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  workspace_id: 'w',
  storage_path: `w/assets/${id}.png`,
  kind: 'image',
  mime: 'image/png',
  bytes: 10,
  width: 100,
  height: 80,
  alt: null,
  title: `${id}.png`,
  created_by: null,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
  deleted_at: null,
  ...over,
})

beforeEach(() => {
  state.older = { status: 'ok', assets: [], capped: false }
  state.search = { status: 'ok', assets: [], capped: false }
  state.trash = { status: 'ok', assets: [], capped: false }
  state.askedOlder = []
  state.askedSearch = []
  state.signed = []
  state.folderIds = new Map([['a', ['f1']]])
})

describe('loadOlderAssets', () => {
  test('passes the cursor through and carries the read’s cap out as `more`', async () => {
    state.older = {
      status: 'ok',
      assets: [{ asset: asset('a'), usage: [], thumbPath: 'w/derivatives/a/thumb.webp' }],
      capped: true,
    }

    const result = await loadOlderAssets('2026-09-01T00:00:00.000Z', 'z')

    expect(state.askedOlder).toEqual([{ createdAt: '2026-09-01T00:00:00.000Z', id: 'z' }])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.more).toBe(true)
    expect(result.cards).toHaveLength(1)
    const card = result.cards[0]
    // Original AND thumbnail signed in one pass, each keyed to its own id.
    expect(card?.previewUrl).toBe('signed:w/assets/a.png')
    expect(card?.thumbUrl).toBe('signed:w/derivatives/a/thumb.webp')
    expect(state.signed).toHaveLength(1)
    // Memberships read for the page, so it files exactly as the first page does.
    expect(card?.folderIds).toEqual(['f1'])
  })

  test('a failed read is a sentence, not an empty page', async () => {
    state.older = { status: 'unreadable' }

    const result = await loadOlderAssets('2026-09-01T00:00:00.000Z', 'z')

    expect(result.ok).toBe(false)
  })

  test('a failed membership read gives `folderIds: null`, never "filed nowhere"', async () => {
    state.older = {
      status: 'ok',
      assets: [{ asset: asset('a'), usage: [], thumbPath: null }],
      capped: false,
    }
    state.folderIds = null

    const result = await loadOlderAssets('2026-09-01T00:00:00.000Z', 'z')

    expect(result.ok && result.cards[0]?.folderIds).toBeNull()
  })
})

describe('searchAssets', () => {
  test('sends the words and carries the cap', async () => {
    state.search = {
      status: 'ok',
      assets: [{ asset: asset('a'), usage: [], thumbPath: null }],
      capped: true,
    }

    const result = await searchAssets('shop')

    expect(state.askedSearch).toEqual(['shop'])
    expect(result).toMatchObject({ ok: true, capped: true })
    if (!result.ok) return
    expect(result.cards.map((card) => card.id)).toEqual(['a'])
  })
})

describe('loadTrash', () => {
  test('returns the trashed cards with their deletion time and the cap', async () => {
    state.trash = {
      status: 'ok',
      assets: [
        {
          asset: asset('t', { deleted_at: '2026-09-03T00:00:00.000Z' }),
          usage: [],
          thumbPath: null,
        },
      ],
      capped: false,
    }

    const result = await loadTrash()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.cards[0]?.deletedAt).toBe('2026-09-03T00:00:00.000Z')
    expect(result.capped).toBe(false)
  })

  test('an unreadable trash says so, and does not claim it is empty', async () => {
    state.trash = { status: 'unreadable' }

    const result = await loadTrash()

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/not a claim that it is empty/i)
  })
})
