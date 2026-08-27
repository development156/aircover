import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { AssetFolder } from '@sahoda/shared'

const renameFolder = vi.fn()
const moveFolder = vi.fn()
const deleteFolder = vi.fn()

// `folder-writes.ts` is `server-only`; the action module cannot load in jsdom.
vi.mock('@/app/actions/asset-folders', () => ({
  renameFolder: (...args: unknown[]) => renameFolder(...args),
  moveFolder: (...args: unknown[]) => moveFolder(...args),
  deleteFolder: (...args: unknown[]) => deleteFolder(...args),
}))

const { FolderMenu } = await import('./folder-menu')

const folder = (id: string, parent_id: string | null, name = id): AssetFolder => ({
  id,
  workspace_id: 'w',
  parent_id,
  name,
  created_by: null,
  created_at: '2026-08-26T00:00:00.000Z',
  updated_at: '2026-08-26T00:00:00.000Z',
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('the move picker', () => {
  it('does not offer the folder itself or its own descendant as a destination', async () => {
    // campaign > autumn > diwali, and an unrelated root "brand".
    const folders = [
      folder('campaign', null),
      folder('autumn', 'campaign'),
      folder('diwali', 'autumn'),
      folder('brand', null),
    ]
    const user = userEvent.setup()
    render(<FolderMenu folder={folders[0] as AssetFolder} allFolders={folders} />)

    await user.click(screen.getByRole('button', { name: /actions for campaign/i }))
    await user.click(screen.getByRole('button', { name: 'Move' }))

    // "brand" is a legal destination: not itself, not a descendant.
    expect(await screen.findByRole('button', { name: 'brand' })).toBeInTheDocument()
    // "autumn" and "diwali" are both inside "campaign" already — offering them
    // would be offered-then-refused, which `canMoveFolder` exists to prevent.
    expect(screen.queryByRole('button', { name: 'autumn' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'diwali' })).not.toBeInTheDocument()
    // The folder cannot go inside itself either.
    expect(screen.queryByRole('button', { name: 'campaign' })).not.toBeInTheDocument()
  })
})

describe('deleting a non-empty folder', () => {
  it('surfaces the confirm with the real counts and does not call the action again unconfirmed', async () => {
    deleteFolder.mockResolvedValueOnce({
      ok: false,
      reason: 'needs-confirm',
      message:
        'Deleting this folder takes away the folder, not the photos. Every file stays in your library.',
      files: 4,
      subfolders: 2,
    })
    const user = userEvent.setup()
    const folders = [folder('campaign', null)]
    render(<FolderMenu folder={folders[0] as AssetFolder} allFolders={folders} />)

    await user.click(screen.getByRole('button', { name: /actions for campaign/i }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText(/not the photos/i)).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()

    // Only the ONE call so far, and it carried no `confirmed`.
    expect(deleteFolder).toHaveBeenCalledTimes(1)
    expect(deleteFolder).toHaveBeenCalledWith('campaign')

    deleteFolder.mockResolvedValueOnce({ ok: true })
    await user.click(screen.getByRole('button', { name: 'Delete folder' }))

    await waitFor(() => expect(deleteFolder).toHaveBeenCalledTimes(2))
    expect(deleteFolder).toHaveBeenLastCalledWith('campaign', true)
  })
})
