'use client'

import { useMemo, useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { folderPath, isNarrowing, parseSearch, unparseRule } from '@sahoda/shared'
import type { AssetFolder, AssetSmartFolder } from '@sahoda/shared'

import { LibraryShell } from '@/components/assets/library-shell'
import { sidebarMenuRenderers } from '@/components/assets/library-sidebar-menus'
import { readLibrarySort, writeLibrarySort } from '@/components/assets/library-sort-storage'
import {
  readLibraryView,
  writeLibraryView,
  type LibraryView,
} from '@/components/assets/library-view-storage'
import { resolveFolderNames, searchAnswer } from '@/components/assets/search-filter'
import { useLibraryFiling } from '@/components/assets/use-library-filing'
import { useLibraryShortcuts } from '@/components/assets/use-library-shortcuts'
import { EmptyState } from '@/components/empty-state'
import { ROOT, contentsAt, type LibraryLocation } from '@/lib/assets/organize-view'
import { sortCards, type SortOption } from '@/lib/assets/sort-cards'
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
  const [sort, setSort] = useState<SortOption>(() => readLibrarySort())
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarOpenOnPhone, setSidebarOpenOnPhone] = useState(false)
  // F4: OFF by default. Turning it on repurposes `openId` — the SAME "which
  // file is open" state Quick Look already tracks — to drive this panel
  // instead of the drawer, rather than inventing a second "which file" slot
  // the two could disagree about.
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [shortcutSheetOpen, setShortcutSheetOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const now = useMemo(() => new Date(), [])
  const clearSelection = () => setSelected(new Set())
  const {
    bulkPending,
    bulkOutcome,
    dismissBulkOutcome,
    fileInto,
    fileSingleInto,
    removeFromCurrentFolder,
    removeSingleFromCurrentFolder,
    onFileDeleted,
  } = useLibraryFiling({
    cards,
    folders,
    smart,
    location,
    selected,
    clearSelection,
    openId,
    setOpenId,
    setSelected,
  })

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

  function setSortOption(next: SortOption) {
    setSort(next)
    writeLibrarySort(next)
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
    onShowShortcuts: () => setShortcutSheetOpen(true),
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

  const matched: AssetCard[] = []
  let searchUnknown = 0
  for (const card of base.files) {
    const answer = narrowing ? searchAnswer(card, parsed, resolved, now) : 'yes'
    if (answer === 'yes') matched.push(card)
    else if (answer === 'unknown') searchUnknown += 1
  }
  const unknownTotal = base.unknown + searchUnknown
  // F3: sorting is the LAST step, after filtering and before the count below
  // is read out — `visible.length` must still be the filtered count, which a
  // re-order can never change.
  const visible = useMemo(() => sortCards(matched, sort), [matched, sort])

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
  const insideFolderId = location.at === 'folder' && !unfiledOnly ? location.id : null

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
    ...sidebarMenuRenderers({
      foldersUnreadable,
      folders,
      onSubfolderCreated: (id) => goTo({ at: 'folder', id, deep: false }),
    }),
  }

  return (
    <LibraryShell
      toolbar={{
        view,
        onViewChange: setViewMode,
        selectMode,
        onToggleSelectMode: () => {
          setSelectMode((mode) => !mode)
          clearSelection()
        },
        onOpenSidebarOnPhone: () => setSidebarOpenOnPhone(true),
        sort,
        onSortChange: setSortOption,
        detailsOpen,
        onToggleDetails: () => setDetailsOpen((open) => !open),
      }}
      search={{
        ref: searchRef,
        query,
        onQueryChange: setQuery,
        narrowing,
        unusable: parsed.unusable,
        unresolvedFolderNames: resolved.unresolvedNames,
        rules: parsed.rules,
        onSaved: openSmartSearch,
      }}
      sidebar={{
        ...sidebarProps,
        collapsed: sidebarCollapsed,
        onToggleCollapsed: () => setSidebarCollapsed((c) => !c),
      }}
      content={{
        location,
        unfiledOnly,
        folders,
        smart,
        currentFolderPath,
        onGoTo: goTo,
        onToggleDeep: (deep) =>
          setLocation((current) => (current.at === 'folder' ? { ...current, deep } : current)),
        unknownTotal,
        query,
        onQueryChange: setQuery,
        view,
        visible,
        narrowing,
        selectMode,
        selected,
        onOpen: setOpenId,
        onToggleSelect: (id) =>
          setSelected((current) => {
            const next = new Set(current)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
          }),
        onQuickLook: setOpenId,
        onClearSearch: () => setQuery(''),
        insideFolderId,
        onFileInto: fileSingleInto,
        onRemoveFromFolder: removeSingleFromCurrentFolder,
        onDeleted: onFileDeleted,
        bulkOutcome,
        bulkPending,
        onDismissBulkOutcome: dismissBulkOutcome,
        showBulkRemove: location.at === 'folder' && !unfiledOnly,
        onBulkFileInto: fileInto,
        onBulkRemoveFromFolder: removeFromCurrentFolder,
        onClearSelection: clearSelection,
      }}
      detailsOpen={detailsOpen}
      details={{ card: openCard, onDeleted: () => setOpenId(null) }}
      status={{
        visibleCount: visible.length,
        totalCount: cards.length,
        selectedCards,
        capped: capped && location.at === 'all' && !unfiledOnly,
      }}
      overlays={{
        sidebarOpenOnPhone,
        onCloseSidebarOnPhone: () => setSidebarOpenOnPhone(false),
        sidebarProps,
        // F4: while the side panel is showing this same file, Quick Look's
        // drawer must not ALSO show it — two overlapping ways to view one
        // file is exactly the complexity `LibraryOverlays`'s own comment
        // says this screen exists to remove.
        openCard: detailsOpen ? null : openCard,
        onCloseDetail: () => setOpenId(null),
      }}
      shortcutSheet={{
        open: shortcutSheetOpen,
        onClose: () => setShortcutSheetOpen(false),
      }}
    />
  )
}
