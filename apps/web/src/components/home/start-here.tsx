import Link from 'next/link'
import type { Route } from 'next'
import { ArrowRight, CalendarRange, Lightbulb, SquarePen, Sparkles, Timer } from 'lucide-react'

import { creditWord } from '@/lib/credit-words'
import { cn } from '@/lib/utils'

/**
 * WHAT TO DO NEXT — ONE ROW, NOT TWO.
 *
 * ── THE BRIEF ASKED FOR TWO SECTIONS AND THEY ARE THE SAME SECTION ───────────
 * The reference this was built from carries an "AI command centre" whose quick
 * actions are Plan my week · Find content ideas · Create a campaign · Review my
 * drafts, and then a "Continue working" row whose cards are Plan this week ·
 * Research brand · Create post · Review drafts. Read them side by side: three
 * of the four are the same destination under two names, on one screen, sixty
 * pixels apart.
 *
 * The brief's own rule settles it — "if something can be removed without
 * reducing functionality, REMOVE IT" — so this is one row. Nothing was lost:
 * every destination either side named is here.
 *
 * ── AND THERE IS NO FREE-TEXT "GENERATE" BOX, BECAUSE THERE IS NO BACKEND ────
 * The reference's hero is a text field and a Generate button. Nothing in this
 * product turns arbitrary free text into anything: the ONE action that takes a
 * written brief is Plan my week, which takes a week's goals, costs credits and
 * already has a screen of its own. A box that swallowed what you typed and
 * opened a blank composer would be a mock success — the failure mode this
 * codebase forbids by name — and one that charged for a plan without saying so
 * would break the rule that a cost is shown before it is spent.
 *
 * So the hero is a LAUNCHER, and it is honest about which of its four doors
 * costs something. That is the same hierarchy the reference gets from its input
 * field, built out of things that exist.
 */

/** Where each door goes and what it does when you walk through it. */
interface Door {
  href: Route
  icon: typeof SquarePen
  title: string
  /** What you get, in the reader's terms. Never a description of our parts. */
  note: string
  /** Credits, when walking through this door spends them. */
  cost?: number
  /** The one door drawn as the primary. Exactly one, ever. */
  lead?: boolean
}

export function StartHere({ planCost }: { planCost: number }) {
  /* `planCost` comes from the pricing config through the page, never from a
     literal here: a number typed into a component is a price that can disagree
     with the one the server charges. */
  const doors: readonly Door[] = [
    {
      href: '/planner',
      icon: CalendarRange,
      title: 'Plan my week',
      note: 'Five drafts across the coming week',
      cost: planCost,
      lead: true,
    },
    {
      href: '/posts/new',
      icon: SquarePen,
      title: 'Write a post',
      note: 'Start from a blank page',
    },
    {
      href: '/brain',
      icon: Lightbulb,
      title: 'Teach Sahoda',
      note: 'What it knows about your brand',
    },
    {
      href: '/approvals',
      icon: Timer,
      title: 'Review drafts',
      note: 'Finish what is waiting on you',
    },
  ]

  return (
    <section
      aria-labelledby="home-start"
      data-guide="home.start"
      className="surface-ring rounded-card bg-surface p-5 shadow-card max-narrow:p-4"
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          /* dark: tint-50 stays warm-light while --acc flips to Orange300 → s2 */
          className="grid size-8 flex-none place-items-center rounded-sm bg-tint-50 text-accent dark:bg-s2"
        >
          <Sparkles size={16} strokeWidth={1.9} />
        </span>
        <div className="min-w-0">
          <h2 id="home-start" className="type-h3 text-ink">
            What do you want to work on?
          </h2>
        </div>
      </div>

      {/* Four equal doors, so the row always fills. At `narrow` it is two and
          two rather than four squeezed; below that it is one column, where a
          220px card is unreadable and a full-width row is a real target. */}
      <ul className="mt-4 grid grid-cols-4 gap-3 max-wide:grid-cols-2 max-narrow:grid-cols-1">
        {doors.map((door) => (
          <li key={door.href}>
            <Link
              href={door.href}
              className={cn(
                'group flex h-full flex-col gap-1 rounded-md p-4 transition-micro',
                'surface-ring hover:shadow-[inset_0_0_0_1px_var(--line-firm)]',
                // The lead door gets a WASH, not a fill. docs/37 §16 allows one
                // solid brand fill per view and `GreetingBanner`'s Create button
                // already spends it; a second orange block here would leave the
                // screen with two primaries and therefore none.
                door.lead && 'bg-brand-wash hover:bg-brand-tint',
              )}
            >
              <span className="flex items-center gap-2">
                <door.icon
                  size={16}
                  strokeWidth={1.9}
                  aria-hidden
                  className="flex-none text-ink-mute"
                />
                <span className="min-w-0 flex-1 truncate type-sm font-[650] text-ink">
                  {door.title}
                </span>
                <ArrowRight
                  aria-hidden
                  className="size-3.5 flex-none text-ink-mute transition-micro group-hover:translate-x-0.5 group-hover:text-ink"
                />
              </span>
              <span className="type-meta text-muted">{door.note}</span>
              {door.cost !== undefined ? (
                /* THE COST IS ON THE DOOR, not behind it. This is the product's
                   standing rule and it is the reason this row can hold a paid
                   action at all: nobody arrives at a spend they were not told
                   about. It is a PRICE, not a balance — the founder's ruling
                   removed the balance from this screen, and a price is what
                   makes the removal safe rather than careless. */
                <span className="mt-0.5 type-meta text-muted">
                  {/* `creditWord`, never a hard-coded plural. A price that can be
                      1 sitting next to the literal "credits" is the defect
                      `credit-words.test.ts` scans the whole tree for, and it
                      caught this line on the first run. */}
                  <span className="tabular-nums">{door.cost}</span> {creditWord(door.cost)}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
