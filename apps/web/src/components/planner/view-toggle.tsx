import Link from 'next/link'

import { cn } from '@/lib/utils'

export type PlannerView = 'week' | 'list'

const VIEWS: ReadonlyArray<{ view: PlannerView; label: string }> = [
  { view: 'list', label: 'List' },
  { view: 'week', label: 'Week' },
]

/**
 * Calendar ⇄ list segmented control (UXUI 4.4, Alpha cut of the Kanban
 * toggle). Links, not client state — the view survives reload and back.
 */
export function ViewToggle({ active }: { active: PlannerView }) {
  return (
    <nav aria-label="Planner view" className="flex gap-1 rounded-pill border border-line bg-bg p-1">
      {VIEWS.map(({ view, label }) => (
        <Link
          key={view}
          href={{ pathname: '/planner', query: { view } }}
          aria-current={active === view ? 'page' : undefined}
          className={cn(
            'rounded-pill px-3 py-1 text-[13px] font-semibold transition-micro',
            active === view ? 'bg-s2 text-ink' : 'text-muted hover:text-ink',
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}
