'use client'

import { CircleDashed, Images, Link2 } from 'lucide-react'

import { FolderTile } from '@/components/assets/folder-tile'
import { ASSET_FOLDERS, folderMeta, type FolderId } from '@/lib/assets/folders'
import type { AssetCard } from '@/lib/assets/view'

/**
 * THE DERIVED FOLDER ROW — Photos / In use / Not used yet.
 *
 * The SHAPE lives in `folder-tile.tsx` now, shared with real and smart
 * folders so there is exactly one folder silhouette in the codebase rather
 * than several that can drift apart. Read that file's header for how the
 * shape is built and why the ring classes there are written out literally.
 *
 * ── NO THREE-DOT MENU ────────────────────────────────────────────────────────
 * These three are derived predicates: there is no rename, no delete and no
 * move, and the only action — open — is the click itself. A menu whose one
 * item repeats the click is a control that exists to look like a control.
 */
const GLYPH: Record<FolderId, React.ComponentType<{ className?: string; size?: number }>> = {
  image: Images,
  'in-use': Link2,
  unused: CircleDashed,
}

/** `13 Oct 2025`. IST, because every other date a customer reads here is. */
const DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
})

export function AssetFolders({
  cards,
  active,
  onPick,
}: {
  cards: AssetCard[]
  active: FolderId | null
  /** Passing the SAME id clears the filter — a second click leaves the folder. */
  onPick: (id: FolderId) => void
}) {
  const meta = folderMeta(cards)

  return (
    <div className="grid grid-cols-2 gap-3 narrow:grid-cols-3 wide:grid-cols-5">
      {ASSET_FOLDERS.map((folder) => {
        const { count, lastAdded, previews } = meta[folder.id]
        return (
          <FolderTile
            key={folder.id}
            name={folder.name}
            count={count}
            secondLine={
              lastAdded === null
                ? 'Nothing in here yet'
                : `Last added ${DATE.format(new Date(lastAdded))}`
            }
            previews={previews}
            glyph={GLYPH[folder.id]}
            active={active === folder.id}
            onOpen={() => onPick(folder.id)}
          />
        )
      })}
    </div>
  )
}
