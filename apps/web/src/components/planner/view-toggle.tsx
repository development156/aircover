import Link from 'next/link'
import { CalendarDays, CalendarRange, LayoutGrid, List } from 'lucide-react'

import { Segmented, segmentedItem } from '@/components/planner/segmented'

export type PlannerView = 'day' | 'week' | 'month' | 'list'

/**
 * Day · Week · Month · List, in the order a scheduling tool reads: tightest
 * window first, widest last, and the list — which is not a window at all — at
 * the end.
 *
 * `month` was previously labelled "Calendar" and led the group. It is now named
 * for what it shows, because with a DAY and a WEEK beside it every one of them
 * is a calendar and the word had stopped distinguishing anything.
 *
 * `list` stays and is still the DEFAULT (see the route). It is the only view
 * that can show unscheduled work — a post with no `scheduled_at` has no cell to
 * sit in — and the seeded approve tour anchors on its rows.
 */
const VIEWS: ReadonlyArray<{ view: PlannerView; label: string; icon: typeof List }> = [
  { view: 'day', label: 'Day', icon: CalendarRange },
  { view: 'week', label: 'Week', icon: LayoutGrid },
  { view: 'month', label: 'Month', icon: CalendarDays },
  { view: 'list', label: 'List', icon: List },
]

/** The reader's other choices, carried across a view change. */
export interface PlannerCarry {
  tab?: string
  q?: string
  date?: string
  week?: string
}

/**
 * The kit's `.sl-seg`: a 3px-padded well at `--r`, items 28px at `--r-sm`, and
 * the ACTIVE item lifted onto `--surface` with a small shadow rather than
 * pushed into a darker fill. That inversion is the point — the selected segment
 * reads as raised out of the group, not sunk into it.
 *
 * Links, not client state: the view survives reload and the back button.
 *
 * ── AND IT CARRIES THE FILTER, WHICH IT USED TO THROW AWAY ───────────────────
 * Every link emitted `{ view }` and nothing else, so clicking Month silently
 * discarded the tab, the search, the picked day and the week offset. Three
 * other controls on this page take explicit care not to do that and each says
 * so in its own header — `PlannerToolbar`, `PlannerMiniCalendar` and `WeekNav`
 * — and the route's own comment claims "a tab or a search that vanished when
 * you clicked Month would read as the filter having been discarded". The
 * toolbar stayed on screen; the filter behind it did not.
 *
 * `view` is spread LAST so a caller cannot overwrite it with a stale carry.
 * Empty values are omitted by the caller rather than blanked here, because
 * `q=` in a URL is a search for the empty string, not the absence of one.
 */
export function ViewToggle({ active, carry }: { active: PlannerView; carry: PlannerCarry }) {
  return (
    <Segmented label="Planner view">
      {VIEWS.map(({ view, label, icon: Icon }) => (
        <Link
          key={view}
          href={{ pathname: '/planner', query: { ...carry, view } }}
          aria-current={active === view ? 'page' : undefined}
          /* `h-7` and `font-[550]` are this control's own; the well, the radii,
             the gap and the lifted-active treatment come from `Segmented`, so
             the filter tabs one row below cannot drift away from them again.
             The hand-written 13px and 11px went with the shared classes —
             `type-sm` IS 13px, and `px-3` is the rung `px-[11px]` was rounding. */
          className={segmentedItem(active === view, 'h-7 font-[550] max-narrow:h-11')}
        >
          <Icon size={14} strokeWidth={1.8} aria-hidden />
          {label}
        </Link>
      ))}
    </Segmented>
  )
}
