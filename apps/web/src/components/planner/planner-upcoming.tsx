import Link from 'next/link'
import type { Route } from 'next'

import { CHANNEL_SHORT } from '@/components/posts/channel-label'
import type { DisplayPost } from '@/lib/posts/display-post'
import { istDayOfMonth } from '@/lib/planner/month'

/**
 * The next few things that are actually going to happen.
 *
 * ── WHY IT IS SCHEDULED-ONLY AND FUTURE-ONLY ─────────────────────────────────
 * `upcoming()` in `lib/planner/filters.ts` filters on a parseable
 * `scheduled_at` strictly ahead of now. A draft has no time to be next at, and a
 * post whose time passed this morning is not upcoming — putting either here
 * would make the panel answer a different question from the one its heading
 * asks, which is the failure mode of every "recent activity" widget.
 *
 * ── IT SHOWS NOTHING WHEN THERE IS NOTHING ───────────────────────────────────
 * The caller renders it only when the list is non-empty. An "Upcoming" heading
 * over an empty box is a fifth card explaining an absence the page states once
 * in the figures above (docs/37 §16).
 */
const MONTH_SHORT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  month: 'short',
})
const CLOCK = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
})

export function PlannerUpcoming({ posts }: { posts: readonly DisplayPost[] }) {
  return (
    <section
      aria-labelledby="planner-upcoming"
      className="surface-ring rounded-card bg-surface p-4"
    >
      <h2 id="planner-upcoming" className="type-h3 text-ink">
        Upcoming
      </h2>

      <ol className="mt-3 flex flex-col">
        {posts.map((post) => {
          // Non-null by construction: `upcoming()` drops anything unparseable.
          const at = new Date(post.scheduled_at!)
          return (
            <li key={post.id}>
              <Link
                href={`/posts/${post.id}` as Route}
                className="group -mx-2 flex gap-3 rounded-md px-2 py-2.5 transition-micro hover:bg-s2"
              >
                {/* The date block. `tabular-nums` so a column of days lines up
                    rather than shuffling by a pixel between 8 and 11. */}
                <span className="flex w-8 shrink-0 flex-col items-center pt-0.5">
                  <span className="num type-h3 leading-none text-ink">{istDayOfMonth(at)}</span>
                  <span className="type-eyebrow text-ink-mute">{MONTH_SHORT.format(at)}</span>
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate type-sm font-[650] text-ink">
                    {post.title?.trim() || 'Untitled post'}
                  </span>
                  <span className="mt-0.5 block truncate type-meta text-muted tabular-nums">
                    {CLOCK.format(at)} IST
                    {post.channels.length > 0
                      ? ` · ${post.channels.map((c) => CHANNEL_SHORT[c]).join(' · ')}`
                      : ''}
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
