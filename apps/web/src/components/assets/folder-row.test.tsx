import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AssetFolder, AssetSmartFolder } from '@sahoda/shared'

import { FolderRow } from '@/components/assets/folder-row'
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
  usage: [],
  folderIds: [],
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
  name: `Smart ${id}`,
  query,
  created_by: null,
  created_at: '2026-08-26T00:00:00.000Z',
  updated_at: '2026-08-26T00:00:00.000Z',
})

const noopHandlers = {
  onPickDerived: () => {},
  onOpenFolder: () => {},
  onOpenSmart: () => {},
}

describe('FolderRow — a real folder with different direct and nested counts', () => {
  it('states BOTH counts', () => {
    const folders = [folder('campaign', null), folder('autumn', 'campaign')]
    const cards = [
      card('direct', { folderIds: ['campaign'] }),
      card('nested', { folderIds: ['autumn'] }),
    ]

    render(
      <FolderRow
        cards={cards}
        subfolders={[folders[0] as AssetFolder]}
        allFolders={folders}
        smart={[]}
        now={NOW}
        derivedActive={null}
        {...noopHandlers}
      />,
    )

    expect(screen.getByText('1 here, 2 with sub-folders')).toBeInTheDocument()
  })
})

describe('FolderRow — a smart folder with unknowns', () => {
  it('renders the unknown count, never silently folding it into matched', () => {
    const cards = [
      card('wide', { width: 1600, height: 900 }),
      card('unmeasured', { width: null, height: null }),
    ]
    const smart = [
      smartFolder('s1', { mode: 'all', rules: [{ field: 'orientation', is: 'landscape' }] }),
    ]

    render(
      <FolderRow
        cards={cards}
        subfolders={[]}
        allFolders={[]}
        smart={smart}
        now={NOW}
        derivedActive={null}
        {...noopHandlers}
      />,
    )

    // A regression that folds `unknown` into `matched`, or drops it, breaks
    // this — the text must state BOTH the 1 matched file and the 1 that could
    // not be checked, not just one of the two.
    expect(screen.getByText(/1 file, 1 could not be checked/)).toBeInTheDocument()
  })
})

describe('FolderRow — the folder read failed', () => {
  it('does not claim zero real folders, and still renders the derived folders', () => {
    render(
      <FolderRow
        cards={[card('a')]}
        subfolders={[]}
        allFolders={[]}
        smart={[]}
        now={NOW}
        derivedActive={null}
        foldersUnreadable
        {...noopHandlers}
      />,
    )

    expect(screen.getByText(/could not read your folders/i)).toBeInTheDocument()
    expect(screen.getByText(/not a claim that you have none/i)).toBeInTheDocument()
    // The three derived folders are predicates over files that DID come back.
    expect(screen.getByText('Photos')).toBeInTheDocument()
    expect(screen.getByText('In use')).toBeInTheDocument()
    expect(screen.getByText('Not used yet')).toBeInTheDocument()
  })
})
