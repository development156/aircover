import Link from 'next/link'
import type { Route } from 'next'
import { ArrowRight } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * ONE CARD LANGUAGE FOR THE WHOLE OF HOME.
 *
 * ── THE DEFECT THIS EXISTS TO REMOVE ─────────────────────────────────────────
 * Home rendered its blocks in THREE different card shapes at once, and nothing
 * about the content justified the difference:
 *
 *   · `NeedsAttention`, `BrainCard`, `ConnectionsCard` and the activity block
 *     each hand-wrote `border-b border-line-soft px-4 py-3` around a `type-h3`,
 *     with a 16px body under it. Four copies of the same header, four chances
 *     to drift, and three of them had already drifted in the trailing link:
 *     one `text-accent` with an arrow, two `text-muted` without.
 *   · `Panel` (the charts) ran `p-5` with no divider and a two-line head.
 *   · `Card` wrapped the planner block at 20px with a `CardLabel` instead of a
 *     heading, so one region on the page was not in the heading outline at all.
 *
 * Read down the page, the eye met a 46px ruled header, then a 20px unruled one,
 * then a small caps label — three grammars for "here is a section". That is the
 * whole of the "separate UI blocks rather than one product" complaint, and no
 * amount of restyling the individual cards fixes it, because the problem is
 * that there are three of them.
 *
 * ── THE RULE IS ONE HEADER, AND IT IS NOT RULED ──────────────────────────────
 * No `border-b`. A divider under every card heading is 9 horizontal lines on
 * one screen doing a job that 12px of space does for free, and the ring around
 * the card already says where the card ends. Space separates; a line only earns
 * its ink when two things inside one box would otherwise merge.
 *
 * ── AND THE TRAILING SLOT IS SINGULAR, ON PURPOSE ────────────────────────────
 * The same rule `PanelHead` states: one action per section head. A head with
 * two links is how a screen ends up with nine accent targets and no focal
 * point. It renders muted and turns accent on hover, so the resting page spends
 * no accent on navigation at all — the orange belongs to `Create post`.
 */
export function HomeSection({
  id,
  title,
  count,
  action,
  guide,
  flush,
  className,
  children,
}: {
  /** Ids the heading so the section can be `aria-labelledby` it. */
  id: string
  title: string
  /** A real count of real rows. Rendered only when there is something to count. */
  count?: number
  /** The one place this section can be acted on in full. */
  action?: { href: Route; label: string }
  /** Tour anchor, where a tour targets this region. */
  guide?: string
  /**
   * Body owns its own padding — for lists whose rows run to the card's edge.
   * The header keeps its padding either way, so the heading never moves.
   */
  flush?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      aria-labelledby={id}
      data-guide={guide}
      className={cn('surface-ring rounded-card bg-surface shadow-card', className)}
    >
      <header className="flex items-center gap-2.5 px-5 pt-5 pb-3 max-narrow:px-4 max-narrow:pt-4">
        <h2 id={id} className="type-h3 text-ink">
          {title}
        </h2>
        {typeof count === 'number' && count > 0 ? (
          // The count is a SIGNAL, not an action — a brand tint rather than a
          // brand fill, so it never reads as a second button.
          /* `px-1.5`, not the `px-[5px]` this was copied from: 5 is off the
             4pt ladder and `design-lint` refuses it in a new file. 6 is the
             rung, and a chip holding one or two digits is 18px wide either
             way. */
          <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand-tint px-1.5 type-meta font-bold text-accent tabular-nums">
            {count}
          </span>
        ) : null}
        {action ? (
          <Link
            href={action.href}
            className="card-link ml-auto inline-flex items-center gap-1 type-meta font-[550] text-muted transition-micro hover:gap-1.5 hover:text-accent max-narrow:min-h-[44px]"
          >
            {action.label}
            <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        ) : null}
      </header>
      <div className={flush ? 'pb-1' : 'px-5 pb-5 max-narrow:px-4 max-narrow:pb-4'}>{children}</div>
    </section>
  )
}
