import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

const trashAsset = vi.fn()
const restoreAsset = vi.fn()
vi.mock('@/app/actions/assets', () => ({
  updateAsset: vi.fn(),
  deleteAsset: vi.fn(),
  trashAsset: (...args: unknown[]) => trashAsset(...args),
  restoreAsset: (...args: unknown[]) => restoreAsset(...args),
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
  deletedAt: null,
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
        trashed={[]}
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
        trashed={[]}
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
        trashed={[]}
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
        trashed={[]}
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
        trashed={[]}
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

// ── THE TRAP THE TRASH WOULD OTHERWISE WALK STRAIGHT INTO ───────────────────
describe('an empty library with a full trash', () => {
  it('renders the LIBRARY, not the empty state, so the trash stays reachable', async () => {
    // Delete your only photo and the live list empties. If the empty-state
    // early return fired on `cards.length === 0` alone, the whole screen would
    // be replaced and the one control that could bring that photo back would go
    // with it — the trash would be useless in the exact case it exists for.
    render(
      <AssetLibrary
        cards={[]}
        capped={false}
        folders={[]}
        smart={[]}
        trashed={[card('gone', { deletedAt: '2026-08-26T00:00:00.000Z' })]}
        droppedSmart={0}
        droppedFolders={0}
        foldersUnreadable={false}
      />,
    )

    expect(screen.queryByText('Your library is empty')).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /^Trash/ })).toBeInTheDocument()
  })

  it('still shows the empty state when the trash is empty too', async () => {
    // The other half. Without this, the guard above could be satisfied by
    // deleting the empty state entirely, which would leave a person with no
    // photos looking at a bare grid and no invitation to add one.
    render(
      <AssetLibrary
        cards={[]}
        capped={false}
        folders={[]}
        smart={[]}
        trashed={[]}
        droppedSmart={0}
        droppedFolders={0}
        foldersUnreadable={false}
      />,
    )

    expect(await screen.findByText('Your library is empty')).toBeInTheDocument()
  })
})

describe('the trash view', () => {
  it('lists the trashed file with how long ago it went, and offers Restore', async () => {
    const user = userEvent.setup()
    render(
      <AssetLibrary
        cards={[card('live')]}
        capped={false}
        folders={[]}
        smart={[]}
        trashed={[card('gone', { deletedAt: '2026-08-26T00:00:00.000Z' })]}
        droppedSmart={0}
        droppedFolders={0}
        foldersUnreadable={false}
      />,
    )

    await user.click(await screen.findByRole('button', { name: /^Trash/ }))

    expect(await screen.findByText('gone.jpg')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restore gone.jpg' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Delete gone.jpg/ })).toBeInTheDocument()
    // The live file is NOT in this list. Two separate reads, and mixing them
    // would offer Restore on a file that was never deleted.
    expect(screen.queryByText('live.jpg')).not.toBeInTheDocument()
  })

  it('never promises a retention period, because nothing sweeps the column', async () => {
    // The claim this screen must not make. No scheduled job reads `deleted_at`,
    // so "deleted after 30 days" would be a promise no process could keep.
    const user = userEvent.setup()
    render(
      <AssetLibrary
        cards={[]}
        capped={false}
        folders={[]}
        smart={[]}
        trashed={[card('gone', { deletedAt: '2026-08-26T00:00:00.000Z' })]}
        droppedSmart={0}
        droppedFolders={0}
        foldersUnreadable={false}
      />,
    )

    await user.click(await screen.findByRole('button', { name: /^Trash/ }))
    const body = document.body.textContent ?? ''
    expect(body).not.toMatch(/\b\d+\s*days?\b(?![^.]*ago)/i)
    expect(body).toMatch(/until you delete them for good/i)
  })
})

// ── DRAG A PHOTO ONTO A FOLDER ──────────────────────────────────────────────
/**
 * jsdom implements neither `DataTransfer` nor drag-and-drop, so the events are
 * fired by hand with a stub that behaves like the real one in the two ways this
 * code depends on: `types` lists what was set, and `getData` returns it. A stub
 * that got either wrong would make these tests agree with themselves and with
 * nothing else, so both are exercised through the real `isAssetDrag` and
 * `decodeAssetDrag` rather than being asserted directly.
 */
function stubDataTransfer() {
  const store = new Map<string, string>()
  return {
    get types() {
      return [...store.keys()]
    },
    setData: (type: string, value: string) => void store.set(type, value),
    getData: (type: string) => store.get(type) ?? '',
    effectAllowed: '',
    dropEffect: '',
  }
}

describe('dragging a file onto a folder files it', () => {
  it('files the dragged photo through the same action the menu uses', async () => {
    fileAssets.mockResolvedValue({ ok: true, added: 1, alreadyThere: 0 })

    render(
      <AssetLibrary
        cards={[card('shopfront')]}
        capped={false}
        folders={[folder('f1', 'Diwali')]}
        smart={[]}
        trashed={[]}
        droppedSmart={0}
        droppedFolders={0}
        foldersUnreadable={false}
      />,
    )

    // Located by its NAME on screen, then walked up to the button that
    // actually carries the drag — the same element a person grabs.
    const label = await screen.findByText('shopfront.jpg')
    const tile = label.closest('button')
    expect(tile).not.toBeNull()
    const target = screen.getByRole('button', { name: /^Diwali/ })
    const dataTransfer = stubDataTransfer()

    fireEvent.dragStart(tile as HTMLElement, { dataTransfer })
    fireEvent.dragEnter(target, { dataTransfer })
    fireEvent.drop(target, { dataTransfer })

    await waitFor(() => expect(fileAssets).toHaveBeenCalled())
    // The FOLDER id and the FILE id, in that order — the action's own shape.
    expect(fileAssets).toHaveBeenCalledWith('f1', ['shopfront'])
  })

  it('a foreign drag never reaches fileAssets', async () => {
    // A desktop file drop, or text dragged from another page. Both reach the
    // same handler and neither may file anything.
    //
    // ── WHAT THIS DOES AND DOES NOT PROVE ────────────────────────────────────
    // MEASURED: removing the `isAssetDrag` check from `onDrop` leaves this test
    // GREEN, because `getData` for our MIME returns '' on a foreign drag, that
    // decodes to [], and the length check stops it. So this asserts the OUTCOME
    // and there are two independent mechanisms behind it — which is a fine
    // thing to have, but it means this test is not evidence that the type check
    // works. The test below is; it covers the half only the type check can do.
    fileAssets.mockClear()

    render(
      <AssetLibrary
        cards={[card('shopfront')]}
        capped={false}
        folders={[folder('f1', 'Diwali')]}
        smart={[]}
        trashed={[]}
        droppedSmart={0}
        droppedFolders={0}
        foldersUnreadable={false}
      />,
    )

    const target = await screen.findByRole('button', { name: /^Diwali/ })
    const dataTransfer = stubDataTransfer()
    dataTransfer.setData('text/plain', 'some text from elsewhere')

    fireEvent.dragEnter(target, { dataTransfer })
    fireEvent.drop(target, { dataTransfer })

    expect(fileAssets).not.toHaveBeenCalled()
  })
})

describe('the type check is what makes a refusal VISIBLE', () => {
  /**
   * The half `onDrop`'s length check cannot do.
   *
   * A folder must not light up for a drag it cannot accept. `isAssetDrag` in
   * `onDragEnter` / `onDragOver` is the only thing deciding that: the payload is
   * unreadable during a drag in every browser (`getData` returns '' until
   * `drop`), so nothing downstream can tell. Without it, dragging a desktop
   * file across the sidebar highlights every folder it passes and then files
   * nothing — which reads as a broken product rather than a refused gesture.
   */
  it('a folder does NOT highlight for a drag it cannot accept', async () => {
    render(
      <AssetLibrary
        cards={[card('shopfront')]}
        capped={false}
        folders={[folder('f1', 'Diwali')]}
        smart={[]}
        trashed={[]}
        droppedSmart={0}
        droppedFolders={0}
        foldersUnreadable={false}
      />,
    )

    const target = await screen.findByRole('button', { name: /^Diwali/ })
    const row = target.parentElement as HTMLElement

    const foreign = stubDataTransfer()
    foreign.setData('text/plain', 'text from elsewhere')
    fireEvent.dragEnter(target, { dataTransfer: foreign })
    expect(row.querySelector('.ring-accent')).toBeNull()

    // And the premise: a drag it CAN accept does highlight. Without this the
    // guard above would pass just as well on a row that never highlights at
    // all, which is a different bug wearing the same green tick.
    const ours = stubDataTransfer()
    const tile = (await screen.findByText('shopfront.jpg')).closest('button') as HTMLElement
    fireEvent.dragStart(tile, { dataTransfer: ours })
    fireEvent.dragEnter(target, { dataTransfer: ours })
    expect(row.querySelector('.ring-accent')).not.toBeNull()
  })
})
