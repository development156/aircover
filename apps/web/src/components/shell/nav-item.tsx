'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BrainCircuit,
  CalendarDays,
  ChartColumn,
  House,
  Link2,
  SlidersHorizontal,
  Globe,
  Images,
  Shield,
  SquarePen,
  Wallet,
  type LucideIcon,
  MessagesSquare,
} from 'lucide-react'

import { cn } from '@/lib/utils'

// Icons resolved client-side by name — component references cannot cross the
// server→client boundary.
const ICONS = {
  house: House,
  'brain-circuit': BrainCircuit,
  'square-pen': SquarePen,
  'calendar-days': CalendarDays,
  'chart-column': ChartColumn,
  'link-2': Link2,
  images: Images,
  globe: Globe,
  wallet: Wallet,
  'messages-square': MessagesSquare,
  'sliders-horizontal': SlidersHorizontal,
  shield: Shield,
} satisfies Record<string, LucideIcon>

export type NavIconName = keyof typeof ICONS

export function NavItem({
  href,
  label,
  icon,
  guide,
  count,
}: {
  // typedRoutes' Route union — no hand-maintained href list to drift
  href: Route
  label: string
  icon: NavIconName
  guide: string
  /**
   * A live count for this destination (reference: Approvals 5, Conversations 3).
   *
   * SPECIFICATION.md §7 is explicit that this is DERIVED and never sent — the
   * sidebar badge, the Home count and the page's own header must read one
   * collection, because "a separate pendingCount field will eventually disagree
   * with it". Nothing passes it yet; the slot exists so that whoever wires the
   * first one wires it from the collection rather than inventing a field.
   *
   * Zero renders nothing. That is the same rule SurfaceList already states — a
   * "0" badge is noise, not information — and it also means an unwired nav item
   * is indistinguishable from a genuinely empty one, which is correct: both have
   * nothing to report.
   */
  count?: number
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
        // 34px tall, 9px inset, 13px/500 — the kit's control height. The density
        // is not incidental: 34px rows against 40px is most of what separates
        // this shell from a stock dashboard.
        'relative flex h-[34px] items-center gap-[10px] rounded-sm px-[9px] text-[13px] font-medium text-muted transition-micro',
        'hover:bg-surface-3 hover:text-ink',
        'max-wide:justify-center max-wide:px-0',
        // The active surface is an ALPHA wash (--t50 = orange at 6%), so it
        // composites correctly on white AND on the dark shell — which is why
        // this no longer needs the `dark:bg-s2` override the solid v3 tint did.
        // Orange on the dark-composited wash measures ~6.7:1.
        active && 'bg-brand-wash font-semibold text-accent',
        // The 2px rail. Structure, not decoration: it is the one active signal
        // that survives greyscale, so the state does not rest on hue alone.
        active &&
          'before:absolute before:top-2 before:bottom-2 before:-left-[9px] before:w-[2px] before:rounded-full before:bg-brand before:content-[""]',
        active && 'max-wide:before:hidden',
      )}
    >
      <Icon size={17} strokeWidth={1.7} className="shrink-0" />
      {/* sr-only, NOT hidden, when the rail collapses. `display:none` removes the
          node from the accessibility tree, which took the link's NAME with it —
          below 1180px all nine nav items announced as unnamed links, so the app's
          main navigation was unusable by screen reader and unlabelled to the eye
          across every width from 768 to 1179. The collapse to a 64px icon rail is
          the reference's design; losing the name was not. sr-only is absolutely
          positioned, so it leaves the flex row and the centred icon is unmoved. */}
      <span className="max-wide:sr-only">{label}</span>
      {count !== undefined && count > 0 ? (
        <>
          {/* Expanded: the number, pushed to the trailing edge. */}
          <span className="ml-auto grid h-[18px] min-w-[18px] flex-none place-items-center rounded-full bg-brand px-[5px] text-[11px] font-bold text-primary-foreground tabular-nums max-wide:hidden">
            {count}
          </span>
          {/* Collapsed: a dot. The count has nowhere to go in a 64px rail, but
              losing the signal entirely would hide the one thing the badge is
              for. The accessible name below carries the number either way. */}
          <span
            aria-hidden
            className="absolute top-[7px] right-[13px] hidden size-[7px] rounded-full bg-brand ring-2 ring-surface max-wide:block"
          />
          <span className="sr-only">{count} waiting</span>
        </>
      ) : null}
    </Link>
  )
}
