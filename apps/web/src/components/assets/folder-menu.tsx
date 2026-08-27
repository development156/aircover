'use client'

import { useEffect, useState, useTransition } from 'react'
import { MAX_FOLDER_NAME, canMoveFolder, type AssetFolder } from '@sahoda/shared'

import { createFolder, deleteFolder, moveFolder, renameFolder } from '@/app/actions/asset-folders'
import { DELETE_ITEM_KEY, RENAME_ITEM_KEY } from '@/components/assets/library-shortcuts'
import { ConfirmDialog, FolderPickerList, RenameForm } from '@/components/assets/menu-forms'
import { MenuItemRow } from '@/components/assets/menu-item-row'
import { MenuTrigger } from '@/components/assets/menu-trigger'
import {
  useContextMenuTrigger,
  type ContextMenuTrigger,
} from '@/components/assets/use-context-menu-trigger'

/**
 * A real folder's own menu: rename, move, a sub-folder, delete.
 *
 * ── B1's FIX LIVES HERE ───────────────────────────────────────────────────
 * The panel renders through `MenuTrigger` → `FloatingPanel`, portalled to
 * `document.body` and positioned from the "..." button's own rect. See
 * `floating-panel.tsx` for the stacking-context defect this replaces: a
 * `-translate-y-1/2` transform on an ancestor row created a new stacking
 * context, which trapped this menu's old `absolute z-20` panel inside it —
 * no z-index inside that context could paint above a LATER sibling row,
 * because paint order for the whole context is decided one level up.
 *
 * ── ONE OPEN STATE, REACHABLE THREE WAYS ─────────────────────────────────
 * `library-sidebar.tsx`'s `FolderRow` right-click and Shift+F10 open this
 * SAME menu by passing their own `trigger` in — F1's "one shared menu
 * component", not two that could show different items. Used on its own
 * (this file's test) it makes one for itself, so the "..." button behaves
 * exactly as it always has.
 *
 * ── MOVE ONLY OFFERS DESTINATIONS THAT WOULD SUCCEED ─────────────────────────
 * `canMoveFolder` runs over every candidate BEFORE it is drawn. A folder's own
 * descendant, itself, and anything that would push it past `MAX_FOLDER_DEPTH`
 * are never in the list — offered-then-refused is a worse experience than not
 * offered.
 *
 * ── DELETE NEVER CALLS THE ACTION TWICE WITHOUT A PERSON'S SAY ────────────────
 * The first call carries no `confirmed`. If the folder holds anything,
 * `deleteFolder` refuses with `needs-confirm` and the exact counts, and only a
 * second explicit click calls it again with `confirmed: true`.
 */
type Mode = 'menu' | 'rename' | 'move' | 'new-subfolder' | 'delete-confirm'

export function FolderMenu({
  folder,
  allFolders,
  trigger: externalTrigger,
  onSubfolderCreated,
}: {
  folder: AssetFolder
  allFolders: AssetFolder[]
  trigger?: ContextMenuTrigger
  onSubfolderCreated?: (folderId: string) => void
}) {
  const ownTrigger = useContextMenuTrigger()
  const trigger = externalTrigger ?? ownTrigger
  const label = `Actions for ${folder.name}`

  const [mode, setMode] = useState<Mode>('menu')
  const [name, setName] = useState(folder.name)
  const [subfolderName, setSubfolderName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmInfo, setConfirmInfo] = useState<{
    message: string
    files: number
    subfolders: number
  } | null>(null)
  const [pending, startTransition] = useTransition()

  // F1's direct shortcuts (F2, Delete) skip straight to the mode their key
  // names, rather than opening the top-level list first. `requestDelete` is
  // a `function` declaration, hoisted within this body, so calling it here
  // — textually above its own definition — is safe.
  useEffect(() => {
    if (!trigger.open) return
    setMode('menu')
    setName(folder.name)
    setSubfolderName('')
    setError(null)
    setConfirmInfo(null)
    if (trigger.intent === 'rename') setMode('rename')
    else if (trigger.intent === 'delete') requestDelete()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `requestDelete` closes over `folder`/`trigger`, already named below.
  }, [trigger.open, trigger.intent, folder.name])

  const destinations = allFolders.filter(
    (candidate) =>
      candidate.id !== folder.parent_id && canMoveFolder(allFolders, folder.id, candidate.id).ok,
  )
  const rootIsValid = folder.parent_id !== null && canMoveFolder(allFolders, folder.id, null).ok
  const moveOptions = [
    ...(rootIsValid ? [{ id: null, name: 'Top level' }] : []),
    ...destinations.map((d) => ({ id: d.id, name: d.name })),
  ]

  function submitRename() {
    startTransition(async () => {
      const result = await renameFolder(folder.id, name)
      if (result.ok) return trigger.close()
      setError(result.message)
    })
  }

  function submitMove(newParentId: string | null) {
    startTransition(async () => {
      const result = await moveFolder(folder.id, newParentId)
      if (result.ok) return trigger.close()
      setError(result.reason === 'refused' ? result.decision.message : result.message)
    })
  }

  function submitNewSubfolder() {
    startTransition(async () => {
      const result = await createFolder(subfolderName, folder.id)
      if (result.ok) {
        onSubfolderCreated?.(result.folder.id)
        return trigger.close()
      }
      setError(result.message)
    })
  }

  function requestDelete() {
    startTransition(async () => {
      const result = await deleteFolder(folder.id)
      if (result.ok) return trigger.close()
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
      if (result.ok) return trigger.close()
      setError(result.message)
    })
  }

  return (
    <MenuTrigger
      trigger={trigger}
      ariaLabel={label}
      buttonClassName="grid size-7 place-items-center rounded-sm text-muted transition-micro hover:bg-s2 hover:text-ink focus-visible:bg-s2"
    >
      {mode === 'menu' ? (
        <div className="flex flex-col gap-0.5">
          <MenuItemRow onClick={() => setMode('rename')} shortcut={RENAME_ITEM_KEY} autoFocus>
            Rename
          </MenuItemRow>
          <MenuItemRow onClick={() => setMode('move')}>Move</MenuItemRow>
          <MenuItemRow onClick={() => setMode('new-subfolder')}>New sub-folder</MenuItemRow>
          <MenuItemRow onClick={requestDelete} shortcut={DELETE_ITEM_KEY} destructive>
            Delete
          </MenuItemRow>
        </div>
      ) : null}

      {mode === 'rename' ? (
        <RenameForm
          id={`rename-${folder.id}`}
          label="Rename this folder"
          name={name}
          maxLength={MAX_FOLDER_NAME}
          onNameChange={setName}
          pending={pending}
          onCancel={trigger.close}
          onSubmit={submitRename}
        />
      ) : null}

      {mode === 'new-subfolder' ? (
        <RenameForm
          id={`subfolder-${folder.id}`}
          label={`New folder inside ${folder.name}`}
          name={subfolderName}
          maxLength={MAX_FOLDER_NAME}
          placeholder="Folder name"
          submitLabel="Create"
          onNameChange={setSubfolderName}
          pending={pending}
          onCancel={trigger.close}
          onSubmit={submitNewSubfolder}
        />
      ) : null}

      {mode === 'move' ? (
        <FolderPickerList
          heading="Move to"
          options={moveOptions}
          emptyMessage="There is nowhere else this folder can go."
          onPick={submitMove}
        />
      ) : null}

      {mode === 'delete-confirm' && confirmInfo ? (
        <ConfirmDialog
          message={confirmInfo.message}
          confirmLabel="Delete folder"
          pending={pending}
          onCancel={trigger.close}
          onConfirm={confirmDelete}
          detail={
            <p className="type-meta text-muted">
              <span className="num">{confirmInfo.files}</span>
              {confirmInfo.files === 1 ? ' file stops' : ' files stop'} being filed here.{' '}
              <span className="num">{confirmInfo.subfolders}</span>
              {confirmInfo.subfolders === 1 ? ' sub-folder goes' : ' sub-folders go'} with it.
            </p>
          }
        />
      ) : null}

      {error ? (
        <p role="alert" className="mt-1 px-1 type-meta text-ink-mute">
          {error}
        </p>
      ) : null}
    </MenuTrigger>
  )
}
