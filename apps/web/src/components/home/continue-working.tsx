import Link from 'next/link'
import type { Route } from 'next'
import { ArrowRight, CalendarRange, Lightbulb, SquarePen, Timer } from 'lucide-react'

import { creditWord } from '@/lib/credit-words'

/**
 * PICK UP WHERE YOU LEFT OFF.
 *
 * ── WHAT THIS IS AND WHAT THE COMMAND BAR IS ─────────────────────────────────
 * The reference carries both, and read side by side three of their four entries
 * are the same destination under two names. They are kept apart here because
 * they are two different kinds of thing and the difference is legible:
 *
 *   the command bar  takes something you WRITE and carries it somewhere.
 *   this row         is four doors, each with what is behind it written on it.
 *
 * The command bar's quick actions are bare labels — a pill you press. These are
 * cards that say what you get and what it costs. Somebody who knows what they
 * want uses the pills; somebody deciding reads these. That is a real
 * difference, and it is the only reason this section survived a brief whose own
 * rule is to delete anything that can go without losing function.
 */

interface Door {
  href: Route
  icon: typeof SquarePen
  title: string
  /** What you get, in the reader's terms. Never a description of our parts. */
  note: string
  /** Credits, when walking through this door spends them. */
  cost?: number
}

export function ContinueWorking({ planCost }: { planCost: number }) {
  /* The price comes from pricing config through the page, never from a literal
     here: a number typed into a component is one that can disagree with what the
     server actually charges. */
  const doors: readonly Door[] = [
    {
      href: '/planner',
      icon: CalendarRange,
      title: 'Plan this week',
      note: 'Five drafts across the coming week',
      cost: planCost,
    },
    { href: '/brain', icon: Lightbulb, title: 'Research brand', note: 'Find new ideas' },
    {
      /* `as Route`, and it is not a formality. Next's `typedRoutes` builds its
         `Route` union from the LITERAL route tree, and `/posts/new` is not in
         it: the page is served by `posts/[id]/page.tsx`, whose own `const NEW =
         'new'` treats that id as "this post does not exist yet". So the link
         resolves at runtime and the type does not know it. `create/post/page.tsx`
         and `needs-attention.tsx` each cast for the same reason. */
      href: '/posts/new' as Route,
      icon: SquarePen,
      title: 'Create post',
      note: 'Start from scratch',
    },
    { href: '/approvals', icon: Timer, title: 'Review drafts', note: 'Finish your content' },
  ]

  return (
    <section
      aria-labelledby="home-continue"
      data-guide="home.continue"
      className="surface-ring rounded-card bg-surface p-5 shadow-card max-narrow:p-4"
    >
      <div className="flex items-baseline gap-3">
        <h2 id="home-continue" className="type-h3 text-ink">
          Continue working
        </h2>
        <p className="type-meta text-muted max-narrow:hidden">
          Pick up where you left off, or start something new.
        </p>
      </div>

      {/* Four equal doors so the row always fills; two and two at the middle
          band, and one column on a phone where a 200px card is unreadable. */}
      <ul className="mt-4 grid grid-cols-4 gap-3 max-wide:grid-cols-2 max-narrow:grid-cols-1">
        {doors.map((door) => (
          <li key={door.href}>
            <Link
              href={door.href}
              className="surface-ring group flex h-full flex-col gap-1 rounded-md p-4 transition-micro hover:shadow-[inset_0_0_0_1px_var(--line-firm)]"
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
                /* THE COST IS ON THE DOOR, not behind it. The founder's ruling
                   took the BALANCE off this screen; this product's older rule
                   says nobody may arrive at a spend they were not told about.
                   A price is what makes the removal safe rather than careless.

                   `creditWord`, never a hard-coded plural: a figure that can be
                   1 beside the literal "credits" is the defect
                   `credit-words.test.ts` scans the whole tree for. */
                <span className="mt-0.5 type-meta text-muted">
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
