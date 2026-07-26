'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

/**
 * The slim sub-nav inside `/admin` (doc 13 §14).
 *
 * `pending` is the honest half of this component. Four of the five sections are
 * P3 work, and typedRoutes will not let a Link point at a route that does not
 * exist — so rather than shipping five links where one 404s, an unbuilt section
 * renders as plain disabled text that says which card builds it. A nav that
 * lies about where it can take you is the same fake-success this project
 * refuses, just in navigation form.
 */
type Section =
  { label: string; href: Route; pending?: never } | { label: string; href?: never; pending: string }

const SECTIONS: readonly Section[] = [
  { label: 'Dev', href: '/admin/dev' },
  { label: 'QA', pending: 'SL-018' },
  { label: 'Applications', pending: 'SL-025' },
  { label: 'Credits', pending: 'SL-027' },
  { label: 'Team', pending: 'SL-029' },
]

const ITEM =
  'rounded-input px-3 py-[7px] text-[13px] font-medium transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

export function AdminSubNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Admin sections"
      className="flex items-center gap-1 border-b border-line bg-bg px-page max-narrow:px-page-mobile"
    >
      {SECTIONS.map((section) =>
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
          <span
            key={section.label}
            aria-disabled="true"
            title={`Not built yet — ${section.pending} builds this screen.`}
            className={cn(ITEM, 'cursor-not-allowed text-faint')}
          >
            {section.label}
          </span>
        ),
      )}
    </nav>
  )
}
