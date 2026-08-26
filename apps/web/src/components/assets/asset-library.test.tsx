import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { AssetFolder } from '@sahoda/shared'

import type { AssetCard } from '@/lib/assets/view'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

const fileAssets = vi.fn()
const unfileAssets = vi.fn()
vi.mock('@/app/actions/asset-folder-items', () => ({
  fileAssets: (...args: unknown[]) => fileAssets(...args),
  unfileAssets: (...args: unknown[]) => unfileAssets(...args),
}))

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
}))

const { AssetLibrary } = await import('./asset-library')

/**
 * Two claims neither of which may be guessed:
 *
 * 1. Bulk filing reports the ADDED / ALREADY-THERE split the server action
 *    actually returned, never a count computed from how many tiles were
 *    ticked. `fileAssets` is mocked to return numbers that do NOT match the
 *    selection size on purpose, so a regression that starts computing the
 *    sentence from `selected.size` fails this test loudly.
 * 2. A card whose `folderIds` is `null` — "we did not read this" — never
 *    appears inside a real folder. Rendering it there would be the exact
 *    defect `organize-view.ts` exists to prevent, reported one layer up.
 */
const card = (id: string, over: Partial<AssetCard> = {}): AssetCard => ({
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
  ...over,
})

const folder = (id: string, name: string, parent_id: string | null = null): AssetFolder => ({
  id,
  workspace_id: 'w',
  parent_id,
  name,
  created_by: null,
  created_at: '2026-08-20T00:00:00.000Z',
  updated_at: '2026-08-20T00:00:00.000Z',
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('bulk filing', () => {
  it('reports the added/alreadyThere split the action returned, not the selection size', async () => {
    fileAssets.mockResolvedValue({ ok: true, added: 1, alreadyThere: 5 })
    const user = userEvent.setup()
    const cards = [card('a'), card('b'), card('c')]
    const folders = [folder('f1', 'Campaign')]

    render(
      <AssetLibrary
        cards={cards}
        capped={false}
        folders={folders}
        smart={[]}
        droppedSmart={0}
        droppedFolders={0}
        foldersUnreadable={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Select' }))
    // Two tiles ticked. The mocked return below claims different numbers —
    // 1 added and 5 already there — which is the whole point of the test.
    await user.click(screen.getByText('a.jpg'))
    await user.click(screen.getByText('b.jpg'))

    const bulkBar = screen.getByRole('region', { name: /bulk actions/i })
    await user.click(within(bulkBar).getByRole('button', { name: /file into folder/i }))
    await user.click(within(bulkBar).getByRole('button', { name: /^Campaign/ }))

    expect(await screen.findByText('Filed 1. 5 were already there.')).toBeInTheDocument()
    await waitFor(() =>
      expect(fileAssets).toHaveBeenCalledWith('f1', expect.arrayContaining(['a', 'b'])),
    )
  })
})

describe('a card whose filings were never read', () => {
  it('renders no claim that it is filed in a real folder', async () => {
    const user = userEvent.setup()
    const cards = [card('unread', { folderIds: null }), card('filed', { folderIds: ['f1'] })]
    const folders = [folder('f1', 'Campaign')]

    render(
      <AssetLibrary
        cards={cards}
        capped={false}
        folders={folders}
        smart={[]}
        droppedSmart={0}
        droppedFolders={0}
        foldersUnreadable={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: /^Campaign/ }))

    expect(await screen.findByText('filed.jpg')).toBeInTheDocument()
    expect(screen.queryByText('unread.jpg')).not.toBeInTheDocument()
  })
})
