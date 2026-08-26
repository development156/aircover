'use client'

import { useMemo, useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { ImagePlus } from 'lucide-react'
import { folderPath, type AssetFolder, type AssetSmartFolder } from '@sahoda/shared'

import { fileAssets, unfileAssets } from '@/app/actions/asset-folder-items'
import { AssetLibraryToolbar } from '@/components/assets/asset-library-toolbar'
import { AssetTile } from '@/components/assets/asset-tile'
import { BulkBar } from '@/components/assets/bulk-bar'
import { FolderBreadcrumb } from '@/components/assets/folder-breadcrumb'
import { FolderMenu } from '@/components/assets/folder-menu'
import { FolderRow } from '@/components/assets/folder-row'
import { SmartFolderMenu } from '@/components/assets/smart-folder-menu'
import type { FolderId } from '@/lib/assets/folders'
import { ROOT, contentsAt, locationName, type LibraryLocation } from '@/lib/assets/organize-view'
import { displayName } from '@/lib/assets/view'
import type { AssetCard } from '@/lib/assets/view'
import { Drawer } from '@/components/ui/drawer'
import { Modal } from '@/components/ui/modal'
import { EmptyState } from '@/components/empty-state'

import { AssetDetail } from './asset-detail'

/**
 * The library: find the photo you already have, or the place it is filed.
 *
 * ── WHY THE SEARCH IS CLIENT-SIDE ─────────────────────────────────────────────
 * The server hands over at most `ASSET_LIST_LIMIT` rows. Filtering that set in
 * the browser is instant on a phone with one bar of signal; a round trip per
 * keystroke would be slower and would break the moment the connection did.
 *
 * ── ONE PLACE AT A TIME ───────────────────────────────────────────────────────
 * `LibraryLocation` from `organize-view.ts` is the single source of where you
 * are: the library root, one of the three derived predicates, a real folder,
 * or a saved smart question. The kind chips and the folder row both write to
 * it, so the screen can never show one place while labelling it another.
 */
/**
 * THE RULE BUILDER IS NOT FIRST-LOAD MATERIAL.
 *
 * It renders only inside a modal nobody has opened yet, and it carries
 * `SmartQuerySchema` — a zod schema — into the browser with it. Loading it with
 * the library meant every visit to /assets downloaded a form most visits never
 * see, and MEASURED it put this route 33.5 kB over its JavaScript budget.
 *
 * `next/dynamic` fetches it when the modal opens instead. `js-budget.mjs` says
 * in its own header that it cannot see bytes fetched AFTER load, so this is not
 * hiding the weight from the guard: the weight genuinely moves off the path a
 * person pays to look at their photos.
 *
 * `ssr: false` is deliberate. This subtree is behind `open`, so there is nothing
 * to server-render, and asking for it would cost a server round trip to produce
 * markup for a closed modal.
 */
const SmartFolderBuilder = dynamic(
  () => import('@/components/assets/smart-folder-builder').then((m) => m.SmartFolderBuilder),
  {
    ssr: false,
    loading: () => <p className="type-sm text-muted">Getting the rule builder ready.</p>,
  },
)

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
  /** The folder read failed independently of the file read. See `folder-row.tsx`. */
  foldersUnreadable: boolean
  /** Real folder rows that would not parse. */
  droppedFolders: number
}) {
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState<LibraryLocation>(ROOT)
  const [openId, setOpenId] = useState<string | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkPending, startBulk] = useTransition()
  const [bulkResult, setBulkResult] = useState<string | null>(null)
  const [buildingSmart, setBuildingSmart] = useState(false)

  const now = useMemo(() => new Date(), [])
  const contents = useMemo(
    () => contentsAt(location, cards, folders, smart, now),
    [location, cards, folders, smart, now],
  )

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle === '') return contents.files
    return contents.files.filter((card) => {
      const haystack = `${card.title ?? ''} ${card.alt ?? ''}`.toLowerCase()
      return haystack.includes(needle)
    })
  }, [contents.files, query])

  const open = openId === null ? null : (cards.find((card) => card.id === openId) ?? null)
  const showFolderRow = location.at === 'all' || location.at === 'folder'
  const currentPath = location.at === 'folder' ? folderPath(folders, location.id) : []
  // Computed here, OUTSIDE the `showFolderRow` branch below: TS narrows
  // `location` through that aliased condition (TS 4.4+ control-flow analysis
  // of `const` booleans), which would make a `'derived'` check inside it a
  // type error even though it is reachable at runtime.
  const derivedActive: FolderId | null = location.at === 'derived' ? location.id : null

  function goTo(next: LibraryLocation) {
    setLocation(next)
    setSelected(new Set())
    setBulkResult(null)
  }

  function toggleSelect(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function fileInto(folderId: string) {
    const ids = [...selected]
    startBulk(async () => {
      const result = await fileAssets(folderId, ids)
      if (result.ok) {
        setBulkResult(
          result.alreadyThere > 0
            ? `Filed ${result.added}. ${result.alreadyThere} ${result.alreadyThere === 1 ? 'was' : 'were'} already there.`
            : `Filed ${result.added}.`,
        )
        setSelected(new Set())
        return
      }
      setBulkResult(result.message)
    })
  }

  function removeFromCurrentFolder() {
    if (location.at !== 'folder') return
    const ids = [...selected]
    startBulk(async () => {
      const result = await unfileAssets(location.id, ids)
      if (result.ok) {
        setBulkResult(
          `Removed ${result.removed} ${result.removed === 1 ? 'filing' : 'filings'}. Nothing was deleted.`,
        )
        setSelected(new Set())
        return
      }
      setBulkResult(result.message)
    })
  }

  if (cards.length === 0) {
    return (
      <EmptyState
        icon={ImagePlus}
        title="Your library is empty"
        body="Add photos above and use them on as many posts as you like. Sahoda checks each one against every channel before you publish."
      />
    )
  }

  return (
    <div className="space-y-4">
      <AssetLibraryToolbar
        query={query}
        onQueryChange={setQuery}
        location={location}
        onGoTo={goTo}
        foldersUnreadable={foldersUnreadable}
        droppedSmart={droppedSmart}
        droppedFolders={droppedFolders}
        currentFolderId={location.at === 'folder' ? location.id : null}
        onFolderCreated={(id) => goTo({ at: 'folder', id, deep: false })}
        selectMode={selectMode}
        onToggleSelectMode={() => {
          setSelectMode((mode) => !mode)
          setSelected(new Set())
          setBulkResult(null)
        }}
        onOpenSmartBuilder={() => setBuildingSmart(true)}
      />

      {location.at === 'folder' ? (
        <FolderBreadcrumb
          path={currentPath}
          deep={location.deep}
          onNavigate={(id) => (id === null ? goTo(ROOT) : goTo({ at: 'folder', id, deep: false }))}
          onToggleDeep={(deep) =>
            setLocation((current) => (current.at === 'folder' ? { ...current, deep } : current))
          }
        />
      ) : location.at !== 'all' ? (
        <p className="type-sm font-semibold text-ink">{locationName(location, folders, smart)}</p>
      ) : null}

      {showFolderRow ? (
        <FolderRow
          cards={cards}
          subfolders={contents.subfolders}
          allFolders={folders}
          smart={smart}
          now={now}
          derivedActive={derivedActive}
          onPickDerived={(id) => goTo(derivedActive === id ? ROOT : { at: 'derived', id })}
          onOpenFolder={(id) => goTo({ at: 'folder', id, deep: false })}
          onOpenSmart={(id) => goTo({ at: 'smart', id })}
          renderFolderMenu={
            foldersUnreadable
              ? undefined
              : (folder) => <FolderMenu folder={folder} allFolders={folders} />
          }
          renderSmartMenu={
            foldersUnreadable ? undefined : (entry) => <SmartFolderMenu folder={entry} />
          }
          foldersUnreadable={foldersUnreadable}
        />
      ) : null}

      <p className="text-[12.5px] text-muted" role="status">
        <span className="num">{visible.length}</span>
        {visible.length === 1 ? ' file' : ' files'}
        {visible.length !== contents.files.length ? (
          <>
            {' of '}
            <span className="num">{contents.files.length}</span>
          </>
        ) : null}
        {contents.unknown > 0 ? (
          <>
            {'. '}
            <span className="num">{contents.unknown}</span>
            {contents.unknown === 1 ? ' file could not be checked' : ' files could not be checked'}
          </>
        ) : null}
        {capped && location.at === 'all'
          ? '. Showing the most recent 200. Older files are not in this list.'
          : ''}
      </p>

      {visible.length === 0 ? (
        <p className="surface-ring rounded-card bg-surface px-4 py-8 text-center text-[13px] text-muted">
          {query.trim() === ''
            ? 'Nothing is here yet.'
            : `Nothing here matches “${query.trim()}”. Try a shorter word, or clear the filter.`}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 narrow:grid-cols-3 wide:grid-cols-4">
          {visible.map((card) => (
            <li key={card.id}>
              <AssetTile
                card={card}
                onOpen={() => setOpenId(card.id)}
                selectable={selectMode}
                selected={selected.has(card.id)}
                onToggleSelect={() => toggleSelect(card.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {selectMode ? (
        <BulkBar
          count={selected.size}
          folders={folders}
          showRemove={location.at === 'folder'}
          pending={bulkPending}
          resultMessage={bulkResult}
          onFileInto={fileInto}
          onRemoveFromFolder={removeFromCurrentFolder}
          onClear={() => setSelected(new Set())}
        />
      ) : null}

      <Drawer
        open={open !== null}
        onClose={() => setOpenId(null)}
        title={open === null ? 'File' : displayName(open)}
        className="text-left"
      >
        {open !== null ? <AssetDetail card={open} onDeleted={() => setOpenId(null)} /> : null}
      </Drawer>

      <Modal
        open={buildingSmart}
        onClose={() => setBuildingSmart(false)}
        title="Build a smart folder"
        description="A saved question, re-asked every time you open it."
      >
        <SmartFolderBuilder
          cards={cards}
          onClose={() => setBuildingSmart(false)}
          onCreated={(id) => goTo({ at: 'smart', id })}
        />
      </Modal>
    </div>
  )
}
