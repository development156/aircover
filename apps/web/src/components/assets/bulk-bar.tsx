'use client'

import { useState } from 'react'
import { FolderInput, FolderMinus, X } from 'lucide-react'
import type { AssetFolder } from '@sahoda/shared'

import { cn } from '@/lib/utils'

/**
 * THE BULK BAR — appears once something is selected, and only then.
 *
 * ── THE COPY NEVER GUESSES ────────────────────────────────────────────────────
 * The outcome of a bulk action is built from whatever the server action actually
 * returned (`FileAssetsState` / `UnfileAssetsState`). It is NOT rendered here,
 * and that is load-bearing: a successful file clears the selection, this bar
 * unmounts with it, and the sentence would go with the bar. `BulkOutcome` lives
 * in the library shell for the same reason the uploader sits outside the empty
 * state. A control that reports an outcome has to outlive the state change it
 * causes.
 *
 * ── "REMOVE" NEVER READS AS "DELETE" ──────────────────────────────────────────
 * `onRemoveFromFolder` is offered only inside a real folder, and its own label
 * says what it does: takes the filing away, not the photo.
 */
export function BulkBar({
  count,
  folders,
  showRemove,
  pending,
  onFileInto,
  onRemoveFromFolder,
  onClear,
}: {
  count: number
  /** Real folders a person can file into, flat. */
  folders: AssetFolder[]
  /** True when the current place is a real folder, so "remove from here" makes sense. */
  showRemove: boolean
  pending: boolean
  onFileInto: (folderId: string) => void
  onRemoveFromFolder: () => void
  onClear: () => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)

  if (count === 0) return null

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="surface-ring-firm sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-pill bg-surface px-4 py-2 shadow-pop"
    >
      <span className="type-sm font-semibold text-ink">
        <span className="num">{count}</span>
        {count === 1 ? ' file selected' : ' files selected'}
      </span>

      <div className="relative">
        <button
          type="button"
          onClick={() => setPickerOpen((open) => !open)}
          disabled={pending || folders.length === 0}
          className="flex items-center gap-1.5 rounded-pill bg-s2 px-3 py-1.5 type-sm font-semibold text-ink transition-micro hover:bg-s1 disabled:opacity-50"
        >
          <FolderInput size={14} aria-hidden />
          File into folder
        </button>

        {pickerOpen ? (
          <div className="surface-ring-firm absolute bottom-full left-0 z-20 mb-2 w-[220px] rounded-md bg-surface p-1.5 shadow-pop">
            {folders.length === 0 ? (
              <p className="px-2 py-1.5 type-sm text-muted">Make a folder first.</p>
            ) : (
              folders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => {
                    setPickerOpen(false)
                    onFileInto(folder.id)
                  }}
                  className="block w-full truncate rounded-sm px-2 py-1.5 text-left type-sm text-ink transition-micro hover:bg-s2"
                >
                  {folder.name}
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>

      {showRemove ? (
        <button
          type="button"
          onClick={onRemoveFromFolder}
          disabled={pending}
          title="Takes the files out of this folder. Nothing is deleted."
          className="flex items-center gap-1.5 rounded-pill bg-s2 px-3 py-1.5 type-sm font-semibold text-ink transition-micro hover:bg-s1 disabled:opacity-50"
        >
          <FolderMinus size={14} aria-hidden />
          Remove from this folder
          <span className="sr-only">. Takes the files out of this folder. Nothing is deleted.</span>
        </button>
      ) : null}

      <button
        type="button"
        onClick={onClear}
        aria-label="Clear selection"
        className="ml-auto grid size-7 place-items-center rounded-sm text-muted transition-micro hover:bg-s2 hover:text-ink"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  )
}
