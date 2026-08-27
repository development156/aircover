'use client'

import { useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { MAX_FOLDER_NAME } from '@sahoda/shared'

import { createFolder } from '@/app/actions/asset-folders'
import { RenameForm } from '@/components/assets/menu-forms'

/** "Make a folder here", inline: a button that turns into a name field —
 *  the SAME `RenameForm` the folder and file menus use for their own name
 *  fields, rather than a fourth copy of the same input-and-two-buttons
 *  shape. */
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
    // B5: this used to carry a full-width dashed BORDER, the same shape an
    // input takes, so it read as a field waiting for text rather than an
    // action. It is a quiet text button now — no border, no fill — aligned
    // with the sidebar rows above it (`h-8`, the same left inset a depth-0
    // row uses).
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        style={{ paddingLeft: 10 }}
        className="flex h-8 w-full items-center gap-2 rounded-sm text-left type-sm font-semibold text-muted transition-micro hover:bg-s2 hover:text-ink"
      >
        <Plus size={14} aria-hidden />
        New folder
      </button>
    )
  }

  function cancel() {
    setEditing(false)
    setName('')
    setError(null)
  }

  function submit() {
    startTransition(async () => {
      const result = await createFolder(name, parentId)
      if (result.ok) {
        onCreated?.(result.folder.id)
        return cancel()
      }
      setError(result.message)
    })
  }

  return (
    <div className="surface-ring rounded-sm bg-surface">
      <RenameForm
        id="new-folder-inline-name"
        label="New folder"
        name={name}
        maxLength={MAX_FOLDER_NAME}
        placeholder="Folder name"
        submitLabel="Create"
        onNameChange={setName}
        pending={pending}
        onCancel={cancel}
        onSubmit={submit}
      />
      {error ? <p className="px-1 pb-1.5 type-meta text-ink-mute">{error}</p> : null}
    </div>
  )
}
