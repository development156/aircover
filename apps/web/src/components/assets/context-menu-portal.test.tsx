import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { AssetFolder } from '@sahoda/shared'

const renameFolder = vi.fn()
const moveFolder = vi.fn()
const deleteFolder = vi.fn()
const createFolder = vi.fn()

// `folder-writes.ts` is `server-only`; the action module cannot load in jsdom.
vi.mock('@/app/actions/asset-folders', () => ({
  renameFolder: (...args: unknown[]) => renameFolder(...args),
  moveFolder: (...args: unknown[]) => moveFolder(...args),
  deleteFolder: (...args: unknown[]) => deleteFolder(...args),
  createFolder: (...args: unknown[]) => createFolder(...args),
}))

const { LibrarySidebar } = await import('./library-sidebar')
const { FolderMenu } = await import('./folder-menu')
const { ROOT } = await import('@/lib/assets/organize-view')

const folder = (id: string, name = id): AssetFolder => ({
  id,
  workspace_id: 'w',
  parent_id: null,
  name,
  created_by: null,
  created_at: '2026-08-26T00:00:00.000Z',
  updated_at: '2026-08-26T00:00:00.000Z',
})

const baseProps = {
  cards: [],
  now: new Date('2026-08-26T12:00:00.000Z'),
  location: ROOT,
  unfiledOnly: false,
  onGoTo: () => {},
  onGoUnfiled: () => {},
  onOpenSmart: () => {},
  foldersUnreadable: false,
  droppedFolders: 0,
  droppedSmart: 0,
  newFolderParentId: null,
  onFolderCreated: () => {},
  smart: [],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('B1 / F1: the folder menu is portalled to <body>, reachable by right-click', () => {
  it('right-click opens the menu, and its panel is NOT a descendant of the sidebar row', async () => {
    const folders = [folder('campaign', 'Campaign')]
    const user = userEvent.setup()

    render(
      <LibrarySidebar
        {...baseProps}
        folders={folders}
        renderFolderMenu={(f, trigger) => (
          <FolderMenu folder={f} allFolders={folders} trigger={trigger} />
        )}
      />,
    )

    const row = screen.getByRole('button', { name: /^Campaign/ })
    expect(row).toBeInTheDocument()

    await user.pointer({ keys: '[MouseRight]', target: row })

    const panel = await screen.findByRole('menu', { name: /Actions for Campaign/i })
    // The defect: a `-translate-y-1/2` ancestor trapped the panel's stacking
    // context, so its own DOM position mattered even though it painted at
    // the wrong place. Asserting it is a `document.body` child, not a
    // descendant of the row this was opened from, is the actual fix.
    expect(row.contains(panel)).toBe(false)
    expect(document.body.contains(panel)).toBe(true)
    expect(panel.parentElement).toBe(document.body)

    // The menu itself has real items, not an invisible husk.
    expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('Escape closes the menu and returns focus to the row it was opened from', async () => {
    const folders = [folder('campaign', 'Campaign')]
    const user = userEvent.setup()

    render(
      <LibrarySidebar
        {...baseProps}
        folders={folders}
        renderFolderMenu={(f, trigger) => (
          <FolderMenu folder={f} allFolders={folders} trigger={trigger} />
        )}
      />,
    )

    const row = screen.getByRole('button', { name: /^Campaign/ })
    await user.pointer({ keys: '[MouseRight]', target: row })
    expect(await screen.findByRole('menu')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    await waitFor(() => expect(document.activeElement).toBe(row))
  })

  it('a click outside the panel closes it', async () => {
    const folders = [folder('campaign', 'Campaign')]
    const user = userEvent.setup()

    render(
      <div>
        <button type="button">Elsewhere</button>
        <LibrarySidebar
          {...baseProps}
          folders={folders}
          renderFolderMenu={(f, trigger) => (
            <FolderMenu folder={f} allFolders={folders} trigger={trigger} />
          )}
        />
      </div>,
    )

    const row = screen.getByRole('button', { name: /^Campaign/ })
    await user.pointer({ keys: '[MouseRight]', target: row })
    expect(await screen.findByRole('menu')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Elsewhere' }))

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })
})

describe('F5: F2 and Delete are real shortcuts, not just labels printed in the menu', () => {
  it('F2 on a focused row opens the menu straight into Rename, not the top-level list', async () => {
    const folders = [folder('campaign', 'Campaign')]
    const user = userEvent.setup()

    render(
      <LibrarySidebar
        {...baseProps}
        folders={folders}
        renderFolderMenu={(f, trigger) => (
          <FolderMenu folder={f} allFolders={folders} trigger={trigger} />
        )}
      />,
    )

    const row = screen.getByRole('button', { name: /^Campaign/ })
    row.focus()
    await user.keyboard('{F2}')

    expect(await screen.findByRole('textbox', { name: /rename this folder/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Move' })).not.toBeInTheDocument()
  })

  it('Delete on a focused row asks the server to delete it directly', async () => {
    deleteFolder.mockResolvedValueOnce({ ok: true })
    const folders = [folder('campaign', 'Campaign')]
    const user = userEvent.setup()

    render(
      <LibrarySidebar
        {...baseProps}
        folders={folders}
        renderFolderMenu={(f, trigger) => (
          <FolderMenu folder={f} allFolders={folders} trigger={trigger} />
        )}
      />,
    )

    const row = screen.getByRole('button', { name: /^Campaign/ })
    row.focus()
    await user.keyboard('{Delete}')

    await waitFor(() => expect(deleteFolder).toHaveBeenCalledWith('campaign'))
  })
})
