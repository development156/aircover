'use client'

import { useState } from 'react'
import { FolderInput, FolderMinus, X } from 'lucide-react'
import type { AssetFolder } from '@sahoda/shared'

/**
 * THE BULK BAR — appears once something is selected, and only then.
 *
 * ── THE COPY NEVER GUESSES ────────────────────────────────────────────────────
 * `resultMessage` is rendered verbatim from whatever the server action
 * actually returned (`FileAssetsState` / `UnfileAssetsState`), never computed
 * here from the selection size. Filing nine photos where two were already in
 * that folder must read "Filed 7. 2 were already there.", not "Filed 9.".
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
  resultMessage,
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
  resultMessage: string | null
  onFileInto: (folderId: string) => void
  onRemoveFromFolder: () => void
  onClear: () => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)

  // A successful bulk action clears the selection, and the bar must not
  // vanish in the same instant — that would take the result sentence with
  // it, and "Filed 7. 2 were already there." has to be readable.
  if (count === 0 && resultMessage === null) return null

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="surface-ring-firm sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-pill bg-surface px-4 py-2 shadow-pop"
    >
      {count > 0 ? (
        <span className="type-sm font-semibold text-ink">
          <span className="num">{count}</span>
          {count === 1 ? ' file selected' : ' files selected'}
        </span>
      ) : null}

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

      {resultMessage ? (
        <p role="status" className="type-sm text-muted">
          {resultMessage}
        </p>
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
