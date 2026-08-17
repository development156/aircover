import Link from 'next/link'
import { CalendarDays, LayoutGrid, List } from 'lucide-react'

import { cn } from '@/lib/utils'

export type PlannerView = 'month' | 'week' | 'list'

/**
 * The reference's primary planner view is a MONTH CALENDAR — `Calendar` sits
 * first in its `.seg`, ahead of `Board`. This app had only List and Week, so
 * the question "what does my month look like" had no answer anywhere.
 *
 * `month` therefore leads. `week` and `list` stay: the week grid is what the
 * Home strip links into, and the list is the only view that shows unscheduled
 * work, which a calendar structurally cannot.
 */
const VIEWS: ReadonlyArray<{ view: PlannerView; label: string; icon: typeof List }> = [
  { view: 'month', label: 'Calendar', icon: CalendarDays },
  { view: 'week', label: 'Week', icon: LayoutGrid },
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
