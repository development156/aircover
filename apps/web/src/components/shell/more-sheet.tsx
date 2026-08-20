'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { LayoutGrid } from 'lucide-react'

import { Drawer } from '@/components/ui/drawer'
import { NAV_FOOT, NAV_GROUPS } from '@/lib/nav/sections'
import { cn } from '@/lib/utils'

/**
 * EVERY SECTION, ON A PHONE.
 *
 * ── THE DEFECT THIS CLOSES ───────────────────────────────────────────────────
 * The bottom bar carries four destinations and a create button, chosen well: it
 * is what somebody opens the app for on a phone. But those four were the ONLY
 * way to move around below 700px — the rail is `max-narrow:hidden`, and the
 * header carries the workspace switcher and search, not the menu. With nine
 * sections that left five unreachable. With twenty-one it leaves seventeen,
 * including Approvals, Campaigns and Assets, which are built and working.
 *
 * A phone user could not reach two thirds of the product at all.
 *
 * ── WHY A SHEET AND NOT MORE TABS ────────────────────────────────────────────
 * Five tabs in 390px gives each one about 65px, and the fifth would still leave
 * sixteen sections behind it. The bar keeps four, and the fourth slot becomes
 * the door to everything: one tap, the full map, grouped exactly as the rail
 * groups it, so the two devices teach the same structure.
 *
 * ── WHICH TAB GAVE WAY ───────────────────────────────────────────────────────
 * Brand Brain. It was the least likely of the four to be the reason someone
 * opens this on a phone between customers — editing your brand is desk work —
 * and it is the FIRST item in this sheet, one tap away rather than zero. Home,
 * Inbox and Planner keep their slots: today, replies, and the plan.
 *
 * ── A `<Drawer>`, DELIBERATELY, NOT A MODAL ──────────────────────────────────
 * Consulting the menu does not demand an answer — the page behind it stays the
 * subject, and dismissing it without choosing is a normal outcome. That is the
 * primitive's own rule (docs/26 §10.1). Entering from the bottom puts it under
 * the thumb that opened it.
 */
export function MoreSheet() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // A navigation closes the sheet. Without this, tapping a link leaves the
  // dialog over the page you just navigated to — the classic mobile-menu bug,
  // and the one that makes a sheet feel broken rather than slow.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-full min-w-[56px] flex-1 flex-col items-center justify-center gap-[3px] text-[10px] font-[550] text-muted transition-micro"
      >
        <LayoutGrid size={20} strokeWidth={1.7} aria-hidden />
        More
      </button>

      <Drawer open={open} onClose={() => setOpen(false)} title="All sections" side="bottom">
        <div className="flex flex-col gap-5 pb-2">
          {NAV_GROUPS.map((group, index) => (
            <section
              key={group.title ?? 'top'}
              aria-labelledby={group.title ? `more-group-${index}` : undefined}
              aria-label={group.title ? undefined : 'Main sections'}
            >
              {group.title ? (
                <h3 id={`more-group-${index}`} className="type-eyebrow mb-2 text-muted">
                  {group.title}
                </h3>
              ) : null}
              <ul className="grid gap-1.5">
                {group.items.map((item) => (
                  <SheetLink key={item.href} item={item} />
                ))}
              </ul>
            </section>
          ))}

          <section aria-label="Account and setup" className="border-t border-line-soft pt-4">
            <ul className="grid gap-1.5">
              {NAV_FOOT.map((item) => (
                <SheetLink key={item.href} item={item} />
              ))}
            </ul>
          </section>
        </div>
      </Drawer>
    </>
  )
}

/**
 * One row. 44px minimum, because every interactive control does at this width
 * (docs/26 §9), and the hint is carried because a phone reader has more room
 * for a line of explanation than a 64px rail does — not less.
 */
function SheetLink({ item }: { item: (typeof NAV_GROUPS)[number]['items'][number] }) {
  const pathname = usePathname()
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`)

  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex min-h-[44px] items-center gap-3 rounded-sm px-2 py-1.5 transition-micro',
          active ? 'bg-brand-wash' : 'hover:bg-surface-3',
        )}
      >
        <span className="min-w-0 flex-1">
          {/* `truncate` on the LABEL as well as the hint. Without it a long
              label sets the row's minimum width and pushes the "Soon" marker
              past the right edge — measured at 390px, where "The Loop" and
              "Playbooks" rendered their marker clipped to "SOO". */}
          <span
            className={cn(
              'block truncate text-[14px] font-[550]',
              active ? 'text-accent' : 'text-ink',
            )}
          >
            {item.label}
          </span>
          <span className="type-sm block truncate text-muted">{item.hint}</span>
        </span>
        {/* The same word the rail uses, so "Soon" means one thing across the
            product. No badge, no colour — the word is the claim. */}
        {item.state === 'soon' ? (
          <>
            <span aria-hidden className="type-eyebrow flex-none text-muted">
              Soon
            </span>
            <span className="sr-only">, not built yet</span>
          </>
        ) : null}
      </Link>
    </li>
  )
}
