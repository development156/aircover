import Link from 'next/link'
import { CalendarDays, CalendarRange, LayoutGrid, List } from 'lucide-react'

import { cn } from '@/lib/utils'

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

/**
 * The kit's `.sl-seg`: a 3px-padded well at `--r`, items 28px at `--r-sm`, and
 * the ACTIVE item lifted onto `--surface` with a small shadow rather than
 * pushed into a darker fill. That inversion is the point — the selected segment
 * reads as raised out of the group, not sunk into it.
 *
 * Links, not client state: the view survives reload and the back button.
 */
export function ViewToggle({ active }: { active: PlannerView }) {
  return (
    <nav aria-label="Planner view" className="inline-flex gap-[2px] rounded-[8px] bg-s2 p-[3px]">
      {VIEWS.map(({ view, label, icon: Icon }) => (
        <Link
          key={view}
          href={{ pathname: '/planner', query: { view } }}
          aria-current={active === view ? 'page' : undefined}
          className={cn(
            'inline-flex h-7 items-center gap-[6px] rounded-sm px-[11px] text-[13px] font-[550] transition-micro max-narrow:h-11',
            active === view ? 'bg-surface text-accent shadow-card' : 'text-muted hover:text-ink',
          )}
        >
          <Icon size={14} strokeWidth={1.8} aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  )
}
