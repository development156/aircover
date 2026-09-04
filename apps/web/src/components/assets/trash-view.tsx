'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw, Trash2 } from 'lucide-react'
import { describeEmptyTrash, trashedAgo } from '@sahoda/shared'

import { AssetDeleteButton } from '@/components/assets/asset-delete'
import { AssetThumb } from '@/components/assets/asset-thumb'
import { emptyTrash, restoreAsset } from '@/app/actions/assets'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 flex-1 type-meta text-muted">
          Deleting a file here moves it to the trash. Files stay in the trash until you delete them
          for good, and a file in the trash is still on any post that was using it.
        </p>
        <EmptyTrashButton count={cards.length} />
      </div>

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

/**
 * Empty the trash.
 *
 * ── THIS ONE ASKS, AND THE BULK "MOVE TO TRASH" DOES NOT ─────────────────────
 * The difference is reversibility, not scale. Moving files to the trash offers
 * Undo and the files stay whole; this deletes bytes that no transaction can
 * bring back. A confirmation belongs in front of the second and would only
 * train people to click through dialogs if it were put in front of the first.
 *
 * The dialog states the COUNT, because "Empty the trash?" over a list a person
 * has stopped reading is not enough information to answer with.
 */
function EmptyTrashButton({ count }: { count: number }) {
  const router = useRouter()
  const [asking, setAsking] = useState(false)
  const [pending, startTransition] = useTransition()
  const [outcome, setOutcome] = useState<string | null>(null)

  function confirm() {
    setOutcome(null)
    startTransition(async () => {
      const result = await emptyTrash()
      setAsking(false)
      if (!result.ok) {
        setOutcome(result.message)
        return
      }
      // ALL THREE. A file the gate refused stays in the trash, and reporting only
      // the deleted count would be a claim the person cannot check. `more` is the
      // third: one press reads at most 200 rows, so a bigger trash is emptied a
      // batch at a time and the sentence has to say so rather than imply it is
      // now clear.
      setOutcome(describeEmptyTrash(result.deleted, result.kept, result.more))
      router.refresh()
    })
  }

  return (
    <div className="shrink-0 text-right">
      <Button
        type="button"
        variant="secondary"
        loading={pending}
        onClick={() => setAsking(true)}
        aria-label="Empty the trash"
      >
        <Trash2 size={14} strokeWidth={1.8} aria-hidden />
        Empty the trash
      </Button>

      {outcome !== null ? (
        <p role="status" className="mt-2 max-w-[280px] type-meta text-muted">
          {outcome}
        </p>
      ) : null}

      <Modal
        open={asking}
        onClose={() => setAsking(false)}
        title="Empty the trash?"
        className="text-left"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAsking(false)}
              disabled={pending}
            >
              Keep them
            </Button>
            <Button type="button" variant="destructive" loading={pending} onClick={confirm}>
              {pending ? 'Deleting…' : 'Delete them for good'}
            </Button>
          </div>
        }
      >
        <p className="type-sm text-ink-body">
          {count === 1
            ? 'This deletes 1 file for good. Sahoda cannot bring it back.'
            : `This deletes ${count} files for good. Sahoda cannot bring them back.`}{' '}
          {/* Stated BEFORE the press, not discovered after it. A person who
              expects an empty trash and gets two files left needs to know why
              in advance, or the screen looks broken. */}
          Any file a published or scheduled post still uses will stay here.
        </p>
      </Modal>
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
