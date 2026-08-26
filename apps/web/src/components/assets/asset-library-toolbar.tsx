'use client'

import { ListChecks, Search, Sparkles, X } from 'lucide-react'

import { NewFolderInline } from '@/components/assets/new-folder-inline'
import { KINDS_NOT_YET_UPLOADABLE, KINDS_WITH_UPLOAD, labelForKind } from '@/lib/assets/kind'
import type { FolderId } from '@/lib/assets/folders'
import { ROOT, type LibraryLocation } from '@/lib/assets/organize-view'
import { cn } from '@/lib/utils'

/**
 * The library's top strip: search, the kind chips, and the three controls
 * that change what exists rather than what is shown (new folder, new smart
 * folder, select mode).
 *
 * Split out of `asset-library.tsx` only to keep that file under 300 lines —
 * every prop here is either a piece of `LibraryLocation` or a plain callback,
 * so this carries no state of its own beyond the search text passed to it.
 */
export function AssetLibraryToolbar({
  query,
  onQueryChange,
  location,
  onGoTo,
  foldersUnreadable,
  droppedSmart,
  droppedFolders,
  currentFolderId,
  onFolderCreated,
  selectMode,
  onToggleSelectMode,
  onOpenSmartBuilder,
}: {
  query: string
  onQueryChange: (query: string) => void
  location: LibraryLocation
  onGoTo: (next: LibraryLocation) => void
  foldersUnreadable: boolean
  droppedSmart: number
  droppedFolders: number
  currentFolderId: string | null
  onFolderCreated: (id: string) => void
  selectMode: boolean
  onToggleSelectMode: () => void
  onOpenSmartBuilder: () => void
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex min-w-[220px] flex-1 items-center max-narrow:min-w-0">
          <span className="sr-only">Search your library</span>
          <Search
            size={15}
            strokeWidth={1.8}
            aria-hidden
            className="pointer-events-none absolute left-3 text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search by name or description"
            className="h-input w-full rounded-input border border-line bg-surface pr-3 pl-9 type-sm text-ink placeholder:text-muted max-narrow:min-h-[44px]"
          />
        </label>

        {foldersUnreadable ? (
          // Inert. Offering to create a smart folder while the existing ones
          // cannot be read would let someone make a duplicate of one they
          // cannot currently see.
          <span
            data-inert-control
            className="is-proposed inline-flex shrink-0 items-center gap-1.5 rounded-pill px-3 py-1.5 type-sm font-semibold text-muted"
          >
            <Sparkles size={14} aria-hidden />
            New smart folder
          </span>
        ) : (
          <button
            type="button"
            onClick={onOpenSmartBuilder}
            data-guide="assets.newSmartFolder"
            className="flex shrink-0 items-center gap-1.5 rounded-pill bg-s2 px-3 py-1.5 type-sm font-semibold text-ink transition-micro hover:bg-s1"
          >
            <Sparkles size={14} aria-hidden />
            New smart folder
          </button>
        )}

        {foldersUnreadable ? null : (
          <div className="shrink-0" data-guide="assets.newFolder">
            <NewFolderInline parentId={currentFolderId} onCreated={onFolderCreated} />
          </div>
        )}

        <button
          type="button"
          onClick={onToggleSelectMode}
          aria-pressed={selectMode}
          data-guide="assets.select"
          className="flex shrink-0 items-center gap-1.5 rounded-pill bg-s2 px-3 py-1.5 type-sm font-semibold text-ink transition-micro hover:bg-s1"
        >
          {selectMode ? <X size={14} aria-hidden /> : <ListChecks size={14} aria-hidden />}
          {selectMode ? 'Cancel' : 'Select'}
        </button>
      </div>

      {/* Scrolls sideways rather than wrapping to three rows on a phone. */}
      <div className="-mx-page-mobile flex gap-1.5 overflow-x-auto px-page-mobile pb-1 narrow:mx-0 narrow:flex-wrap narrow:px-0">
        <KindChip on={location.at === 'all'} onClick={() => onGoTo(ROOT)}>
          All
        </KindChip>
        {KINDS_WITH_UPLOAD.map((k) => (
          <KindChip
            key={k}
            on={location.at === 'derived' && location.id === k}
            onClick={() =>
              onGoTo(
                location.at === 'derived' && location.id === k
                  ? ROOT
                  : { at: 'derived', id: k as FolderId },
              )
            }
          >
            {labelForKind(k)}
          </KindChip>
        ))}
        {/* Unbuilt kinds are SPANS. A `<button disabled>` is still announced as a
            button, so a screen reader would offer a filter that does not exist. */}
        {KINDS_NOT_YET_UPLOADABLE.map((k) => (
          <span
            key={k}
            data-inert-control
            className="is-proposed inline-flex shrink-0 items-center rounded-pill px-3 py-1.5 type-chip text-muted select-none max-narrow:min-h-[44px]"
          >
            {labelForKind(k)} · not yet
          </span>
        ))}
      </div>

      {(droppedSmart > 0 || droppedFolders > 0) && !foldersUnreadable ? (
        <p className="type-sm text-muted">
          {droppedFolders > 0
            ? `${droppedFolders} ${droppedFolders === 1 ? 'folder' : 'folders'} could not be read and ${droppedFolders === 1 ? 'is' : 'are'} not shown. `
            : ''}
          {droppedSmart > 0
            ? `${droppedSmart} ${droppedSmart === 1 ? 'smart folder' : 'smart folders'} could not be read and ${droppedSmart === 1 ? 'is' : 'are'} not shown. `
            : ''}
          This is not a claim that you have none.
        </p>
      ) : null}
    </>
  )
}

function KindChip({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        'inline-flex shrink-0 items-center rounded-pill px-3 py-1.5 type-chip transition-micro max-narrow:min-h-[44px]',
        on
          ? 'bg-primary text-primary-foreground'
          : 'surface-ring-firm bg-surface text-muted hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}
