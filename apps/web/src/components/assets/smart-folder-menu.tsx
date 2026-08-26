'use client'

import { useState, useTransition } from 'react'
import { MoreVertical, X } from 'lucide-react'
import type { AssetSmartFolder } from '@sahoda/shared'

import { deleteSmartFolder } from '@/app/actions/asset-smart-folders'

/**
 * A smart folder's own menu. Just one action: forget the question.
 *
 * No confirm step: `deleteSmartFolder` has nothing to warn about, because a
 * smart folder holds no membership table — deleting it forgets a saved
 * question and touches no file, no filing and no other folder.
 */
export function SmartFolderMenu({ folder }: { folder: AssetSmartFolder }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function remove() {
    startTransition(async () => {
      const result = await deleteSmartFolder(folder.id)
      if (result.ok) return setOpen(false)
      setError(result.message)
    })
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Actions for ${folder.name}`}
        aria-expanded={open}
        className="grid size-7 place-items-center rounded-sm text-muted transition-micro hover:bg-s2 hover:text-ink"
      >
        <MoreVertical size={14} aria-hidden />
      </button>
      {open ? (
        <div className="surface-ring-firm absolute top-full right-0 z-20 mt-1 w-[200px] rounded-md bg-surface p-2 shadow-pop">
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-sm text-muted hover:bg-s2 hover:text-ink"
          >
            <X size={12} aria-hidden />
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="mt-1 block w-full rounded-sm px-2 py-1.5 text-left type-sm text-ink transition-micro hover:bg-s2 disabled:opacity-50"
          >
            Forget this smart folder
          </button>
          {error ? <p className="mt-1 type-meta text-ink-mute">{error}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
