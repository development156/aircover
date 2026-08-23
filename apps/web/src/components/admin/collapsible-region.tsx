'use client'

import { ChevronRight, OctagonAlert } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * A collapsible region of `/admin/dev` (SL-062 §4).
 *
 * Everything on the page is collapsed by default except the hero card, because
 * the console's job is to answer "where are we" in one screen and everything
 * else is detail somebody chose to open.
 *
 * ── THE RULE THAT OUTRANKS THE REST (§5) ────────────────────────────────────
 * A region carrying anything red says so ON ITS COLLAPSED HEADER, in crimson,
 * with the same words it would use open. `red` is not decoration and it is not
 * optional: it is passed in from the same derived value the region's contents
 * use, so a collapsed region cannot be quieter than an open one. Collapsing
 * hides DETAIL. It must never hide a PROBLEM.
 */
export function CollapsibleRegion({
  id,
  title,
  count,
  red = null,
  open,
  onToggle,
  children,
}: {
  id: string
  title: string
  /** Shown beside the title, e.g. "62 cards". Optional. */
  count?: string
  /** One sentence naming what is red inside, or null when the region is clean. */
  red?: string | null
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  const panelId = `region-${id}`

  return (
    <section
      aria-labelledby={`${panelId}-heading`}
      className={cn('rounded-card border bg-bg shadow-card', red ? 'border-danger' : 'border-line')}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-2 rounded-card px-4 py-3 text-left transition-micro hover:bg-s2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <ChevronRight
          size={14}
          strokeWidth={2.2}
          aria-hidden
          className={cn('shrink-0 text-muted transition-micro', open && 'rotate-90')}
        />
        <h2 id={`${panelId}-heading`} className="text-[14px] font-bold tracking-[-0.01em]">
          {title}
        </h2>
        {count ? <span className="text-[12px] text-muted tabular-nums">{count}</span> : null}

        {/* Rendered whether or not the region is open. This is the rule. */}
        {red ? (
          <span className="ml-auto flex items-center gap-1.5 text-[12px] font-medium text-danger">
            <OctagonAlert size={13} strokeWidth={2} aria-hidden className="shrink-0" />
            {red}
          </span>
        ) : null}
      </button>

      {open ? (
        <div id={panelId} className="border-t border-line p-4">
          {children}
        </div>
      ) : null}
    </section>
  )
}

/**
 * The per-browser tradeoff, said out loud (SL-062 §4).
 *
 * `ops_admins` has no preferences column and only `wt-db` may add one, so these
 * choices live in this browser's storage. That is a real limitation and it is
 * written on the page rather than left for somebody to discover by opening the
 * console on a second machine and finding it collapsed again.
 */
export function CollapseNote() {
  return (
    <p className="text-[11px] text-muted">
      Which sections you leave open is remembered in this browser only. A different browser, a
      different machine or a private window starts collapsed again. Nothing red is ever hidden by a
      collapsed section.
    </p>
  )
}
