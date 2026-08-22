import Link from 'next/link'
import type { Post } from '@sahoda/shared'

import { AgencyBlade } from '@/components/posts/agency-blade'
import { buttonVariants } from '@/components/ui/button'
import { CardLabel } from '@/components/ui/card'
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
    <section aria-label="What Sahoda did this week">
      <CardLabel>This week, from Sahoda</CardLabel>

      {drafted.length === 0 ? (
        <div className="space-y-3">
          <p className="text-[13px] text-muted">Sahoda hasn&rsquo;t drafted anything this week.</p>
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
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-micro hover:bg-surface-2"
              >
                <AgencyBlade origin={post.origin} />
                <span className="truncate">{post.title?.trim() || 'Untitled post'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
