import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { AssetFolder } from '@sahoda/shared'

import type { AssetCard } from '@/lib/assets/view'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

beforeEach(() => {
  // `<dialog>` is not implemented in jsdom, and the empty-trash confirmation
  // renders through `Modal`, which only ever calls these two. Same stub
  // `shortcut-sheet.test.tsx` and `crop-decline.test.tsx` use for the same
  // reason — a dialog-backed overlay cannot be tested here without it.
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false
  })
})

const fileAssets = vi.fn()
const unfileAssets = vi.fn()
vi.mock('@/app/actions/asset-folder-items', () => ({
  fileAssets: (...args: unknown[]) => fileAssets(...args),
  unfileAssets: (...args: unknown[]) => unfileAssets(...args),
}))

const moveFolder = vi.fn()
vi.mock('@/app/actions/asset-folders', () => ({
  createFolder: vi.fn(),
  renameFolder: vi.fn(),
  moveFolder: (...args: unknown[]) => moveFolder(...args),
  deleteFolder: vi.fn(),
}))

vi.mock('@/app/actions/asset-smart-folders', () => ({
  createSmartFolder: vi.fn(),
  updateSmartFolder: vi.fn(),
  deleteSmartFolder: vi.fn(),
}))

const trashAsset = vi.fn()
const restoreAsset = vi.fn()
const trashAssets = vi.fn()
const restoreAssets = vi.fn()
const emptyTrash = vi.fn()
vi.mock('@/app/actions/assets', () => ({
  updateAsset: vi.fn(),
  deleteAsset: vi.fn(),
  trashAsset: (...args: unknown[]) => trashAsset(...args),
  restoreAsset: (...args: unknown[]) => restoreAsset(...args),
  trashAssets: (...args: unknown[]) => trashAssets(...args),
  restoreAssets: (...args: unknown[]) => restoreAssets(...args),
  emptyTrash: (...args: unknown[]) => emptyTrash(...args),
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
/**
 * Let React's pending transitions run before a NEGATIVE assertion.
 *
 * MEASURED, and it invalidated three tests in this file: every action here goes
 * through `startTransition`, so `expect(fn).not.toHaveBeenCalled()` fired
 * immediately after a `fireEvent` passes whether or not the call was about to
 * happen. Mutating `canAcceptFolder` to `() => true` left the self-drop test
 * GREEN for exactly that reason. A negative assertion with no settle is a
 * negative assertion about nothing.
 */
async function settle() {
  await act(async () => {
    await Promise.resolve()
  })
}

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
    await settle()

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

// ── SHIFT-CLICK AND SELECT ALL, THROUGH THE REAL SCREEN ─────────────────────
describe('selecting more than one file', () => {
  it('shift-click selects the range between two tiles', async () => {
    const user = userEvent.setup()
    render(
      <AssetLibrary
        cards={[card('one'), card('two'), card('three')]}
        capped={false}
        folders={[]}
        smart={[]}
        trashed={[]}
        droppedSmart={0}
        droppedFolders={0}
        foldersUnreadable={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Select' }))

    const tileFor = (name: string) =>
      screen.getByText(`${name}.jpg`).closest('button') as HTMLElement

    // Default sort is newest-added first and every fixture shares a timestamp,
    // so the order on screen is the order given. Clicking the first and
    // shift-clicking the last must take all three.
    await user.click(tileFor('one'))
    // Shift is HELD across the click, which is the only way user-event applies
    // it — a `{ shiftKey: true }` option on `click` is silently ignored and the
    // test then passes a plain click off as a range. That mistake showed up
    // here as "2 files selected" instead of 3.
    await user.keyboard('{Shift>}')
    await user.click(tileFor('three'))
    await user.keyboard('{/Shift}')

    const bar = await screen.findByRole('region', { name: 'Bulk actions' })
    await waitFor(() => expect(bar.textContent).toMatch(/3\s*files selected/))
  })

  it('a plain click after a range does not extend it', async () => {
    // The premise for the guard above: without this, a test that selected
    // everything by accident would look identical.
    const user = userEvent.setup()
    render(
      <AssetLibrary
        cards={[card('one'), card('two'), card('three')]}
        capped={false}
        folders={[]}
        smart={[]}
        trashed={[]}
        droppedSmart={0}
        droppedFolders={0}
        foldersUnreadable={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Select' }))
    await user.click(screen.getByText('one.jpg').closest('button') as HTMLElement)

    const bar = screen.getByRole('region', { name: 'Bulk actions' })
    expect(bar.textContent).toMatch(/1\s*file selected/)
  })

  it('Select all takes everything on screen, and then reads Select none', async () => {
    const user = userEvent.setup()
    render(
      <AssetLibrary
        cards={[card('one'), card('two')]}
        capped={false}
        folders={[]}
        smart={[]}
        trashed={[]}
        droppedSmart={0}
        droppedFolders={0}
        foldersUnreadable={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Select' }))
    await user.click(screen.getByRole('button', { name: 'Select all' }))

    const bar = screen.getByRole('region', { name: 'Bulk actions' })
    expect(bar.textContent).toMatch(/2\s*files selected/)

    // The label states what the next press DOES. A button reading "All
    // selected" would be a status pretending to be a control.
    await user.click(screen.getByRole('button', { name: 'Select none' }))
    expect(screen.queryByRole('region', { name: 'Bulk actions' })).not.toBeInTheDocument()
  })

  it('Select all is not offered before select mode is on', async () => {
    // It would have nothing to act on, and a control that does nothing is
    // worse than no control.
    render(
      <AssetLibrary
        cards={[card('one')]}
        capped={false}
        folders={[]}
        smart={[]}
        trashed={[]}
        droppedSmart={0}
        droppedFolders={0}
        foldersUnreadable={false}
      />,
    )

    expect(await screen.findByRole('button', { name: 'Select' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Select all' })).not.toBeInTheDocument()
  })
})

// ── DRAG A FOLDER INTO A FOLDER ─────────────────────────────────────────────
describe('dragging a folder into another folder', () => {
  it('moves it, through the same action the menu uses', async () => {
    moveFolder.mockResolvedValue({ ok: true })

    render(
      <AssetLibrary
        cards={[card('one')]}
        capped={false}
        folders={[folder('a', 'Autumn'), folder('b', 'Brand')]}
        smart={[]}
        trashed={[]}
        droppedSmart={0}
        droppedFolders={0}
        foldersUnreadable={false}
      />,
    )

    const source = await screen.findByRole('button', { name: /^Autumn/ })
    const target = screen.getByRole('button', { name: /^Brand/ })
    const dataTransfer = stubDataTransfer()

    fireEvent.dragStart(source, { dataTransfer })
    fireEvent.dragOver(target, { dataTransfer })
    fireEvent.drop(target, { dataTransfer })

    await waitFor(() => expect(moveFolder).toHaveBeenCalledWith('a', 'b'))
  })

  it('a folder cannot be dropped on ITSELF, and does not highlight', async () => {
    // `canMoveFolder` refuses it, so the row never lights up and the browser
    // draws the no-entry cursor. Accepting the drop and explaining afterwards
    // would make a person complete a gesture that was never going to work.
    moveFolder.mockClear()

    render(
      <AssetLibrary
        cards={[card('one')]}
        capped={false}
        folders={[folder('a', 'Autumn')]}
        smart={[]}
        trashed={[]}
        droppedSmart={0}
        droppedFolders={0}
        foldersUnreadable={false}
      />,
    )

    const row = await screen.findByRole('button', { name: /^Autumn/ })
    const wrapper = row.parentElement as HTMLElement
    const dataTransfer = stubDataTransfer()

    fireEvent.dragStart(row, { dataTransfer })
    fireEvent.dragOver(row, { dataTransfer })

    // Checked WHILE the drag is over the row. After the drop the highlight is
    // cleared unconditionally, so asserting it there would pass on a row that
    // had lit up brightly a moment earlier.
    expect(wrapper.querySelector('.ring-accent')).toBeNull()

    fireEvent.drop(row, { dataTransfer })
    await settle()
    expect(moveFolder).not.toHaveBeenCalled()
  })

  it('a FILE drag and a FOLDER drag on the same row do not cross', async () => {
    // Both sets of handlers sit on one row and each ignores the other's MIME
    // type. If they did not, dropping files on a folder would try to move a
    // folder whose id was never in the payload.
    fileAssets.mockClear()
    moveFolder.mockClear()
    fileAssets.mockResolvedValue({ ok: true, added: 1, alreadyThere: 0 })

    render(
      <AssetLibrary
        cards={[card('one')]}
        capped={false}
        folders={[folder('a', 'Autumn')]}
        smart={[]}
        trashed={[]}
        droppedSmart={0}
        droppedFolders={0}
        foldersUnreadable={false}
      />,
    )

    const tile = (await screen.findByText('one.jpg')).closest('button') as HTMLElement
    const target = screen.getByRole('button', { name: /^Autumn/ })
    const dataTransfer = stubDataTransfer()

    fireEvent.dragStart(tile, { dataTransfer })
    fireEvent.dragEnter(target, { dataTransfer })
    fireEvent.drop(target, { dataTransfer })

    await waitFor(() => expect(fileAssets).toHaveBeenCalled())
    await settle()
    expect(moveFolder).not.toHaveBeenCalled()
  })
})

// ── DELETING A SELECTION, AND EMPTYING THE TRASH ────────────────────────────
describe('the bulk bar can move a selection to the trash', () => {
  it('trashes everything selected and reports what the SERVER moved', async () => {
    // Two selected, one already in the trash. The sentence must say 1, not 2 —
    // the person would go looking for two new rows in the trash and find one.
    trashAssets.mockResolvedValue({ ok: true, trashed: 1, alreadyTrashed: 1 })
    const user = userEvent.setup()

    render(
      <AssetLibrary
        cards={[card('one'), card('two')]}
        capped={false}
        folders={[]}
        smart={[]}
        trashed={[]}
        droppedSmart={0}
        droppedFolders={0}
        foldersUnreadable={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Select' }))
    await user.click(screen.getByRole('button', { name: 'Select all' }))
    await user.click(screen.getByRole('button', { name: /Move to trash/i }))

    await waitFor(() => expect(trashAssets).toHaveBeenCalled())
    expect(await screen.findByText(/Moved 1 file to the trash/)).toBeInTheDocument()
    expect(screen.getByText(/1 was already there/)).toBeInTheDocument()
  })

  it('offers Undo, which puts back only what this call moved', async () => {
    trashAssets.mockResolvedValue({ ok: true, trashed: 2, alreadyTrashed: 0 })
    restoreAssets.mockResolvedValue({ ok: true, trashed: 2, alreadyTrashed: 0 })
    const user = userEvent.setup()

    render(
      <AssetLibrary
        cards={[card('one'), card('two')]}
        capped={false}
        folders={[]}
        smart={[]}
        trashed={[]}
        droppedSmart={0}
        droppedFolders={0}
        foldersUnreadable={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Select' }))
    await user.click(screen.getByRole('button', { name: 'Select all' }))
    await user.click(screen.getByRole('button', { name: /Move to trash/i }))

    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(restoreAssets).toHaveBeenCalled())
    expect(await screen.findByText(/Put 2 files back/)).toBeInTheDocument()
  })

  it('warns when the trashed files are still on posts', async () => {
    // The trap the trash exists around: files vanish from the library and a
    // person concludes their posts lost them.
    trashAssets.mockResolvedValue({ ok: true, trashed: 1, alreadyTrashed: 0 })
    const user = userEvent.setup()

    render(
      <AssetLibrary
        cards={[
          card('used', {
            usage: [
              { postId: 'p1', postTitle: 'Diwali', postStatus: 'scheduled', variantStatuses: [] },
            ],
          }),
        ]}
        capped={false}
        folders={[]}
        smart={[]}
        trashed={[]}
        droppedSmart={0}
        droppedFolders={0}
        foldersUnreadable={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Select' }))
    await user.click(screen.getByRole('button', { name: 'Select all' }))
    await user.click(screen.getByRole('button', { name: /Move to trash/i }))

    expect(await screen.findByText(/still on a post/)).toBeInTheDocument()
  })
})

describe('emptying the trash', () => {
  it('asks first, and states both numbers afterwards', async () => {
    // "Deleted 8" while two were kept is a lie a person cannot detect.
    emptyTrash.mockResolvedValue({ ok: true, deleted: 1, kept: 1 })
    const user = userEvent.setup()

    render(
      <AssetLibrary
        cards={[]}
        capped={false}
        folders={[]}
        smart={[]}
        trashed={[card('gone', { deletedAt: '2026-08-26T00:00:00.000Z' }), card('kept')]}
        droppedSmart={0}
        droppedFolders={0}
        foldersUnreadable={false}
      />,
    )

    await user.click(await screen.findByRole('button', { name: /^Trash/ }))
    await user.click(screen.getByRole('button', { name: 'Empty the trash' }))

    // The confirmation names the count AND warns that some files may stay,
    // BEFORE the press rather than after it.
    expect(await screen.findByText(/This deletes 2 files for good/)).toBeInTheDocument()
    expect(screen.getByText(/still uses will stay here/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete them for good' }))
    await waitFor(() => expect(emptyTrash).toHaveBeenCalled())
    expect(await screen.findByText(/Deleted 1 file for good\. 1 file stayed/)).toBeInTheDocument()
  })

  it('does not delete anything if the confirmation is dismissed', async () => {
    emptyTrash.mockClear()
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
    await user.click(screen.getByRole('button', { name: 'Empty the trash' }))
    await user.click(await screen.findByRole('button', { name: 'Keep them' }))
    await settle()

    expect(emptyTrash).not.toHaveBeenCalled()
  })
})
