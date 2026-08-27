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

const toastState = {
  success: [] as unknown[][],
  plain: [] as unknown[][],
  error: [] as unknown[][],
}
// Kept only because other modules in this tree may still raise toasts; this
// file no longer asserts through it.
vi.mock('sonner', () => ({
  toast: Object.assign((...args: unknown[]) => toastState.plain.push(args), {
    success: (...args: unknown[]) => toastState.success.push(args),
    error: (...args: unknown[]) => toastState.error.push(args),
  }),
}))

const { AssetLibrary } = await import('./asset-library')

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

const folder = (id: string, name: string): AssetFolder => ({
  id,
  workspace_id: 'w',
  parent_id: null,
  name,
  created_by: null,
  created_at: '2026-08-20T00:00:00.000Z',
  updated_at: '2026-08-20T00:00:00.000Z',
})

beforeEach(() => {
  vi.clearAllMocks()
  toastState.success = []
  toastState.plain = []
  toastState.error = []
})

describe('typing a token filters the grid', () => {
  it('type:image keeps only images, and a typo names what Sahoda knows without filtering', async () => {
    const user = userEvent.setup()
    const cards = [card('photo', { kind: 'image' }), card('doc', { kind: 'document' })]

    render(
      <AssetLibrary
        cards={cards}
        capped={false}
        folders={[]}
        smart={[]}
        droppedSmart={0}
        droppedFolders={0}
        foldersUnreadable={false}
      />,
    )

    const search = screen.getByRole('searchbox')
    await user.type(search, 'type:image')
    expect(await screen.findByText('photo.jpg')).toBeInTheDocument()
    expect(screen.queryByText('doc.jpg')).not.toBeInTheDocument()

    await user.clear(search)
    await user.type(search, 'type:vidoe')
    // A typo never filters: both files are still on screen, and the message
    // says what Sahoda knows instead of returning nothing unexplained.
    expect(await screen.findByText('photo.jpg')).toBeInTheDocument()
    expect(screen.getByText('doc.jpg')).toBeInTheDocument()
    // Scoped to the message itself: the hint row also shows a "type:image"
    // example once the box has text, so a bare `getByText` finds two.
    expect(screen.getByRole('alert')).toHaveTextContent('type:image')
  })
})

describe('a narrowing search with an unknown-answer file', () => {
  it('states the unknown count separately from the matched files', async () => {
    const user = userEvent.setup()
    const cards = [
      card('wide', { width: 1600, height: 900 }),
      card('unmeasured', { width: null, height: null }),
    ]

    render(
      <AssetLibrary
        cards={cards}
        capped={false}
        folders={[]}
        smart={[]}
        droppedSmart={0}
        droppedFolders={0}
        foldersUnreadable={false}
      />,
    )

    await user.type(screen.getByRole('searchbox'), 'shape:landscape')

    expect(await screen.findByText('wide.jpg')).toBeInTheDocument()
    expect(screen.queryByText('unmeasured.jpg')).not.toBeInTheDocument()
    // The count sits beside its number in a `<span class="num">`, so the
    // sentence is two DOM text nodes — a custom matcher reads the element's
    // whole text rather than either node alone.
    expect(
      screen.getByText((_, element) => element?.textContent === '1 file could not be checked.'),
    ).toBeInTheDocument()
  })
})

describe('bulk filing', () => {
  /**
   * RETARGETED, NOT REWRITTEN. The guarantee is unchanged: the sentence carries
   * the SERVER's counts, and Undo removes only what THIS action added.
   *
   * It used to assert through a `sonner` mock. That library cost 33.1 kB on this
   * route (MEASURED, two builds) and put the screen over its JavaScript budget,
   * so the outcome is now rendered inline in the bulk bar. The delivery changed
   * and the claim did not, which is why this asserts the same two facts through
   * the DOM instead of through a mock's call log.
   */
  it('states the real added/alreadyThere counts, and Undo calls the inverse action', async () => {
    fileAssets.mockResolvedValue({ ok: true, added: 1, alreadyThere: 1 })
    unfileAssets.mockResolvedValue({ ok: true, removed: 1 })
    const user = userEvent.setup()
    const cards = [card('a', { folderIds: [] }), card('b', { folderIds: ['f1'] })]
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
    await user.click(screen.getByText('a.jpg'))
    await user.click(screen.getByText('b.jpg'))

    const bulkBar = screen.getByRole('region', { name: /bulk actions/i })
    await user.click(within(bulkBar).getByRole('button', { name: /file into folder/i }))
    await user.click(within(bulkBar).getByRole('button', { name: /^Campaign/ }))

    await waitFor(() =>
      expect(fileAssets).toHaveBeenCalledWith('f1', expect.arrayContaining(['a', 'b'])),
    )

    // The counts are the ACTION's, not the selection's: two files were sent and
    // the sentence must say one, because that is what the server reported.
    // Queried from the SCREEN, not from the bulk bar: filing clears the
    // selection and the bar unmounts, so a sentence that lived inside it would
    // vanish at the moment it became true.
    await waitFor(() =>
      expect(screen.getByText('Filed 1 to Campaign. 1 was already there.')).toBeInTheDocument(),
    )

    // "b" was already filed before this action; Undo must only remove what THIS
    // action added ("a"), never the filing that already existed.
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(unfileAssets).toHaveBeenCalledWith('f1', ['a']))
  })

  it('offers no Undo when the action added nothing, because there is nothing to put back', async () => {
    // Every selected photo was already in the folder. An Undo here would REMOVE
    // filings this action never made, which is the opposite of undoing.
    fileAssets.mockResolvedValue({ ok: true, added: 0, alreadyThere: 1 })
    const user = userEvent.setup()
    const cards = [card('b', { folderIds: ['f1'] })]
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
    await user.click(screen.getByText('b.jpg'))
    const bulkBar = screen.getByRole('region', { name: /bulk actions/i })
    await user.click(within(bulkBar).getByRole('button', { name: /file into folder/i }))
    await user.click(within(bulkBar).getByRole('button', { name: /^Campaign/ }))

    await waitFor(() => expect(fileAssets).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText(/1 was already there/)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
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
