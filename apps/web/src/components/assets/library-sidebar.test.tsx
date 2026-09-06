import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AssetFolder } from '@sahoda/shared'

import { LibrarySidebar } from './library-sidebar'
import { ROOT } from '@/lib/assets/organize-view'
import type { AssetCard } from '@/lib/assets/view'

const NOW = new Date('2026-08-26T12:00:00.000Z')

const card = (id: string, over: Partial<AssetCard> = {}): AssetCard => ({
  id,
  title: `${id}.jpg`,
  alt: 'A description',
  kind: 'image',
  mime: 'image/jpeg',
  bytes: 1000,
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

const baseProps = {
  now: NOW,
  location: ROOT,
  unfiledOnly: false,
  onGoTo: () => {},
  onGoUnfiled: () => {},
  trashedCount: 0,
  onOpenSmart: () => {},
  droppedFolders: 0,
  droppedSmart: 0,
  newFolderParentId: null,
  onFolderCreated: () => {},
}

describe('a real folder', () => {
  it('renders its real count, and a nested folder is indented deeper than its parent', () => {
    const folders = [folder('campaign', null, 'Campaign'), folder('autumn', 'campaign', 'Autumn')]
    const cards = [
      card('a', { folderIds: ['campaign'] }),
      card('b', { folderIds: ['campaign'] }),
      card('c', { folderIds: ['autumn'] }),
    ]

    render(
      <LibrarySidebar
        {...baseProps}
        cards={cards}
        folders={folders}
        smart={[]}
        foldersUnreadable={false}
      />,
    )

    const campaignRow = screen.getByRole('button', { name: /Campaign/ })
    const autumnRow = screen.getByRole('button', { name: /Autumn/ })

    // "Campaign" holds two files DIRECTLY (the third is filed in "Autumn").
    expect(campaignRow).toHaveTextContent('2')

    const parentIndent = Number.parseFloat(campaignRow.style.paddingLeft)
    const childIndent = Number.parseFloat(autumnRow.style.paddingLeft)
    expect(childIndent).toBeGreaterThan(parentIndent)
  })
})

describe('the folder read failed', () => {
  it('does not claim zero folders, and the derived folders still render', () => {
    render(
      <LibrarySidebar
        {...baseProps}
        cards={[card('a')]}
        folders={[]}
        smart={[]}
        foldersUnreadable
      />,
    )

    expect(screen.getByText(/could not read your folders/i)).toBeInTheDocument()
    expect(screen.getByText(/not a claim that you have none/i)).toBeInTheDocument()
    // The three derived folders are predicates over files that DID come back,
    // and do not depend on the folder read at all.
    expect(screen.getByRole('button', { name: /Photos/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /In use/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Not used yet/ })).toBeInTheDocument()
    // And nothing claims there are zero real folders: no "Folders" section, no
    // empty-count row, is rendered at all while the read is down.
    expect(screen.queryByText('Folders')).not.toBeInTheDocument()
  })
})

describe('a saved search', () => {
  it('states its own matched count', () => {
    const cards = [card('a', { kind: 'image' }), card('b', { kind: 'image' })]
    const smart = [
      {
        id: 's1',
        workspace_id: 'w',
        name: 'All photos',
        query: { mode: 'all' as const, rules: [{ field: 'kind' as const, is: 'image' as const }] },
        created_by: null,
        created_at: '2026-08-26T00:00:00.000Z',
        updated_at: '2026-08-26T00:00:00.000Z',
      },
    ]

    render(
      <LibrarySidebar
        {...baseProps}
        cards={cards}
        folders={[]}
        smart={smart}
        foldersUnreadable={false}
      />,
    )

    expect(screen.getByRole('button', { name: /All photos/ })).toHaveTextContent('2')
  })
})
