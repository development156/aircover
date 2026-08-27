'use client'

import type { BulkOutcome } from '@/components/assets/use-bulk-filing'

/**
 * What a bulk file/remove action just did, and Undo.
 *
 * Split out of `asset-library.tsx` only to keep that file under 300 lines —
 * this stays a pure presentational read of `BulkOutcome`, no state of its
 * own. Rendered OUTSIDE `selectMode`, deliberately: a successful file clears
 * the selection, the bulk bar unmounts with it, and the sentence would go
 * with the bar if it lived there. A control that reports an outcome has to
 * outlive the state change it causes.
 */
export function BulkOutcomeBanner({
  outcome,
  pending,
  onDismiss,
}: {
  outcome: BulkOutcome | null
  pending: boolean
  onDismiss: () => void
}) {
  if (outcome === null) return null

  return (
    <p
      role="status"
      className="surface-ring flex flex-wrap items-center gap-2 rounded-card bg-surface px-3 py-2 type-meta text-muted"
    >
      <span className={outcome.tone === 'error' ? 'font-semibold text-ink' : ''}>
        {outcome.message}
      </span>
      {outcome.undo !== undefined ? (
        <button
          type="button"
          onClick={outcome.undo}
          disabled={pending}
          className="font-semibold text-accent underline underline-offset-2 disabled:opacity-60"
        >
          Undo
        </button>
      ) : null}
      <button type="button" onClick={onDismiss} className="ml-auto text-muted hover:text-ink">
        Dismiss
      </button>
    </p>
  )
}
