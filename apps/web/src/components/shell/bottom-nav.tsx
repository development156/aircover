'use client'

import type { Route } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BrainCircuit, CalendarDays, House, MessagesSquare, Plus } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * The phone shell (SPECIFICATION.md §10, <768px).
 *
 * MOBILE IS RECOMPOSED, NOT SHRUNK. The rail does not narrow to a 64px strip
 * down here — it is REPLACED. A 64px icon strip spends a sixth of a 390px
 * viewport on chrome, and gives every destination the same weight, which is
 * exactly wrong on the device where you have room for four things.
 *
 * So: four destinations, chosen because they are what someone opens the app on
 * a phone to do — see today, check the inbox, look at the plan, read the brain.
 * Everything else stays one tap away through the header, and nothing is
 * removed from the product, only from this bar.
 *
 * The `+` is dominant on purpose. Creating a post is the one job that starts
 * here rather than continues here, so it gets a 50px orange circle and the
 * middle slot instead of a fifth equal tab.
 *
 * Every target clears 44px (§11). Desktop stays dense at 34px — the two are
 * different devices, not one layout at two sizes.
 */

const LEFT: ReadonlyArray<{ href: Route; label: string; icon: typeof House }> = [
  { href: '/home', label: 'Home', icon: House },
  { href: '/inbox', label: 'Inbox', icon: MessagesSquare },
]

const RIGHT: ReadonlyArray<{ href: Route; label: string; icon: typeof House }> = [
  { href: '/planner', label: 'Planner', icon: CalendarDays },
  { href: '/brain', label: 'Brain', icon: BrainCircuit },
]

function Tab({ href, label, icon: Icon }: { href: Route; label: string; icon: typeof House }) {
  const pathname = usePathname()
  const active = pathname === href || pathname.startsWith(`${href}/`)

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-full min-w-[56px] flex-1 flex-col items-center justify-center gap-[3px] text-[10px] font-[550] transition-micro',
        active ? 'text-accent' : 'text-muted',
      )}
    >
      <Icon size={20} strokeWidth={active ? 2 : 1.7} aria-hidden />
      {label}
    </Link>
  )
}

export function BottomNav() {
  return (
    <nav
      aria-label="Main"
      data-guide="nav.bottom"
      // `wide:hidden` — this bar and the rail are mutually exclusive, never both.
      // pb accounts for the iOS home indicator; without it the last 34px of the
      // bar sits under the system gesture area and the tabs cannot be tapped.
      className="fixed inset-x-0 bottom-0 z-30 hidden h-[56px] border-t border-line-soft bg-surface pb-[env(safe-area-inset-bottom)] max-narrow:flex"
    >
      {LEFT.map((item) => (
        <Tab key={item.href} {...item} />
      ))}

      {/* The FAB sits in its own flex slot so the four tabs stay evenly spaced,
          and is lifted out of the bar so it reads as an action rather than a
          fifth destination. */}
      <div className="relative flex w-[64px] shrink-0 justify-center">
        <Link
          href="/create/post"
          aria-label="Create a post"
          className="absolute -top-[18px] grid size-[50px] place-items-center rounded-full bg-primary text-primary-foreground shadow-pop transition-micro active:translate-y-[0.5px]"
        >
          <Plus size={24} strokeWidth={2.2} aria-hidden />
        </Link>
      </div>

      {RIGHT.map((item) => (
        <Tab key={item.href} {...item} />
      ))}
    </nav>
  )
}

/**
 * The phone header. The rail's brand block is gone with the rail, so the mark
 * has to live somewhere — and a phone header that carried the workspace
 * switcher, search, notifications AND a logo would be four controls in 390px.
 * It carries the mark and the one control that reaches everything else.
 */
export function MobileHeaderMark() {
  return (
    /* `min-w` as well as `min-h`. 95ed24f logged this control as "26 -> 44" but
       raised only the HEIGHT, so it rendered 26x44 — a hit area 18px short across —
       behind a probe that printed the number and asserted nothing. `justify-center`
       keeps the 26px glyph centred in the widened box. */
    <Link
      href="/home"
      aria-label="Sahoda — go to Home"
      className="hidden shrink-0 items-center justify-center rounded-sm max-narrow:flex max-narrow:min-h-[44px] max-narrow:min-w-[44px]"
    >
      <Image
        src="/brand/favicon-dark.png"
        alt=""
        aria-hidden
        width={26}
        height={26}
        className="block size-[26px] dark:hidden"
      />
      <Image
        src="/brand/favicon-white.png"
        alt=""
        aria-hidden
        width={26}
        height={26}
        className="hidden size-[26px] dark:block"
      />
    </Link>
  )
}
