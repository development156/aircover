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
 * ── "MOVE TO TRASH", AND WHY IT NEEDS NO GATE AT ALL ─────────────────────────
 * This used to call `deleteAsset`, which has three shapes, two of which a
 * compact menu cannot honestly draw — so it handed off to "Open" whenever the
 * file was on a post. That whole branch is gone, because trashing cascades
 * nothing: the row, its folders, its attachments and its bytes all stay, so
 * there is no refusal to express and nothing to confirm.
 *
 * The permanent delete still has all three shapes and still lives behind
 * `AssetDeleteButton`, now in the trash where the act really is final.
 *
 * The outcome is NOT reported here. A menu closes the instant it is used, and a
 * control that reports an outcome has to outlive the state change it causes —
 * so `onTrash` hands off to the banner, which also carries the Undo.
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
  onTrash,
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
  /** Moves this file to the trash and reports it in the banner, with Undo. */
  onTrash: () => void
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('menu')
  const [name, setName] = useState(card.title ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const label = `Actions for ${displayName(card)}`

  // `moveToTrash` is a `function` declaration below, hoisted within this
  // component body, so referencing it here — textually above it — is safe.
  useEffect(() => {
    if (!trigger.open) return
    setMode('menu')
    setName(card.title ?? '')
    setError(null)
    if (trigger.intent === 'rename') setMode('rename')
    else if (trigger.intent === 'delete') moveToTrash()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `moveToTrash` closes over `card`/`trigger`, already named below.
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

  function moveToTrash() {
    onTrash()
    trigger.close()
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
            onClick={moveToTrash}
            shortcut={DELETE_ITEM_KEY}
            destructive
            disabled={pending}
          >
            Move to trash
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
