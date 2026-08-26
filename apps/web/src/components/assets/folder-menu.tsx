'use client'

import { useState, useTransition } from 'react'
import { MoreVertical, X } from 'lucide-react'
import { MAX_FOLDER_NAME, canMoveFolder, type AssetFolder } from '@sahoda/shared'

import { renameFolder, moveFolder, deleteFolder } from '@/app/actions/asset-folders'
import { cn } from '@/lib/utils'

/**
 * A real folder's own menu: rename, move, delete.
 *
 * ── MOVE ONLY OFFERS DESTINATIONS THAT WOULD SUCCEED ─────────────────────────
 * `canMoveFolder` runs over every candidate BEFORE it is drawn. A folder's own
 * descendant, itself, and anything that would push it past `MAX_FOLDER_DEPTH`
 * are never in the list — offered-then-refused is a worse experience than not
 * offered, because it makes the person read an error for a choice the screen
 * could see was impossible before they made it.
 *
 * ── DELETE NEVER CALLS THE ACTION TWICE WITHOUT A PERSON'S SAY ────────────────
 * The first call carries no `confirmed`. If the folder holds anything,
 * `deleteFolder` refuses with `needs-confirm` and the exact counts, and only a
 * second explicit click — never a re-render, never a retry — calls it again
 * with `confirmed: true`.
 */
export function FolderMenu({
  folder,
  allFolders,
}: {
  folder: AssetFolder
  allFolders: AssetFolder[]
}) {
  const [mode, setMode] = useState<'closed' | 'menu' | 'rename' | 'move' | 'delete-confirm'>(
    'closed',
  )
  const [name, setName] = useState(folder.name)
  const [error, setError] = useState<string | null>(null)
  const [confirmInfo, setConfirmInfo] = useState<{
    message: string
    files: number
    subfolders: number
  } | null>(null)
  const [pending, startTransition] = useTransition()

  function close() {
    setMode('closed')
    setError(null)
    setConfirmInfo(null)
    setName(folder.name)
  }

  const destinations = allFolders.filter(
    (candidate) =>
      candidate.id !== folder.parent_id && canMoveFolder(allFolders, folder.id, candidate.id).ok,
  )
  const rootIsValid = folder.parent_id !== null && canMoveFolder(allFolders, folder.id, null).ok

  function submitRename() {
    startTransition(async () => {
      const result = await renameFolder(folder.id, name)
      if (result.ok) return close()
      setError(result.message)
    })
  }

  function submitMove(newParentId: string | null) {
    startTransition(async () => {
      const result = await moveFolder(folder.id, newParentId)
      if (result.ok) return close()
      setError(result.reason === 'refused' ? result.decision.message : result.message)
    })
  }

  function requestDelete() {
    startTransition(async () => {
      const result = await deleteFolder(folder.id)
      if (result.ok) return close()
      if (result.reason === 'needs-confirm') {
        setConfirmInfo({
          message: result.message,
          files: result.files,
          subfolders: result.subfolders,
        })
        setMode('delete-confirm')
        return
      }
      setError(result.message)
    })
  }

  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteFolder(folder.id, true)
      if (result.ok) return close()
      setError(result.message)
    })
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setMode(mode === 'closed' ? 'menu' : 'closed')}
        aria-label={`Actions for ${folder.name}`}
        aria-expanded={mode !== 'closed'}
        className="grid size-7 place-items-center rounded-sm text-muted transition-micro hover:bg-s2 hover:text-ink focus-visible:bg-s2"
      >
        <MoreVertical size={14} aria-hidden />
      </button>

      {mode === 'closed' ? null : (
        <div className="surface-ring-firm absolute top-full right-0 z-20 mt-1 w-[240px] rounded-md bg-surface p-2 shadow-pop">
          <button
            type="button"
            onClick={close}
            aria-label="Close menu"
            className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-sm text-muted hover:bg-s2 hover:text-ink"
          >
            <X size={12} aria-hidden />
          </button>

          {mode === 'menu' ? (
            <div className="flex flex-col gap-0.5 pt-1">
              <MenuItem onClick={() => setMode('rename')}>Rename</MenuItem>
              <MenuItem onClick={() => setMode('move')}>Move</MenuItem>
              <MenuItem onClick={requestDelete}>Delete</MenuItem>
            </div>
          ) : null}

          {mode === 'rename' ? (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                submitRename()
              }}
              className="flex flex-col gap-2 pt-1"
            >
              <label className="type-meta text-muted" htmlFor={`rename-${folder.id}`}>
                Rename this folder
              </label>
              <input
                id={`rename-${folder.id}`}
                autoFocus
                value={name}
                maxLength={MAX_FOLDER_NAME}
                onChange={(event) => setName(event.target.value)}
                className="h-8 rounded-sm border border-line bg-bg px-2 type-sm text-ink"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={close} className="type-sm text-muted">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending || name.trim() === ''}
                  className="type-sm font-semibold text-accent disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </form>
          ) : null}

          {mode === 'move' ? (
            <div className="flex flex-col gap-1 pt-1">
              <p className="type-meta text-muted">Move to</p>
              <div className="max-h-[220px] overflow-y-auto">
                {rootIsValid ? (
                  <MenuItem onClick={() => submitMove(null)}>Top level</MenuItem>
                ) : null}
                {destinations.map((candidate) => (
                  <MenuItem key={candidate.id} onClick={() => submitMove(candidate.id)}>
                    {candidate.name}
                  </MenuItem>
                ))}
                {!rootIsValid && destinations.length === 0 ? (
                  <p className="px-2 py-1.5 type-sm text-muted">
                    There is nowhere else this folder can go.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {mode === 'delete-confirm' && confirmInfo ? (
            <div className="flex flex-col gap-2 pt-1">
              <p className="type-sm text-ink">{confirmInfo.message}</p>
              <p className="type-meta text-muted">
                <span className="num">{confirmInfo.files}</span>
                {confirmInfo.files === 1 ? ' file stops' : ' files stop'} being filed here.{' '}
                <span className="num">{confirmInfo.subfolders}</span>
                {confirmInfo.subfolders === 1 ? ' sub-folder goes' : ' sub-folders go'} with it.
              </p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={close} className="type-sm text-muted">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  disabled={pending}
                  className="type-sm font-semibold text-accent disabled:opacity-50"
                >
                  Delete folder
                </button>
              </div>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="mt-2 type-meta text-ink-mute">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center justify-between rounded-sm px-2 py-1.5 text-left type-sm text-ink transition-micro hover:bg-s2',
      )}
    >
      <span className="truncate">{children}</span>
    </button>
  )
}
