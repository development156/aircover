'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

/**
 * The five sections of Ads.
 *
 * ── EVERY ONE OF THESE IS A REAL ROUTE, AND THAT IS THE POINT ────────────────
 * Nothing in Ads is built. The tabs are still links to real pages, because a tab
 * that does nothing is the dead end this whole section is designed to avoid: the
 * reader learns what the module will be by WALKING it, and each screen says
 * plainly that it is not running.
 *
 * Links rather than buttons for the reason the system gives everywhere else —
 * each changes the URL, so each must survive cmd-click, a reload and a screen
 * reader's link list.
 */
const TABS: ReadonlyArray<{ href: Route; label: string }> = [
  { href: '/ads', label: 'Overview' },
  { href: '/ads/creative', label: 'Creative' },
  { href: '/ads/targeting', label: 'Audience' },
  { href: '/ads/budget', label: 'Budget' },
  { href: '/ads/performance', label: 'Results' },
]

export function AdsTabs() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Ads sections"
      className="flex gap-5 overflow-x-auto border-b border-line-soft [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {TABS.map((tab) => {
        // Exact match: '/ads' is a prefix of all four others, so `startsWith`
        // would light Overview up on every screen.
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px inline-flex items-center border-b-2 border-transparent pt-[9px] pb-[10px] text-[13px] font-[550] whitespace-nowrap transition-micro max-narrow:min-h-[44px]',
              active ? 'border-brand text-accent' : 'text-muted hover:text-ink',
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
