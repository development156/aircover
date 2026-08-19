'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

/**
 * Section tabs for the Brand Brain — the kit's `.sl-utabs`.
 *
 * Underline tabs, not segmented pills: the kit uses segmented controls to switch
 * a VIEW of the same data, and underline tabs to navigate between SECTIONS.
 * These are real routes, so they are the latter.
 *
 * Three of the four sections are not built yet. They are still listed, because
 * the point of this row is to show what the Brand Brain is for — and each one
 * lands on a screen that says plainly that it does not exist yet, rather than
 * on a 404 or a blank page.
 */
const TABS: ReadonlyArray<{ href: Route; label: string }> = [
  { href: '/brain', label: 'Overview' },
  /**
   * The Signal Resolution Console. Second, not last: on a freshly resolved
   * brain every field is a guess, so this is the tab with all the work in it,
   * and a route with no nav entry is a dead end by the product's own rule.
   */
  { href: '/brain/resolve', label: 'Resolve' },
  // Two tabs the app HAS data for, and which the flat grid used to bury:
  // five sections sat in one undifferentiated list.
  { href: '/brain/identity', label: 'Identity' },
  { href: '/brain/voice', label: 'Voice & Tone' },
  // Three the app does not. They render the coming-soon screen rather than a
  // stub, and they are NOT the same thing as the brain fields that resemble
  // them — `customer_persona` is a brand fact the brain already holds and lives
  // under Identity; "Audience Twin" is an unbuilt feature.
  { href: '/brain/audience', label: 'Audience' },
  { href: '/brain/competitors', label: 'Competitors' },
  { href: '/brain/knowledge', label: 'Knowledge' },
]

export function BrainTabs() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Brand Brain sections"
      // `scrollbar-none` + overflow-x so the row scrolls rather than wraps on a
      // phone — a wrapped tab row reads as two rows of unrelated links.
      className="flex gap-5 overflow-x-auto border-b border-line-soft [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {TABS.map((tab) => {
        // Exact match only: '/brain' is a prefix of every other tab, so
        // startsWith would light up Overview on all four.
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
