import Link from 'next/link'
import type { Post } from '@sahoda/shared'

import { AgencyBlade } from '@/components/posts/agency-blade'
import { buttonVariants } from '@/components/ui/button'
import { HomeSection } from '@/components/home/section'
import { creditWord } from '@/lib/credit-words'

/**
 * What Sahoda did this week.
 *
 * There is no activity log in the schema, so this is not a feed — it is the one
 * thing that IS recorded: posts Sahoda drafted, via `posts.origin = 'plan_week'`.
 * Nothing here is inferred.
 *
 * DESIGNED EMPTY FIRST. Most workspaces have never run a plan, so the empty
 * state is the state this component is usually in, and it carries the primary
 * call to action rather than apologising for being blank. A rail that says
 * "nothing yet" and stops is dead space; one that says "nothing yet, here is the
 * thing to press" is the start of the product.
 */
export interface SahodaRailProps {
  /** Posts Sahoda drafted, already filtered to this week by the caller. */
  drafted: Post[]
  /** Server-owned cost of a week plan. Never hardcoded here. */
  planCost: number
}

export function SahodaRail({ drafted, planCost }: SahodaRailProps) {
  return (
    /* ── IT IS A NAMED SECTION NOW, NOT A LABELLED BOX ────────────────────────
       This rendered a `CardLabel` inside a `Card`, so the one region of Home
       that reports what SAHODA did was the only one with no heading in the
       document outline — invisible to anyone navigating by headings, and
       visually a third grammar for "here is a section" on a page that now has
       exactly one. The words are unchanged; they are an `h2` instead of a small
       caps label.

       IT CARRIES NO HEAD LINK, and that is deliberate rather than an omission.
       `WeekStrip` sits directly opposite this card and its own head link is
       `Open Planner` — MEASURED at 1440, the two landed within 4px of the same
       baseline, so the page showed two identical links to one destination side
       by side, under two headings both beginning "This week". The one on the
       calendar is the one that belongs there. This card's own rows already open
       the posts they name, and its empty state carries `Plan my week`. */
    <HomeSection id="home-sahoda" title="What Sahoda made this week">
      {drafted.length === 0 ? (
        <div className="space-y-3">
          <p className="type-sm text-muted">Sahoda has not written anything this week.</p>
          {/* Wears the Button's clothes via `buttonVariants` rather than
              re-typing them: a hand-rolled copy is how this one ended up a
              40px pill after the control shapes moved to 34px / 6px.

              SECONDARY, and for two reasons that point the same way.

              docs/26 §1.5: one primary per view. MEASURED on /home, this was a
              second brand fill on a screen that already has the hero's "Create
              post" — and when two things look equally like the main action,
              neither is.

              The sharper reason is that this one SPENDS. A twenty-credit action
              dressed identically to a free one makes the paid tap look like the
              recommended tap, on the screen a new account lands on with a
              hundred credits to their name. Loud is for the free door; the paid
              door states its price and waits to be chosen. */}
          <Link href="/planner" className={buttonVariants({ variant: 'secondary' })}>
            <span>
              Plan my week · <span className="tabular-nums">{planCost}</span> {creditWord(planCost)}
            </span>
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {drafted.map((post) => (
            <li key={post.id}>
              <Link
                href={`/posts/${post.id}`}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 type-sm transition-micro hover:bg-surface-2"
              >
                <AgencyBlade origin={post.origin} />
                <span className="truncate">{post.title?.trim() || 'Untitled post'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </HomeSection>
  )
}
