'use client'

import { useState, useTransition } from 'react'
import { FolderPlus } from 'lucide-react'
import { MAX_FOLDER_NAME } from '@sahoda/shared'

import { createFolder } from '@/app/actions/asset-folders'

/** "Make a folder here", inline: a button that turns into a name field. */
export function NewFolderInline({
  parentId,
  onCreated,
}: {
  parentId: string | null
  onCreated?: (folderId: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex items-center gap-1.5 rounded-pill border border-dashed border-line-firm px-3 py-1.5 type-sm font-semibold text-muted transition-micro hover:border-accent hover:text-accent"
      >
        <FolderPlus size={14} aria-hidden />
        New folder
      </button>
    )
  }

  function submit() {
    startTransition(async () => {
      const result = await createFolder(name, parentId)
      if (result.ok) {
        onCreated?.(result.folder.id)
        setEditing(false)
        setName('')
        setError(null)
        return
      }
      setError(result.message)
    })
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      className="surface-ring flex items-center gap-2 rounded-pill bg-surface px-3 py-1.5"
    >
      <input
        autoFocus
        value={name}
        maxLength={MAX_FOLDER_NAME}
        onChange={(event) => setName(event.target.value)}
        placeholder="Folder name"
        aria-label="New folder name"
        className="h-6 w-[140px] border-0 bg-transparent type-sm text-ink outline-none placeholder:text-muted"
      />
      <button
        type="submit"
        disabled={pending || name.trim() === ''}
        className="type-sm font-semibold text-accent disabled:opacity-50"
      >
        Create
      </button>
      <button
        type="button"
        onClick={() => {
          setEditing(false)
          setName('')
          setError(null)
        }}
        className="type-sm text-muted"
      >
        Cancel
      </button>
      {error ? <span className="type-meta text-ink-mute">{error}</span> : null}
    </form>
  )
}
