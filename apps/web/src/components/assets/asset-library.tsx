'use client'

import { useMemo, useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { folderPath, isNarrowing, parseSearch, unparseRule } from '@sahoda/shared'
import type { AssetFolder, AssetSmartFolder } from '@sahoda/shared'

import { BulkBar } from '@/components/assets/bulk-bar'
import { FolderMenu } from '@/components/assets/folder-menu'
import { LibraryGrid } from '@/components/assets/library-grid'
import { LibraryLocationHeader } from '@/components/assets/library-location-header'
import { LibraryOverlays } from '@/components/assets/library-overlays'
import { LibrarySearch } from '@/components/assets/library-search'
import { LibrarySidebar } from '@/components/assets/library-sidebar'
import { LibraryStatus } from '@/components/assets/library-status'
import { LibraryToolbar } from '@/components/assets/library-toolbar'
import {
  readLibraryView,
  writeLibraryView,
  type LibraryView,
} from '@/components/assets/library-view-storage'
import { resolveFolderNames, searchAnswer } from '@/components/assets/search-filter'
import { SmartFolderMenu } from '@/components/assets/smart-folder-menu'
import { useBulkFiling } from '@/components/assets/use-bulk-filing'
import { useLibraryShortcuts } from '@/components/assets/use-library-shortcuts'
import { EmptyState } from '@/components/empty-state'
import { ROOT, contentsAt, locationName, type LibraryLocation } from '@/lib/assets/organize-view'
import type { AssetCard } from '@/lib/assets/view'

/**
 * THE LIBRARY: find the photo you already have, or the place it is filed.
 *
 * The founder's verdict on the build this replaces: "this folder system is
 * very complicated and not simple". What changed: one search box instead of a
 * rule-builder modal, folders in a left list instead of a grid of overlapping
 * cards, and every folder action behind a small menu instead of standing
 * controls on every tile. Nothing here adds a control back.
 *
 * `LibraryLocation` (owned by `organize-view.ts`) is the source of where you
 * are. "Unfiled" is not one of its four cases, so it is carried here as a
 * sibling boolean instead, and `goTo` / `goUnfiled` keep the two exclusive.
 */
export function AssetLibrary({
  cards,
  capped,
  folders,
  smart,
  droppedSmart,
  foldersUnreadable,
  droppedFolders,
}: {
  cards: AssetCard[]
  capped: boolean
  folders: AssetFolder[]
  smart: AssetSmartFolder[]
  droppedSmart: number
  foldersUnreadable: boolean
  droppedFolders: number
}) {
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState<LibraryLocation>(ROOT)
  const [unfiledOnly, setUnfiledOnly] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [view, setView] = useState<LibraryView>(() => readLibraryView())
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarOpenOnPhone, setSidebarOpenOnPhone] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const now = useMemo(() => new Date(), [])
  const clearSelection = () => setSelected(new Set())
  const {
    pending: bulkPending,
    fileInto: fileIntoRaw,
    removeFromFolder,
    outcome: bulkOutcome,
    dismiss: dismissBulkOutcome,
  } = useBulkFiling(cards, clearSelection)

  function goTo(next: LibraryLocation) {
    setLocation(next)
    setUnfiledOnly(false)
    clearSelection()
    setSidebarOpenOnPhone(false)
  }

  function goUnfiled() {
    setLocation(ROOT)
    setUnfiledOnly(true)
    clearSelection()
    setSidebarOpenOnPhone(false)
  }

  function openSmartSearch(id: string) {
    const entry = smart.find((s) => s.id === id)
    if (entry) setQuery(entry.query.rules.map(unparseRule).join(' '))
    goTo({ at: 'smart', id })
  }

  function setViewMode(next: LibraryView) {
    setView(next)
    writeLibraryView(next)
  }

  function fileInto(folderId: string) {
    const folderName = folders.find((f) => f.id === folderId)?.name ?? 'the folder'
    fileIntoRaw(folderId, folderName, [...selected])
  }

  function removeFromCurrentFolder() {
    if (location.at === 'folder') {
      removeFromFolder(location.id, locationName(location, folders, smart), [...selected])
    }
  }

  useLibraryShortcuts({
    onFocusSearch: () => searchRef.current?.focus(),
    onEscape: () => {
      if (query.trim() !== '') return setQuery('')
      if (selectMode) {
        setSelectMode(false)
        clearSelection()
      }
    },
    onListView: () => setViewMode('list'),
    onGridView: () => setViewMode('grid'),
  })

  const base = unfiledOnly
    ? {
        files: cards.filter((c) => c.folderIds !== null && c.folderIds.length === 0),
        unknown: 0,
        subfolders: [],
      }
    : contentsAt(location, cards, folders, smart, now)

  const parsed = useMemo(() => parseSearch(query), [query])
  const narrowing = isNarrowing(parsed)
  const resolved = useMemo(
    () => resolveFolderNames(parsed.folderNames, folders),
    [parsed.folderNames, folders],
  )

  const visible: AssetCard[] = []
  let searchUnknown = 0
  for (const card of base.files) {
    const answer = narrowing ? searchAnswer(card, parsed, resolved, now) : 'yes'
    if (answer === 'yes') visible.push(card)
    else if (answer === 'unknown') searchUnknown += 1
  }
  const unknownTotal = base.unknown + searchUnknown

  if (cards.length === 0) {
    return (
      <EmptyState
        icon={ImagePlus}
        title="Your library is empty"
        body="Add photos above and use them on as many posts as you like. Sahoda checks each one against every channel before you publish."
      />
    )
  }

  const currentFolderPath = location.at === 'folder' ? folderPath(folders, location.id) : []
  const selectedCards = cards.filter((c) => selected.has(c.id))
  const openCard = openId === null ? null : (cards.find((c) => c.id === openId) ?? null)

  const sidebarProps = {
    cards,
    folders,
    smart,
    now,
    location,
    unfiledOnly,
    onGoTo: goTo,
    onGoUnfiled: goUnfiled,
    onOpenSmart: openSmartSearch,
    foldersUnreadable,
    droppedFolders,
    droppedSmart,
    newFolderParentId: location.at === 'folder' ? location.id : null,
    onFolderCreated: (id: string) => goTo({ at: 'folder', id, deep: false }),
    renderFolderMenu: foldersUnreadable
      ? undefined
      : (folder: AssetFolder) => <FolderMenu folder={folder} allFolders={folders} />,
    renderSmartMenu: foldersUnreadable
      ? undefined
      : (entry: AssetSmartFolder) => <SmartFolderMenu folder={entry} />,
  }

  return (
    <div className="flex flex-col gap-3">
      <LibraryToolbar
        view={view}
        onViewChange={setViewMode}
        selectMode={selectMode}
        onToggleSelectMode={() => {
          setSelectMode((mode) => !mode)
          clearSelection()
        }}
        onOpenSidebarOnPhone={() => setSidebarOpenOnPhone(true)}
      >
        <LibrarySearch
          ref={searchRef}
          query={query}
          onQueryChange={setQuery}
          narrowing={narrowing}
          unusable={parsed.unusable}
          unresolvedFolderNames={resolved.unresolvedNames}
          rules={parsed.rules}
          onSaved={openSmartSearch}
        />
      </LibraryToolbar>

      <div className="flex min-w-0 flex-1 items-start gap-4">
        <div className="max-narrow:hidden">
          <LibrarySidebar
            {...sidebarProps}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
          />
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <LibraryLocationHeader
            location={location}
            unfiledOnly={unfiledOnly}
            folders={folders}
            smart={smart}
            currentFolderPath={currentFolderPath}
            onGoTo={goTo}
            onToggleDeep={(deep) =>
              setLocation((current) => (current.at === 'folder' ? { ...current, deep } : current))
            }
          />

          {unknownTotal > 0 ? (
            <p className="type-meta text-muted">
              <span className="num">{unknownTotal}</span>
              {unknownTotal === 1 ? ' file could not be checked.' : ' files could not be checked.'}
            </p>
          ) : null}

          <LibraryGrid
            view={view}
            visible={visible}
            narrowing={narrowing}
            query={query}
            selectMode={selectMode}
            selected={selected}
            onOpen={setOpenId}
            onToggleSelect={(id) =>
              setSelected((current) => {
                const next = new Set(current)
                if (next.has(id)) next.delete(id)
                else next.add(id)
                return next
              })
            }
            onQuickLook={setOpenId}
          />

          {/* ── OUTSIDE `selectMode`, DELIBERATELY ──────────────────────────
              A successful file clears the selection, so the bulk bar unmounts.
              Rendering this inside it took the sentence away at the exact moment
              it became true, which is the defect the uploader on this same screen
              already documents. It lives here so it outlives the change it
              reports. */}
          {bulkOutcome !== null ? (
            <p
              role="status"
              className="surface-ring flex flex-wrap items-center gap-2 rounded-card bg-surface px-3 py-2 type-meta text-muted"
            >
              <span className={bulkOutcome.tone === 'error' ? 'font-semibold text-ink' : ''}>
                {bulkOutcome.message}
              </span>
              {bulkOutcome.undo !== undefined ? (
                <button
                  type="button"
                  onClick={bulkOutcome.undo}
                  disabled={bulkPending}
                  className="font-semibold text-accent underline underline-offset-2 disabled:opacity-60"
                >
                  Undo
                </button>
              ) : null}
              <button
                type="button"
                onClick={dismissBulkOutcome}
                className="ml-auto text-muted hover:text-ink"
              >
                Dismiss
              </button>
            </p>
          ) : null}

          {selectMode ? (
            <BulkBar
              count={selected.size}
              folders={folders}
              showRemove={location.at === 'folder' && !unfiledOnly}
              pending={bulkPending}
              onFileInto={fileInto}
              onRemoveFromFolder={removeFromCurrentFolder}
              onClear={clearSelection}
            />
          ) : null}
        </div>
      </div>

      <LibraryStatus
        visibleCount={visible.length}
        totalCount={cards.length}
        selectedCards={selectedCards}
        capped={capped && location.at === 'all' && !unfiledOnly}
      />

      <LibraryOverlays
        sidebarOpenOnPhone={sidebarOpenOnPhone}
        onCloseSidebarOnPhone={() => setSidebarOpenOnPhone(false)}
        sidebarProps={sidebarProps}
        openCard={openCard}
        onCloseDetail={() => setOpenId(null)}
      />
    </div>
  )
}
