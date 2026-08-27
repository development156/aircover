'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw, Trash2 } from 'lucide-react'
import { trashedAgo } from '@sahoda/shared'

import { AssetDeleteButton } from '@/components/assets/asset-delete'
import { AssetThumb } from '@/components/assets/asset-thumb'
import { restoreAsset } from '@/app/actions/assets'
import { Button } from '@/components/ui/button'
import type { AssetCard } from '@/lib/assets/view'
import { displayName } from '@/lib/assets/view'
import { formatBytes } from '@/lib/format-bytes'

/**
 * THE TRASH: files you deleted, which are still whole.
 *
 * ── WHY THIS IS ITS OWN VIEW AND NOT A FLAG ON THE GRID ──────────────────────
 * Every control here is different from every control there. A trashed file
 * cannot be filed, cannot be attached to a post, cannot be renamed, and its two
 * real actions do not exist anywhere else. Passing a `trash` boolean into
 * `LibraryGrid` would mean a prop in that component for each of those
 * differences, and each one would be a chance to render a control that does
 * nothing in the state it was not built for.
 *
 * ── THE ONE CLAIM THIS SCREEN MUST NOT MAKE ──────────────────────────────────
 * It does not say files are deleted after any number of days, because nothing
 * sweeps this table. No scheduled job reads `deleted_at`, so a sentence about
 * thirty days would be a promise no process could keep — and the person who
 * relied on it would come back for a photo that was never going anywhere, or
 * worse, believe one was safely gone when it was not. What it says instead is
 * what is true: these stay until you delete them for good.
 */
export function TrashView({ cards, now }: { cards: readonly AssetCard[]; now: Date }) {
  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
        <span aria-hidden className="grid size-9 place-items-center rounded-md bg-s2 text-muted">
          <Trash2 size={18} strokeWidth={1.7} />
        </span>
        <p className="type-sm text-muted">Nothing is in the trash.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="type-meta text-muted">
        Deleting a file here moves it to the trash. Files stay in the trash until you delete them
        for good, and a file in the trash is still on any post that was using it.
      </p>

      <ul className="surface-ring divide-y divide-line-soft overflow-hidden rounded-card bg-surface">
        {cards.map((card) => (
          <li key={card.id}>
            <TrashRow card={card} now={now} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function TrashRow({ card, now }: { card: AssetCard; now: Date }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // null when the column came back as something this cannot read. The absence
  // mark, never an invented "Deleted today" — docs/26 §4.
  const ago = trashedAgo(card.deletedAt, now)
  const size = formatBytes(card.bytes)
  const name = displayName(card)

  function restore() {
    setError(null)
    startTransition(async () => {
      const result = await restoreAsset(card.id)
      if (result.ok) {
        router.refresh()
        return
      }
      setError(result.message)
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
      {/* Dimmed, because a trashed file is not a file you can use. The name
          beside it is NOT dimmed: it is the one thing being read here. */}
      <AssetThumb card={card} className="size-10 shrink-0 rounded-sm object-cover opacity-60" />

      <div className="min-w-0 flex-1">
        <p className="truncate type-sm font-semibold text-ink">{name}</p>
        <p className="type-meta text-muted">
          <span className={ago === null ? '' : 'num'}>{ago ?? '—'}</span>
          {size === null ? null : (
            <>
              {' · '}
              <span className="num">{size}</span>
            </>
          )}
          {card.usage.length > 0 ? (
            <>
              {' · '}
              <span>
                still on <span className="num">{card.usage.length}</span>
                {card.usage.length === 1 ? ' post' : ' posts'}
              </span>
            </>
          ) : null}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          loading={pending}
          onClick={restore}
          aria-label={`Restore ${name}`}
        >
          <RotateCcw size={14} strokeWidth={1.8} aria-hidden />
          Restore
        </Button>

        {/* The SAME gate the live library's delete uses, re-asked now. A file can
            arrive in the trash unused and be on a scheduled post by the time
            somebody empties it, and this is where that gets caught. */}
        <AssetDeleteButton assetId={card.id} fileName={name} label="Delete for good" />
      </div>

      {error !== null ? (
        <p
          role="alert"
          className="w-full rounded-input border border-danger-bg bg-danger-bg px-3 py-2 type-sm text-danger"
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}
