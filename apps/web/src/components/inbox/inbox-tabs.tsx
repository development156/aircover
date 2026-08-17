'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

/**
 * The three read surfaces. Client-side only because the active tab depends on the
 * current path — nothing else here is interactive.
 */
const TABS: ReadonlyArray<{ href: Route; label: string; guide: string }> = [
  { href: '/inbox' as Route, label: 'Messages', guide: 'inbox.tab.messages' },
  { href: '/inbox/comments' as Route, label: 'Comments', guide: 'inbox.tab.comments' },
  { href: '/inbox/reviews' as Route, label: 'Reviews', guide: 'inbox.tab.reviews' },
]

export function InboxTabs() {
  const pathname = usePathname()

  return (
    <nav aria-label="Inbox sections" data-guide="inbox.tabs">
      <ul className="flex flex-wrap gap-1.5">
        {TABS.map((tab) => {
          // `/inbox` must not match `/inbox/reviews`, so the root tab compares exactly
          // and also owns `/inbox/threads/*`, which is a message thread.
          const active =
            tab.href === '/inbox'
              ? pathname === '/inbox' || pathname.startsWith('/inbox/threads')
              : pathname === tab.href || pathname.startsWith(`${tab.href}/`)

          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                data-guide={tab.guide}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center rounded-pill px-3.5 py-[7px] text-[14px] font-semibold transition-micro max-narrow:min-h-[44px]',
                  active
                    ? 'bg-ink text-white dark:bg-white dark:text-[var(--canvas)]'
                    : 'bg-s2 text-muted hover:bg-tint-50 hover:text-ink dark:hover:bg-s2',
                )}
              >
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
