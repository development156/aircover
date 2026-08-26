'use client'

import { useMemo, useState } from 'react'
import { ImagePlus, Lock, Search } from 'lucide-react'
import type { AssetKind } from '@sahoda/shared'

import { AssetFolders } from '@/components/assets/asset-folders'
import { ASSET_FOLDERS, type FolderId } from '@/lib/assets/folders'
import { KINDS_NOT_YET_UPLOADABLE, KINDS_WITH_UPLOAD, labelForKind } from '@/lib/assets/kind'
import type { AssetCard } from '@/lib/assets/view'
import { displayName, lockedSites, usageLine } from '@/lib/assets/view'
import { formatBytes } from '@/lib/format-bytes'
import { Drawer } from '@/components/ui/drawer'
import { EmptyState } from '@/components/empty-state'
import { cn } from '@/lib/utils'

import { AssetDetail } from './asset-detail'
import { AssetThumb } from './asset-thumb'

/**
 * The library: find the photo you already have.
 *
 * ── WHY THE SEARCH AND FILTER ARE CLIENT-SIDE ────────────────────────────────
 * The server hands over at most `ASSET_LIST_LIMIT` rows and says so. Filtering
 * that set in the browser is instant and works on a phone with one bar of
 * signal; a round trip per keystroke would be slower and would break the moment
 * the connection did. When the cap is hit the screen says the list is capped, so
 * "no results" can never quietly mean "no results in the first 200".
 *
 * ── WHAT EACH TILE SAYS, AND WHAT IT REFUSES TO SAY ──────────────────────────
 * Every tile carries its usage in words — "Not used yet", "In 2 posts", or the
 * post that locks it, named. Not one of those is computed from anything but the
 * `asset_usages` rows the server actually read. There is no "In 0 posts": a zero
 * and "nothing uses this" read the same to a person, and only one is a sentence.
 *
 * A locked file wears a padlock and the word. There is no red in this palette
 * (docs/26 §1.6) and none is wanted — the glyph and the label both survive
 * greyscale.
 */
const ALL = 'all' as const
/**
 * ONE selection, written by two controls.
 *
 * The folder row and the kind chips both set this. They are two views of the
 * same state rather than two filters, so they cannot disagree — picking the
 * Photos folder lights the Photos chip, and there is never a moment where the
 * page is showing one thing and labelling it another. A second filter would
 * have made "which folder am I in" unanswerable the moment both were set.
 */
type Filter = typeof ALL | AssetKind | Exclude<FolderId, AssetKind>

export function AssetLibrary({ cards, capped }: { cards: AssetCard[]; capped: boolean }) {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<Filter>(ALL)
  const [openId, setOpenId] = useState<string | null>(null)

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return cards.filter((card) => {
      // A folder id and a kind id share this one slot, so the folder's own
      // predicate is the authority — `ASSET_FOLDERS` owns what "In use" means,
      // and restating it here is how the row and the count drift apart.
      if (kind !== ALL) {
        const folder = ASSET_FOLDERS.find((entry) => entry.id === kind)
        if (folder) {
          if (!folder.match(card)) return false
        } else if (card.kind !== kind) return false
      }
      if (needle === '') return true
      // Searched over what a person can SEE on the tile — the name and the
      // description they wrote. Not the storage path, which is a uuid nobody
      // has ever typed.
      const haystack = `${card.title ?? ''} ${card.alt ?? ''}`.toLowerCase()
      return haystack.includes(needle)
    })
  }, [cards, kind, query])

  const open = openId === null ? null : (cards.find((card) => card.id === openId) ?? null)

  if (cards.length === 0) {
    return (
      // NO action here, and the uploader is NOT rendered inside this branch.
      //
      // It used to be, and the first upload of a person's life then destroyed
      // its own confirmation: the moment the library stopped being empty this
      // whole subtree unmounted, and "Added 1 photo." went with it. The control
      // that reports an outcome must outlive the state change it causes — the
      // same rule the library picker follows by keeping its result outside the
      // modal that closes.
      //
      // It also keeps the screen to ONE primary action (docs/26 §1.5): the
      // uploader above is the only one, at any width.
      <EmptyState
        icon={ImagePlus}
        title="Your library is empty"
        body="Add photos above and use them on as many posts as you like. Sahoda checks each one against every channel before you publish."
      />
    )
  }

  return (
    <div className="space-y-4">
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
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or description"
            className="h-input w-full rounded-input border border-line bg-surface pr-3 pl-9 text-[13px] text-ink placeholder:text-muted max-narrow:min-h-[44px]"
          />
        </label>
      </div>

      {/* Scrolls sideways rather than wrapping to three rows on a phone. */}
      <div className="-mx-page-mobile flex gap-1.5 overflow-x-auto px-page-mobile pb-1 narrow:mx-0 narrow:flex-wrap narrow:px-0">
        <KindChip on={kind === ALL} onClick={() => setKind(ALL)}>
          All
        </KindChip>
        {KINDS_WITH_UPLOAD.map((k) => (
          <KindChip key={k} on={kind === k} onClick={() => setKind(k)}>
            {labelForKind(k)}
          </KindChip>
        ))}
        {/* Unbuilt kinds are SPANS. A `<button disabled>` is still announced as a
            button, so a screen reader would offer a filter that does not exist
            and the failure would read as a broken app (docs/26 §10.2). */}
        {KINDS_NOT_YET_UPLOADABLE.map((k) => (
          <span
            key={k}
            data-inert-control
            className="is-proposed inline-flex shrink-0 items-center rounded-pill px-3 py-[5px] text-[12.5px] font-[550] text-muted select-none max-narrow:min-h-[44px]"
          >
            {labelForKind(k)} · not yet
          </span>
        ))}
      </div>

      {/* FOLDERS SIT ABOVE THE FILES, and below the search and chips that scope
          them — the brief's own order. `onPick` toggles: clicking the folder you
          are already in leaves it, so the row is never a trap with no way out
          except the All chip. */}
      <AssetFolders
        cards={cards}
        active={ASSET_FOLDERS.some((folder) => folder.id === kind) ? (kind as FolderId) : null}
        onPick={(id) => setKind((current) => (current === id ? ALL : id))}
      />

      <p className="text-[12.5px] text-muted" role="status">
        <span className="num">{visible.length}</span>
        {visible.length === 1 ? ' file' : ' files'}
        {visible.length !== cards.length ? (
          <>
            {' of '}
            <span className="num">{cards.length}</span>
          </>
        ) : null}
        {capped ? '. Showing the most recent 200. Older files are not in this list.' : ''}
      </p>

      {visible.length === 0 ? (
        <p className="surface-ring rounded-card bg-surface px-4 py-8 text-center text-[13px] text-muted">
          Nothing here matches “{query.trim()}”. Try a shorter word, or clear the filter.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 narrow:grid-cols-3 wide:grid-cols-4">
          {visible.map((card) => (
            <li key={card.id}>
              <AssetTile card={card} onOpen={() => setOpenId(card.id)} />
            </li>
          ))}
        </ul>
      )}

      <Drawer
        open={open !== null}
        onClose={() => setOpenId(null)}
        title={open === null ? 'File' : displayName(open)}
        className="text-left"
      >
        {open !== null ? <AssetDetail card={open} onDeleted={() => setOpenId(null)} /> : null}
      </Drawer>
    </div>
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
        'inline-flex shrink-0 items-center rounded-pill px-3 py-[5px] text-[12.5px] font-[550] transition-micro max-narrow:min-h-[44px]',
        on
          ? 'bg-primary text-primary-foreground'
          : 'surface-ring-firm bg-surface text-muted hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

/**
 * One tile. The whole tile is the control — a photo with a separate "open"
 * button beside it gives one thing two targets, and on a phone the photo is
 * what a thumb lands on.
 */
function AssetTile({ card, onOpen }: { card: AssetCard; onOpen: () => void }) {
  const locked = lockedSites(card).length > 0
  const size = formatBytes(card.bytes)

  return (
    <button
      type="button"
      onClick={onOpen}
      className="surface-ring flex w-full flex-col overflow-hidden rounded-card bg-surface text-left transition-micro hover:bg-s1"
    >
      <span className="relative block">
        <AssetThumb card={card} className="aspect-[4/3] w-full" />
        {locked ? (
          // Over the picture, because the picture is what a thumb reaches for
          // and the lock has to arrive before the press does.
          <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-pill bg-ink px-2 py-[3px] text-[10.5px] font-[550] text-white dark:bg-white dark:text-[var(--canvas)]">
            <Lock size={10} strokeWidth={2.2} aria-hidden />
            In use
          </span>
        ) : null}
      </span>

      <span className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
        <span className="truncate text-[12.5px] font-[550] text-ink">{displayName(card)}</span>
        <span className="truncate text-[11.5px] text-muted">{usageLine(card)}</span>
        {size !== null ? <span className="num text-[11px] text-muted">{size}</span> : null}
      </span>
    </button>
  )
}
