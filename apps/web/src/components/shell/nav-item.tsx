'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BookOpen,
  BrainCircuit,
  CalendarDays,
  ChartColumn,
  CheckCheck,
  FileText,
  House,
  Images,
  Link2,
  Megaphone,
  MessagesSquare,
  Palette,
  Radar,
  RefreshCw,
  Shield,
  Shuffle,
  SlidersHorizontal,
  SquarePen,
  Target,
  UserRoundPlus,
  Wallet,
  Globe,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * ── THERE IS NO `soon` HERE ANY MORE, AND THAT IS NOT A DELETION ─────────────
 * This component used to draw a roadmap item three ways — the word "Soon", a
 * hollow ring when collapsed, and ", not built yet" in the accessible name. The
 * rail no longer renders roadmap items at all (`RAIL_GROUPS` in
 * lib/nav/sections.ts, and the reasoning is there), so every one of those
 * branches became unreachable the moment that projection landed.
 *
 * Unreachable code with a confident comment on it is worse than no code: the
 * next reader takes the comment as a description of what ships. The treatment
 * still exists, unchanged, in the two surfaces that DO list the roadmap —
 * `more-sheet.tsx` for the phone and `command-palette.tsx` for ⌘K — and those
 * are the files to edit if the roadmap's rendering should change.
 */

// Icons resolved client-side by name — component references cannot cross the
// server→client boundary.
const ICONS = {
  house: House,
  'brain-circuit': BrainCircuit,
  'square-pen': SquarePen,
  megaphone: Megaphone,
  images: Images,
  palette: Palette,
  shuffle: Shuffle,
  'calendar-days': CalendarDays,
  'check-check': CheckCheck,
  globe: Globe,
  target: Target,
  'messages-square': MessagesSquare,
  'user-round-plus': UserRoundPlus,
  'chart-column': ChartColumn,
  'file-text': FileText,
  radar: Radar,
  'refresh-cw': RefreshCw,
  'book-open': BookOpen,
  'link-2': Link2,
  wallet: Wallet,
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
   * with it". Zero renders nothing, which is the same rule SurfaceList states: a
   * "0" badge is noise, not information.
   */
  count?: number
}) {
  const pathname = usePathname()
  const active = pathname === href || pathname.startsWith(`${href}/`)
  const Icon = ICONS[icon]

  return (
    <Link
      href={href}
      // Hover and focus still prefetch; only the on-sight fan-out is off.
      // See shell-prefetch.test.ts for the twenty renders this stops.
      prefetch={false}
      data-guide={guide}
      aria-current={active ? 'page' : undefined}
      /**
       * THE OTHER HALF OF THE NINE-UNNAMED-LINKS BUG.
       *
       * The `sr-only` span below restored the ACCESSIBLE name, and its comment
       * states the problem as "unlabelled to the eye across every width from
       * 768 to 1179" — but sr-only fixes only the screen-reader half of that
       * sentence. MEASURED at 1024 on /analytics: eighteen icons in a 64px
       * strip, every label absolutely positioned into a 1px clip, no `title`,
       * no tooltip, and nothing at all on hover. Between 700 and 1179 the whole
       * navigation is anonymous glyphs to anyone using their eyes, which is a
       * band a great many laptops sit in and neither 390 nor 1440 visits.
       *
       * A native `title` is the honest minimal repair: no dependency, no
       * portal, and it cannot be clipped by the rail's `overflow-y: auto` the
       * way a CSS `::after` tooltip would be. It is present at every width
       * rather than only when collapsed, because the collapse is decided in CSS
       * (`max-wide:`) and an attribute cannot read a media query. At the
       * expanded width it merely repeats a visible label, which costs nothing.
       *
       * It does NOT become the accessible name — the span always supplies one,
       * and text content outranks `title` in the accname algorithm.
       */
      title={label}
      className={cn(
        // 34px tall, 9px inset, 13px/500 — the kit's control height. The density
        // is not incidental: 34px rows against 40px is most of what separates
        // this shell from a stock dashboard.
        'relative flex h-[34px] items-center gap-[10px] rounded-sm px-[9px] text-[13px] font-medium text-muted transition-micro',
        'hover:bg-surface-3 hover:text-ink',
        'rail-min:justify-center rail-min:px-0',
        // The active surface is an ALPHA wash (--t50 = orange at 6%), so it
        // composites correctly on white AND on the dark shell — which is why
        // this no longer needs the `dark:bg-s2` override the solid v3 tint did.
        // Orange on the dark-composited wash measures ~6.7:1.
        active && 'bg-brand-wash font-semibold text-accent',
        // The 2px rail. Structure, not decoration: it is the one active signal
        // that survives greyscale, so the state does not rest on hue alone.
        active &&
          'before:absolute before:top-2 before:bottom-2 before:-left-[9px] before:w-[2px] before:rounded-pill before:bg-brand before:content-[""]',
        active && 'rail-min:before:hidden',
      )}
    >
      <Icon size={17} strokeWidth={1.7} className="shrink-0" />
      {/* sr-only, NOT hidden, whenever the rail is minimised. `display:none`
          removes the node from the accessibility tree, which took the link's
          NAME with it — below 1180px all nine nav items announced as unnamed
          links, so the app's main navigation was unusable by screen reader and
          unlabelled to the eye across every width from 768 to 1179.

          `rail-min:` and not `max-wide:` since 2026-08-23, and the widening is
          the point: the rail now also minimises because the READER collapsed
          it, and it opens that way. A rule keyed to the media query alone would
          have restored every label at 1440 the moment the default flipped to
          collapsed, which is the same nine-unnamed-links bug arriving from the
          other direction — names present, layout broken. One spelling covers
          both reasons. sr-only is absolutely positioned, so it leaves the flex
          row and the centred icon is unmoved. */}
      <span className="rail-min:sr-only">{label}</span>

      {count !== undefined && count > 0 ? (
        <>
          {/* Expanded: the number, pushed to the trailing edge. */}
          <span className="ml-auto grid h-[18px] min-w-[18px] flex-none place-items-center rounded-pill bg-brand px-[5px] text-[11px] font-bold text-primary-foreground tabular-nums rail-min:hidden">
            {count}
          </span>
          {/* Collapsed: a dot. The count has nowhere to go in a 64px rail, but
              losing the signal entirely would hide the one thing the badge is
              for. The accessible name below carries the number either way. */}
          <span
            aria-hidden
            className="absolute top-[7px] right-[13px] hidden size-[7px] rounded-pill bg-brand ring-2 ring-surface rail-min:block"
          />
          <span className="sr-only">{count} waiting</span>
        </>
      ) : null}
    </Link>
  )
}
