'use client'

import { AssetDetail } from '@/components/assets/asset-detail'
import { LibrarySidebar } from '@/components/assets/library-sidebar'
import { Drawer } from '@/components/ui/drawer'
import { displayName } from '@/lib/assets/view'
import type { AssetCard } from '@/lib/assets/view'

/** Everything the library renders OUTSIDE the three-column layout: the phone
 *  folders sheet and the file detail drawer.
 *
 *  ── THERE IS ONE WAY TO LOOK AT A PHOTO, NOT TWO ────────────────────────────
 *  A separate Quick Look panel used to live here. It rendered the thumbnail, the
 *  name, the size and the dimensions: a strict SUBSET of this drawer, which
 *  shows all of that plus where the photo is used, its description, and delete.
 *  Two overlapping ways to view one file is the complexity this pass exists to
 *  remove, so Space now opens the drawer and there is a single answer to "show
 *  me this photo". */
export function LibraryOverlays({
  sidebarOpenOnPhone,
  onCloseSidebarOnPhone,
  sidebarProps,
  openCard,
  onCloseDetail,
}: {
  sidebarOpenOnPhone: boolean
  onCloseSidebarOnPhone: () => void
  sidebarProps: React.ComponentProps<typeof LibrarySidebar>
  openCard: AssetCard | null
  onCloseDetail: () => void
}) {
  return (
    <>
      <Drawer
        open={sidebarOpenOnPhone}
        onClose={onCloseSidebarOnPhone}
        title="Folders"
        side="bottom"
      >
        <LibrarySidebar {...sidebarProps} collapsed={false} />
      </Drawer>

      <Drawer
        open={openCard !== null}
        onClose={onCloseDetail}
        title={openCard === null ? 'File' : displayName(openCard)}
        className="text-left"
      >
        {openCard !== null ? <AssetDetail card={openCard} onDeleted={onCloseDetail} /> : null}
      </Drawer>
    </>
  )
}
