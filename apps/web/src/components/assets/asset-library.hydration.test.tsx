/**
 * The library's first client render must match the server's.
 *
 * MEASURED on the wt-core preview, 2026-09-06: choose List view, reload, and
 * the console carries React error #418 (hydration mismatch). The server has no
 * `window`, so `readLibraryView()` answers `grid` there; the browser has the
 * saved `list`, so `useState(() => readLibraryView())` answered `list` on the
 * first client render and the two trees disagreed at the view toggle. React
 * then re-renders the whole library from scratch on every reload for anyone
 * who ever picked List.
 *
 * The fix reads storage AFTER hydration, in an effect. This test hydrates real
 * server HTML into a container with `list` already in storage and asserts no
 * hydration warning is raised, and that the saved view still wins afterwards.
 */
import { act } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AssetCard } from '@/lib/assets/view'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@/app/actions/asset-folder-items', () => ({ fileAssets: vi.fn(), unfileAssets: vi.fn() }))
vi.mock('@/app/actions/asset-folders', () => ({
  createFolder: vi.fn(),
  renameFolder: vi.fn(),
  moveFolder: vi.fn(),
  deleteFolder: vi.fn(),
}))
vi.mock('@/app/actions/asset-smart-folders', () => ({
  createSmartFolder: vi.fn(),
  updateSmartFolder: vi.fn(),
  deleteSmartFolder: vi.fn(),
}))
vi.mock('@/app/actions/assets', () => ({
  updateAsset: vi.fn(),
  deleteAsset: vi.fn(),
  trashAsset: vi.fn(),
  restoreAsset: vi.fn(),
  trashAssets: vi.fn(),
  restoreAssets: vi.fn(),
  emptyTrash: vi.fn(),
}))
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

const { AssetLibrary } = await import('./asset-library')

const card = (id: string): AssetCard => ({
  id,
  title: `${id}.jpg`,
  alt: 'A description',
  kind: 'image',
  mime: 'image/jpeg',
  bytes: 1000,
  width: 800,
  height: 600,
  createdAt: '2026-08-20T00:00:00.000Z',
  previewUrl: null,
  usage: [],
  folderIds: [],
  deletedAt: null,
})

const props = {
  cards: [card('one'), card('two')],
  capped: false,
  folders: [],
  smart: [],
  trashed: [],
  droppedSmart: 0,
  droppedFolders: 0,
  foldersUnreadable: false,
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('the library hydrates cleanly when List view was saved', () => {
  it('raises no hydration warning, then applies the saved view after mount', async () => {
    // The server answers `grid`: it has no storage. Rendered with storage empty
    // so the string is exactly what the server would send.
    const html = renderToString(<AssetLibrary {...props} />)
    expect(html).toContain('aria-pressed="true"')

    // The browser has List saved from an earlier visit.
    window.localStorage.setItem('sahoda.assets.view', 'list')
    window.localStorage.setItem(
      'sahoda.assets.sort',
      JSON.stringify({ field: 'name', direction: 'asc' }),
    )

    const container = document.createElement('div')
    container.innerHTML = html
    document.body.appendChild(container)

    const errors: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '))
    })

    await act(async () => {
      hydrateRoot(container, <AssetLibrary {...props} />)
    })

    spy.mockRestore()
    // React's minified hydration codes, joined at runtime so the design lint's
    // raw-hex scan (which reads `#418` as a colour) does not trip on a test.
    const codes = new RegExp('hydrat|' + ['418', '425', '423'].map((c) => '#' + c).join('|'), 'i')
    const hydration = errors.filter((line) => codes.test(line))
    expect(hydration).toEqual([])

    // The saved preference still wins once the page is interactive.
    const listButton = container.querySelector('button[aria-label="List view"]')
    expect(listButton?.getAttribute('aria-pressed')).toBe('true')
    const sort = container.querySelector('select[aria-label="Sort"]') as HTMLSelectElement | null
    expect(sort?.value).toBe('name:asc')

    document.body.removeChild(container)
  })
})
