'use client'

import { CollapseNote, CollapsibleRegion } from '@/components/admin/collapsible-region'
import { useCollapse } from '@/lib/ops/use-collapse'
import { useHashTarget } from '@/lib/ops/use-hash-target'

/**
 * The collapsible half of `/admin/dev` (SL-062 §4).
 *
 * A thin client shell around regions that are still rendered on the SERVER and
 * handed in as slots — so making the layout interactive costs no data fetching
 * and moves no query into the browser. Only the open/closed state is client
 * state.
 *
 * THE HERO CARD IS NOT IN HERE, on purpose. It is the answer to "where are we"
 * and it is never collapsible; a console whose headline can be folded away is a
 * console that can be made to look calm.
 *
 * Every `red` below is computed on the server from the same values the region's
 * own contents use, and is rendered on the collapsed header. A collapse hides
 * detail; it never hides a problem (§5).
 */

/** Only the hero card leads open, and it is not one of these. */
const OPEN_BY_DEFAULT: readonly string[] = []

export function DevRegions({
  adminId,
  strips,
  board,
  changelog,
  charts,
  boardRed = null,
  gatesRed = null,
  cardCount,
}: {
  /** The signed-in admin, so two people on one machine keep separate layouts. */
  adminId: string
  strips: React.ReactNode
  board: React.ReactNode
  changelog: React.ReactNode
  charts: React.ReactNode
  boardRed?: string | null
  gatesRed?: string | null
  cardCount?: string
}) {
  const { isOpen, toggle } = useCollapse(adminId, OPEN_BY_DEFAULT)
  // Following a link to a card must not land on a collapsed region. An OVERRIDE,
  // not a stored preference — see `useHashTarget`.
  const hashTarget = useHashTarget()

  return (
    <div className="space-y-grid">
      <CollapsibleRegion
        id="strips"
        title="Session and checks"
        red={gatesRed}
        open={isOpen('strips')}
        onToggle={() => toggle('strips')}
      >
        {strips}
      </CollapsibleRegion>

      <CollapsibleRegion
        id="board"
        title="Board"
        count={cardCount}
        red={boardRed}
        open={isOpen('board') || hashTarget !== null}
        onToggle={() => toggle('board')}
      >
        {board}
      </CollapsibleRegion>

      <CollapsibleRegion
        id="changelog"
        title="Changelog"
        open={isOpen('changelog')}
        onToggle={() => toggle('changelog')}
      >
        {changelog}
      </CollapsibleRegion>

      <CollapsibleRegion
        id="charts"
        title="Charts"
        red={gatesRed}
        open={isOpen('charts')}
        onToggle={() => toggle('charts')}
      >
        {charts}
      </CollapsibleRegion>

      <CollapseNote />
    </div>
  )
}
