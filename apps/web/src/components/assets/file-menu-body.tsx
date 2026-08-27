'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { AssetFolder } from '@sahoda/shared'

import { deleteAsset, updateAsset } from '@/app/actions/assets'
import {
  DELETE_ITEM_KEY,
  OPEN_ITEM_KEY,
  RENAME_ITEM_KEY,
} from '@/components/assets/library-shortcuts'
import { FolderPickerList, RenameForm } from '@/components/assets/menu-forms'
import { MenuItemRow } from '@/components/assets/menu-item-row'
import { MenuTrigger } from '@/components/assets/menu-trigger'
import type { ContextMenuTrigger } from '@/components/assets/use-context-menu-trigger'
import { displayName } from '@/lib/assets/view'
import type { AssetCard } from '@/lib/assets/view'

type Mode = 'menu' | 'rename' | 'file-into'

/**
 * F1's FILE menu: Open, Rename, File into folder, Remove from this folder
 * (only inside a real folder), Copy name, Delete. Same shell as
 * `folder-menu.tsx` — `MenuTrigger`, a shared `trigger`, portalled to
 * `document.body` for the same reason B1's fix exists.
 *
 * ── DELETE STOPS AT WHAT A MENU ITEM CAN HONESTLY DO ─────────────────────────
 * `deleteAsset` has three shapes. `ok` finishes right here — nothing uses the
 * file, one click, done. The other two (`needs-confirm`: only unpublished
 * posts use it; `refused`: a scheduled or published one does) both hand off
 * to "Open", which already renders `AssetDeleteButton`'s full confirm-with-
 * counts and refusal-with-`UsageList` screens. This menu does not draw a
 * second, smaller copy of either — a compact menu re-explaining a delete
 * gate is worse than a menu that tries, and when it cannot finish, goes to
 * the one place that always can.
 */
export function FileMenuBody({
  card,
  folders,
  insideFolderId,
  trigger,
  onOpen,
  onFileInto,
  onRemoveFromFolder,
  onDeleted,
}: {
  card: AssetCard
  folders: readonly AssetFolder[]
  /** The real folder this file is being viewed inside, if any — gates
   *  "Remove from this folder". */
  insideFolderId: string | null
  trigger: ContextMenuTrigger
  onOpen: () => void
  onFileInto: (folderId: string) => void
  onRemoveFromFolder: () => void
  onDeleted: () => void
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('menu')
  const [name, setName] = useState(card.title ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const label = `Actions for ${displayName(card)}`

  // `attemptDelete` is a `function` declaration below, hoisted within this
  // component body, so referencing it here — textually above it — is safe.
  useEffect(() => {
    if (!trigger.open) return
    setMode('menu')
    setName(card.title ?? '')
    setError(null)
    if (trigger.intent === 'rename') setMode('rename')
    else if (trigger.intent === 'delete') attemptDelete()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `attemptDelete` closes over `card`/`trigger`, already named below.
  }, [trigger.open, trigger.intent, card.title])

  function submitRename() {
    startTransition(async () => {
      const result = await updateAsset(card.id, { title: name })
      if (result.ok) {
        router.refresh()
        return trigger.close()
      }
      setError(result.message)
    })
  }

  async function copyName() {
    try {
      await navigator.clipboard.writeText(displayName(card))
      trigger.close()
    } catch {
      // The name is already visible on the tile itself, so selecting it by
      // hand is a real remedy — never a dead end — when the clipboard API
      // itself is unavailable (an insecure context, a denied permission).
      setError('Could not copy that. Select the name on the tile instead.')
    }
  }

  function attemptDelete() {
    startTransition(async () => {
      const result = await deleteAsset(card.id, false)
      if (result.ok) {
        onDeleted()
        router.refresh()
        return trigger.close()
      }
      if (result.reason === 'needs-confirm' || result.reason === 'refused') {
        onOpen()
        return trigger.close()
      }
      setError(result.message)
    })
  }

  return (
    <MenuTrigger
      trigger={trigger}
      ariaLabel={label}
      buttonClassName="grid size-7 place-items-center rounded-sm bg-surface text-muted shadow-pop transition-micro hover:text-ink focus-visible:bg-s2"
    >
      {mode === 'menu' ? (
        <div className="flex flex-col gap-0.5">
          <MenuItemRow
            onClick={() => {
              onOpen()
              trigger.close()
            }}
            shortcut={OPEN_ITEM_KEY}
            autoFocus
          >
            Open
          </MenuItemRow>
          <MenuItemRow onClick={() => setMode('rename')} shortcut={RENAME_ITEM_KEY}>
            Rename
          </MenuItemRow>
          <MenuItemRow onClick={() => setMode('file-into')}>File into folder</MenuItemRow>
          {insideFolderId !== null ? (
            <MenuItemRow
              onClick={() => {
                onRemoveFromFolder()
                trigger.close()
              }}
            >
              Remove from this folder
            </MenuItemRow>
          ) : null}
          <MenuItemRow onClick={copyName}>Copy name</MenuItemRow>
          <MenuItemRow
            onClick={attemptDelete}
            shortcut={DELETE_ITEM_KEY}
            destructive
            disabled={pending}
          >
            Delete
          </MenuItemRow>
        </div>
      ) : null}

      {mode === 'rename' ? (
        <RenameForm
          id={`file-rename-${card.id}`}
          label="Rename this file"
          name={name}
          maxLength={120}
          onNameChange={setName}
          pending={pending}
          onCancel={trigger.close}
          onSubmit={submitRename}
        />
      ) : null}

      {mode === 'file-into' ? (
        <FolderPickerList
          heading="File into"
          options={folders.map((folder) => ({ id: folder.id, name: folder.name }))}
          emptyMessage="Make a folder first."
          onPick={(folderId) => {
            if (folderId === null) return
            onFileInto(folderId)
            trigger.close()
          }}
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
