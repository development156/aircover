'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CreditCard, Layout, Link2, User } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * The settings side nav (reference `.snav` — 196px rail + content pane).
 *
 * ── WHY FOUR AND NOT EIGHT ───────────────────────────────────────────────────
 * The reference lists eight: Workspace, Profile, Team, Notifications,
 * Integrations, Billing, Credits, Security. Four of them have no data source in
 * this product, so they are OMITTED rather than stubbed:
 *
 *   Notifications  no preference store exists — nothing to read or write
 *   Security       Clerk owns sessions; the app has no read for them
 *   Team           `workspace_members` holds roles but not names; listing
 *                  members would need Clerk name resolution that does not exist
 *   Billing        no invoice store. Plan lives with credits, so they are ONE
 *                  tab rather than two half-empty ones
 *
 * A tab that opens onto nothing is worse than no tab: it promises a setting the
 * product does not have, and the person who clicks it learns that the hard way.
 */
const NAV: ReadonlyArray<{ href: Route; label: string; icon: typeof Layout }> = [
  { href: '/settings', label: 'Workspace', icon: Layout },
  { href: '/settings/profile', label: 'Profile', icon: User },
  { href: '/settings/integrations', label: 'Integrations', icon: Link2 },
  { href: '/settings/plan', label: 'Plan & credits', icon: CreditCard },
]

export function SettingsNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Settings sections" className="flex flex-col gap-[2px]">
      {NAV.map((item) => {
        // Exact match: '/settings' is a prefix of every other entry, so
        // startsWith would light up Workspace on all four.
        const active = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex h-[34px] items-center gap-[10px] rounded-sm px-[9px] text-[13px] font-medium transition-micro',
              active
                ? 'bg-brand-wash font-semibold text-accent'
                : 'text-muted hover:bg-surface-3 hover:text-ink',
            )}
          >
            <item.icon size={15} strokeWidth={1.8} className="shrink-0" aria-hidden />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
