'use client'

import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'

import { listAssetsForPicker } from '@/app/actions/assets-picker'
import { AssetThumb } from '@/components/assets/asset-thumb'
import { Modal } from '@/components/ui/modal'
import type { AssetCard } from '@/lib/assets/view'
import { displayName } from '@/lib/assets/view'
import { cn } from '@/lib/utils'

/**
 * Choose one photo from the library to send with a DM reply.
 *
 * ── A SECOND PICKER, AND DELIBERATELY SO ─────────────────────────────────────
 * `components/posts/library-picker.tsx` looks similar and is not reusable here: it
 * is bound to a post, it calls `attachAssetToPost`, and it runs the channel
 * constraint engine and offers a crop when a photo is refused. None of that applies
 * to a DM, where nothing is written until the reply is sent. This one only ANSWERS
 * a question — which file — and hands the id back. Bending the other into taking a
 * callback would have put the composer's rules in the inbox's path.
 *
 * ── IMAGES ONLY, AND IT SAYS SO ──────────────────────────────────────────────
 * A DM reply carries one file and the thread renders images inline; a video or a
 * document would arrive as a link the recipient may not be able to open on every
 * platform. So the list is filtered to `kind: 'image'` and the empty state
 * distinguishes "your library holds no pictures" from "no picture matches that
 * search" — two different sentences with two different next actions.
 *
 * ── THE LIST IS FETCHED ON OPEN ──────────────────────────────────────────────
 * Same reason the composer's picker does it: the signed preview URLs live an hour,
 * and minting two hundred of them for a writer who never opens this is work nobody
 * asked for. The whole component is loaded on click too, from `reply-composer`.
 */
export function AttachPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  /** The chosen file. The composer holds it; nothing is sent until Send is pressed. */
  onPick: (card: AssetCard) => void
}) {
  const [cards, setCards] = useState<AssetCard[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [capped, setCapped] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open || cards !== null) return
    let live = true
    void listAssetsForPicker().then((read) => {
      if (!live) return
      if (read.ok) {
        setCards(read.cards)
        setCapped(read.capped)
      } else setLoadFailed(true)
    })
    return () => {
      live = false
    }
  }, [open, cards])

  const pictures = (cards ?? []).filter((card) => card.kind === 'image')
  const needle = query.trim().toLowerCase()
  const visible = pictures.filter((card) =>
    needle === '' ? true : `${card.title ?? ''} ${card.alt ?? ''}`.toLowerCase().includes(needle),
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Attach a picture"
      description="Pick one file from your library. It goes out with the reply."
    >
      <label className="relative block">
        <span className="sr-only">Search your pictures</span>
        <Search
          size={14}
          strokeWidth={2}
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name"
          className="h-control w-full rounded-sm border border-line bg-s2 pr-3 pl-9 type-sm text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
      </label>

      <div className="mt-3">
        {cards === null && !loadFailed ? <PickerSkeleton /> : null}

        {loadFailed ? (
          // NOT an empty grid. An empty library invites an upload; a failed read must
          // not, because the photo they are looking for may be sitting right there.
          <p className="type-sm text-muted">
            Sahoda could not read your library just now. Close this and try again.
          </p>
        ) : null}

        {cards !== null && !loadFailed ? (
          visible.length === 0 ? (
            <p className="type-sm text-muted">
              {pictures.length === 0
                ? 'Your library holds no pictures yet. Add one from Assets and it will show up here.'
                : `No picture matches “${query.trim()}”. Clear the search to see all ${pictures.length}.`}
            </p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 wide:grid-cols-4">
              {visible.map((card) => (
                <li key={card.id}>
                  <button
                    type="button"
                    onClick={() => onPick(card)}
                    className={cn(
                      'group block w-full overflow-hidden rounded-card border border-line bg-s2 text-left transition-micro',
                      'hover:border-primary active:opacity-80',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                    )}
                  >
                    <AssetThumb card={card} className="aspect-square w-full object-cover" />
                    <span className="block truncate px-2 py-1.5 type-meta text-muted group-hover:text-ink">
                      {displayName(card)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}

        {capped ? (
          // Said, never hidden: a truncated list rendered as the whole set is a lie
          // about how many files this workspace has.
          <p className="mt-3 type-meta text-muted">
            Showing the newest 200 files. Older ones are in Assets.
          </p>
        ) : null}
      </div>
    </Modal>
  )
}

/** The shape of the grid while it loads, so the dialog does not jump when it fills. */
function PickerSkeleton() {
  return (
    <ul className="grid grid-cols-3 gap-2 wide:grid-cols-4" aria-hidden>
      {[0, 1, 2, 3, 4, 5].map((n) => (
        <li key={n} className="aspect-square animate-pulse rounded-card bg-s2" />
      ))}
    </ul>
  )
}
