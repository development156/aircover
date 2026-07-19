'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarDays,
  House,
  Link2,
  SlidersHorizontal,
  Globe,
  SquarePen,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '@/lib/utils'

// Icons resolved client-side by name — component references cannot cross the
// server→client boundary.
const ICONS = {
  house: House,
  'square-pen': SquarePen,
  'calendar-days': CalendarDays,
  'link-2': Link2,
  globe: Globe,
  wallet: Wallet,
  'sliders-horizontal': SlidersHorizontal,
} satisfies Record<string, LucideIcon>

export type NavIconName = keyof typeof ICONS

export function NavItem({
  href,
  label,
  icon,
  guide,
}: {
  // typedRoutes' Route union — no hand-maintained href list to drift
  href: Route
  label: string
  icon: NavIconName
  guide: string
}) {
  const pathname = usePathname()
  const active = pathname === href || pathname.startsWith(`${href}/`)
  const Icon = ICONS[icon]

  return (
    <Link
      href={href}
      data-guide={guide}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-[11px] rounded-input px-3 py-[9px] font-medium text-muted transition-micro',
        'hover:bg-s2 hover:text-ink',
        'max-wide:justify-center max-wide:px-0',
        // dark: --t50 stays warm-light while --acc flips to Orange300 — pairing
        // them is ~1.7:1, so the active surface becomes s2 on dark (9.7:1).
        active && 'bg-tint-50 font-semibold text-accent dark:bg-s2',
      )}
    >
      <Icon size={20} strokeWidth={1.7} className="shrink-0" />
      <span className="max-wide:hidden">{label}</span>
    </Link>
  )
}
