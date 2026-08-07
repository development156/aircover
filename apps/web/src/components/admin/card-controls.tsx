'use client'

import { useState, useTransition } from 'react'
import { Archive, Ban } from 'lucide-react'
import { toast } from 'sonner'

import { archiveTask, editTask, moveTask } from '@/app/actions/ops-board'
import { COLUMNS, COLUMN_LABEL, type BoardCard } from '@/lib/ops/board'
import type { OpsTaskColumn } from '@sahoda/shared'
import { cn } from '@/lib/utils'

/**
 * The write controls on a card (doc 13 §10).
 *
 * Rendered only for a seat that may actually write — a viewer sees no controls
 * at all, rather than disabled ones. A disabled control still says "this exists
 * for you"; an absent one says nothing false. The database refuses viewers
 * regardless (`app.ops_writer()` raises 42501), so this is presentation, not
 * authorisation.
 *
 * The select is not a duplicate of drag — it is the keyboard and screen-reader
 * path to the same move, and the only one that works on a touch device. Drag is
 * the shortcut, not the mechanism.
 */

const ICON_BUTTON =
  'grid size-[22px] place-items-center rounded-input text-muted transition-micro hover:bg-s2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45'

export function CardControls({ card }: { card: BoardCard }) {
  const [pending, startTransition] = useTransition()
  const [confirmingArchive, setConfirmingArchive] = useState(false)

  function run(work: () => Promise<{ ok: boolean; message?: string }>, success: string) {
    startTransition(async () => {
      const result = await work()
      // Every failure says so out loud. A control that swallows its refusal is
      // the same as a control that does nothing.
      if (result.ok) toast.success(success)
      else toast.error(result.message ?? 'That change was not applied.')
    })
  }

  function onMove(next: OpsTaskColumn) {
    if (next === card.column) return
    run(() => moveTask({ code: card.code, column: next }), `${card.code} → ${COLUMN_LABEL[next]}`)
  }

  function onBlockToggle() {
    if (card.blocked) {
      run(
        () => editTask(card.code, { blocked: false, blockedReason: null }),
        `${card.code} unblocked`,
      )
      return
    }
    // A reason is required by the action, so it is asked for here rather than
    // sending a request that is certain to be refused.
    const reason = window.prompt(`What is blocking ${card.code}?`)?.trim()
    if (!reason) return
    run(() => editTask(card.code, { blocked: true, blockedReason: reason }), `${card.code} blocked`)
  }

  function onArchive() {
    if (!confirmingArchive) {
      setConfirmingArchive(true)
      return
    }
    setConfirmingArchive(false)
    run(() => archiveTask(card.code, true), `${card.code} archived`)
  }

  return (
    <div className="mt-2 flex items-center gap-1 border-t border-line pt-2">
      <label className="sr-only" htmlFor={`move-${card.code}`}>
        Move {card.code} to another column
      </label>
      <select
        id={`move-${card.code}`}
        value={card.column}
        disabled={pending}
        onChange={(event) => onMove(event.target.value as OpsTaskColumn)}
        className="rounded-input border border-line bg-s1 px-1.5 py-[3px] text-[11px] text-muted transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-45"
      >
        {COLUMNS.map((column) => (
          <option key={column} value={column}>
            {COLUMN_LABEL[column]}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={onBlockToggle}
        disabled={pending}
        title={card.blocked ? `Unblock ${card.code}` : `Block ${card.code}`}
        aria-label={card.blocked ? `Unblock ${card.code}` : `Block ${card.code}`}
        className={cn(ICON_BUTTON, 'ml-auto', card.blocked && 'text-danger')}
      >
        <Ban size={13} strokeWidth={1.8} aria-hidden />
      </button>

      <button
        type="button"
        onClick={onArchive}
        onBlur={() => setConfirmingArchive(false)}
        disabled={pending}
        title={`Archive ${card.code}`}
        aria-label={confirmingArchive ? `Confirm archiving ${card.code}` : `Archive ${card.code}`}
        className={cn(ICON_BUTTON, confirmingArchive && 'bg-danger-bg text-danger')}
      >
        {confirmingArchive ? (
          <span className="text-[10px] font-semibold">OK?</span>
        ) : (
          <Archive size={13} strokeWidth={1.8} aria-hidden />
        )}
      </button>
    </div>
  )
}
