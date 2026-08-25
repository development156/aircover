'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

/**
 * The slim sub-nav inside `/admin` (doc 13 §14).
 *
 * All five sections are built now, so all five are links. The `pending` arm is
 * kept rather than deleted: it is how this nav stays honest the next time a
 * section is added ahead of its screen — an unbuilt section renders as plain
 * disabled text naming the card that builds it, instead of a link that 404s.
 * A nav that lies about where it can take you is fake success in navigation
 * form.
 */
export type Section =
  { label: string; href: Route; pending?: never } | { label: string; href?: never; pending: string }

const SECTIONS: readonly Section[] = [
  { label: 'Dev', href: '/admin/dev' },
  { label: 'QA', href: '/admin/qa' },
  { label: 'Applications', href: '/admin/applications' },
  { label: 'Credits', href: '/admin/credits' },
  // The publishes that failed. Reachable from the nav because a dead-letter list
  // nobody can find is the same as no dead-letter list — and this one was
  // invisible for a different reason until migration 20260822160000: the table
  // had one member-scoped policy, so an operator's view of it was empty.
  { label: 'Dead letters', href: '/admin/jobs' },
  // The Marketing Brain's store. In the nav because it is the ONLY window onto
  // a table customers cannot see: hidden and unobservable is how a job that
  // writes nothing goes unnoticed for a season.
  { label: 'Marketing Brain', href: '/admin/brain' },
  { label: 'Team', href: '/admin/team' },
]

const ITEM =
  'rounded-input px-3 py-[7px] text-[13px] font-medium transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

/**
 * `sections` is a test seam, not configuration. Every section is built today, so
 * the pending arm has no live example — passing one in is how its guarantee
 * stays covered instead of becoming dead code nobody checks.
 */
export function AdminSubNav({ sections = SECTIONS }: { sections?: readonly Section[] } = {}) {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Admin sections"
      className="flex items-center gap-1 border-b border-line bg-bg px-page max-narrow:px-page-mobile"
    >
      {sections.map((section) =>
        section.href ? (
          <Link
            key={section.label}
            href={section.href}
            aria-current={pathname === section.href ? 'page' : undefined}
            className={cn(
              ITEM,
              'text-muted hover:bg-s2 hover:text-ink',
              pathname === section.href && 'bg-tint-50 font-semibold text-accent dark:bg-s2',
            )}
          >
            {section.label}
          </Link>
        ) : (
          /* No `aria-disabled`. It says a control EXISTS and is currently
             unavailable, which is untrue of a screen that was never built —
             `inert.tsx` and `connections/channel-tile.tsx` both state the same
             rule. A plain <span> is already not focusable and not announced as a
             control, so the honest treatment is to say nothing about
             availability at all; the title says what is actually true. */
          <span
            key={section.label}
            title={`Not built yet. ${section.pending} builds this screen.`}
            className={cn(ITEM, 'cursor-not-allowed text-faint')}
          >
            {section.label}
          </span>
        ),
      )}
    </nav>
  )
}
