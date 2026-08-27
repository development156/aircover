'use client'

import type { ComponentPropsWithRef, ComponentProps } from 'react'

import { LibraryContent } from '@/components/assets/library-content'
import { LibraryOverlays } from '@/components/assets/library-overlays'
import { LibrarySearch } from '@/components/assets/library-search'
import { LibrarySidebar } from '@/components/assets/library-sidebar'
import { LibraryStatus } from '@/components/assets/library-status'
import { LibraryToolbar } from '@/components/assets/library-toolbar'
import { ShortcutSheet } from '@/components/assets/shortcut-sheet'

/**
 * THE LAYOUT, once everything above it has decided WHAT to show. Split out
 * of `asset-library.tsx` only to keep that file under 300 lines — every
 * prop group here is a straight pass-through to the component that already
 * owns that piece's own prop type, so this file adds no new decisions of
 * its own, only assembly.
 */
export function LibraryShell({
  toolbar,
  search,
  sidebar,
  content,
  trash,
  status,
  overlays,
  shortcutSheet,
}: {
  toolbar: Omit<ComponentProps<typeof LibraryToolbar>, 'children'>
  search: ComponentPropsWithRef<typeof LibrarySearch>
  sidebar: ComponentProps<typeof LibrarySidebar>
  content: ComponentProps<typeof LibraryContent>
  /**
   * Rendered INSTEAD of `content` when the person is in the trash, and null
   * everywhere else.
   *
   * A node rather than a prop bag, and swapped rather than flagged, because not
   * one of `LibraryContent`'s controls means anything in the trash: a trashed
   * file cannot be filed, attached, renamed or bulk-moved. Passing a `trash`
   * boolean down would put a branch in every one of those components, and each
   * branch would be a chance to leave a control on screen that does nothing.
   */
  trash: React.ReactNode | null
  status: ComponentProps<typeof LibraryStatus>
  overlays: ComponentProps<typeof LibraryOverlays>
  shortcutSheet: ComponentProps<typeof ShortcutSheet>
}) {
  return (
    <div className="flex flex-col gap-3">
      <LibraryToolbar {...toolbar}>
        <LibrarySearch {...search} />
      </LibraryToolbar>

      <div className="flex min-w-0 flex-1 items-start gap-4">
        <div className="max-narrow:hidden">
          <LibrarySidebar {...sidebar} />
        </div>

        {trash ?? <LibraryContent {...content} />}
      </div>

      <LibraryStatus {...status} />
      <LibraryOverlays {...overlays} />
      <ShortcutSheet {...shortcutSheet} />
    </div>
  )
}
