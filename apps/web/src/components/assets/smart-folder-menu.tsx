'use client'

import { useState, useTransition } from 'react'
import type { AssetSmartFolder } from '@sahoda/shared'

import { deleteSmartFolder } from '@/app/actions/asset-smart-folders'
import { MenuItemRow } from '@/components/assets/menu-item-row'
import { MenuTrigger } from '@/components/assets/menu-trigger'
import { useContextMenuTrigger } from '@/components/assets/use-context-menu-trigger'

/**
 * A smart folder's own menu. Just one action: forget the question.
 *
 * Same B1 fix as `folder-menu.tsx`: portalled through `MenuTrigger` →
 * `FloatingPanel` rather than an `absolute` panel trapped by the row's own
 * transform.
 *
 * No confirm step: `deleteSmartFolder` has nothing to warn about, because a
 * smart folder holds no membership table — deleting it forgets a saved
 * question and touches no file, no filing and no other folder.
 */
export function SmartFolderMenu({ folder }: { folder: AssetSmartFolder }) {
  const trigger = useContextMenuTrigger()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const label = `Actions for ${folder.name}`

  function remove() {
    setError(null)
    startTransition(async () => {
      const result = await deleteSmartFolder(folder.id)
      if (result.ok) return trigger.close()
      setError(result.message)
    })
  }

  return (
    <MenuTrigger
      trigger={trigger}
      ariaLabel={label}
      buttonClassName="grid size-7 place-items-center rounded-sm text-muted transition-micro hover:bg-s2 hover:text-ink"
    >
      <MenuItemRow onClick={remove} disabled={pending} autoFocus>
        Forget this smart folder
      </MenuItemRow>
      {error ? (
        <p role="alert" className="mt-1 px-1 type-meta text-ink-mute">
          {error}
        </p>
      ) : null}
    </MenuTrigger>
  )
}
