'use client'

import { Folder, Sparkles } from 'lucide-react'
import type { AssetFolder, AssetSmartFolder } from '@sahoda/shared'

import { AssetFolders } from '@/components/assets/asset-folders'
import { FolderTile } from '@/components/assets/folder-tile'
import type { FolderId } from '@/lib/assets/folders'
import { contentsAt, folderTally } from '@/lib/assets/organize-view'
import type { AssetCard } from '@/lib/assets/view'

/**
 * THE ROW ABOVE THE FILES: real folders here, then the three derived
 * folders, then smart folders. In that order, per the brief.
 *
 * ── WHY REAL AND SMART FOLDERS ARE VISUALLY DISTINCT AT A GLANCE ─────────────
 * A real folder is `Folder` and a smart folder is `Sparkles` — different
 * glyphs — and a smart folder's second line always opens with "Smart folder",
 * so the word is there even for someone who does not know the glyphs yet.
 *
 * ── BOTH COUNTS, ALWAYS, FOR A REAL FOLDER ────────────────────────────────────
 * `folderTally` returns `direct` and `nested`, and `nested` INCLUDES `direct`.
 * When they differ the second line states both, because a folder that only
 * ever shows its direct count is Drive's behaviour and Drive is the thing
 * people lose files in. When they are equal there is nothing nested to add,
 * so the line names the sub-folder count instead of repeating the number
 * already on the tile.
 */
export function FolderRow({
  cards,
  subfolders,
  allFolders,
  smart,
  now,
  derivedActive,
  onPickDerived,
  onOpenFolder,
  onOpenSmart,
  renderFolderMenu,
  renderSmartMenu,
  /**
   * The folder read failed independently of the file read. Real folders and
   * smart folders are the SAME read (`readFolderTree`), so both go quiet
   * here — but the three derived folders are predicates over the files that
   * DID come back, and do not depend on this read at all, so they still
   * render. Rendering an empty real-folder row here would tell someone with
   * twenty folders that they have none, which is "we asked and got nothing"
   * reported as "we asked and there is nothing" — a different, false claim.
   */
  foldersUnreadable = false,
}: {
  cards: AssetCard[]
  /** Real folders that sit directly under the place being viewed. */
  subfolders: AssetFolder[]
  /** The whole tree, for tally and preview computation. */
  allFolders: AssetFolder[]
  smart: AssetSmartFolder[]
  now: Date
  derivedActive: FolderId | null
  onPickDerived: (id: FolderId) => void
  onOpenFolder: (id: string) => void
  onOpenSmart: (id: string) => void
  renderFolderMenu?: (folder: AssetFolder) => React.ReactNode
  renderSmartMenu?: (smart: AssetSmartFolder) => React.ReactNode
  foldersUnreadable?: boolean
}) {
  // Never empty: the three derived folders always render, regardless of what
  // real and smart folders exist at this place.
  return (
    <section aria-labelledby="asset-folders" data-guide="assets.folders" className="space-y-2.5">
      <h2 id="asset-folders" className="type-eyebrow text-ink-mute">
        Folders
      </h2>

      <div className="grid grid-cols-2 gap-3 narrow:grid-cols-3 wide:grid-cols-5">
        {foldersUnreadable ? (
          <div className="surface-ring col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface px-4 py-3 narrow:col-span-3 wide:col-span-5">
            <p className="type-sm text-muted">
              Sahoda could not read your folders. This is not a claim that you have none. The list
              did not come back.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="type-sm shrink-0 font-semibold text-accent"
            >
              Reload
            </button>
          </div>
        ) : (
          subfolders.map((folder) => {
            const tally = folderTally(folder.id, cards, allFolders)
            const direct = contentsAt(
              { at: 'folder', id: folder.id, deep: false },
              cards,
              allFolders,
              [],
              now,
            )
            const previews = [...direct.files]
              .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
              .map((card) => card.previewUrl)
              .filter((url): url is string => url !== null)
              .slice(0, 2)
            const secondLine =
              tally.direct !== tally.nested
                ? `${tally.direct} here, ${tally.nested} with sub-folders`
                : tally.subfolders === 0
                  ? 'No sub-folders'
                  : tally.subfolders === 1
                    ? '1 sub-folder'
                    : `${tally.subfolders} sub-folders`
            return (
              <FolderTile
                key={folder.id}
                name={folder.name}
                count={tally.direct}
                secondLine={secondLine}
                previews={previews}
                glyph={Folder}
                active={false}
                onOpen={() => onOpenFolder(folder.id)}
                menu={renderFolderMenu ? renderFolderMenu(folder) : undefined}
              />
            )
          })
        )}

        <AssetFolders cards={cards} active={derivedActive} onPick={onPickDerived} />

        {foldersUnreadable
          ? null
          : smart.map((entry) => {
              const result = contentsAt(
                { at: 'smart', id: entry.id },
                cards,
                allFolders,
                [entry],
                now,
              )
              const filesWord = result.files.length === 1 ? 'file' : 'files'
              const secondLine =
                result.unknown > 0
                  ? `Smart folder · ${result.files.length} ${filesWord}, ${result.unknown} could not be checked`
                  : `Smart folder · ${result.files.length} ${filesWord}`
              const previews = [...result.files]
                .sort((a, b) =>
                  a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
                )
                .map((card) => card.previewUrl)
                .filter((url): url is string => url !== null)
                .slice(0, 2)
              return (
                <FolderTile
                  key={entry.id}
                  name={entry.name}
                  count={result.files.length}
                  secondLine={secondLine}
                  previews={previews}
                  glyph={Sparkles}
                  active={false}
                  onOpen={() => onOpenSmart(entry.id)}
                  menu={renderSmartMenu ? renderSmartMenu(entry) : undefined}
                />
              )
            })}
      </div>
    </section>
  )
}
