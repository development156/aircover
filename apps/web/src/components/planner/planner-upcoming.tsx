import Link from 'next/link'
import type { Route } from 'next'

import { CHANNEL_SHORT } from '@/components/posts/channel-label'
import type { DisplayPost } from '@/lib/posts/display-post'
import { resolveDisplayZone, zoneLabel } from '@/lib/time/zone'

/**
 * The next few things that are actually going to happen.
 *
 * ── WHY IT IS DISPATCHABLE-ONLY AND FUTURE-ONLY ──────────────────────────────
 * `upcoming()` in `lib/planner/filters.ts` keeps only what the dispatcher will
 * send (`willGoOut`: approved or scheduled, with a time) and only strictly
 * ahead of now. A dated draft is a plan nothing sends, and a post whose time
 * passed this morning is not upcoming — putting either here would make the
 * panel answer a different question from the one its heading asks, which is
 * the failure mode of every "recent activity" widget.
 *
 * ── IT SHOWS NOTHING WHEN THERE IS NOTHING ───────────────────────────────────
 * The caller renders it only when the list is non-empty. An "Upcoming" heading
 * over an empty box is a fifth card explaining an absence the page states once
 * in the figures above (docs/37 §16).
 */
/**
 * ── THIS LIST WAS THE HOLE IN "POSTS AND PLANNER SHOW YOUR TIMES IN THIS ZONE" ─
 * Every formatter here was hardcoded to `Asia/Kolkata` and the label was the
 * literal string `IST`, while the rows directly beside it on the same screen
 * honoured the workspace's zone. A Dubai workspace read "09:00 am GST" in the
 * planner row and "10:30 am IST" here, for the same post. The settings screen
 * claimed both.
 *
 * Built per zone rather than at module scope, and cached, because the zone is
 * now a per-workspace fact rather than a constant.
 */
const CACHE = new Map<
  string,
  { month: Intl.DateTimeFormat; clock: Intl.DateTimeFormat; day: Intl.DateTimeFormat }
>()

function formatters(zone: string) {
  let f = CACHE.get(zone)
  if (!f) {
    f = {
      month: new Intl.DateTimeFormat('en-GB', { timeZone: zone, month: 'short' }),
      clock: new Intl.DateTimeFormat('en-IN', {
        timeZone: zone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
      day: new Intl.DateTimeFormat('en-GB', { timeZone: zone, day: 'numeric' }),
    }
    CACHE.set(zone, f)
  }
  return f
}

export function PlannerUpcoming({
  posts,
  zone: stored,
}: {
  posts: readonly DisplayPost[]
  /** The workspace's zone. Falls back to IST when it set none, like every other reader. */
  zone?: string | null
}) {
  const { zone } = resolveDisplayZone(stored)
  const { month: MONTH_SHORT, clock: CLOCK, day: DAY } = formatters(zone)
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
                  <span className="num type-h3 leading-none text-ink">{DAY.format(at)}</span>
                  <span className="type-eyebrow text-ink-mute">{MONTH_SHORT.format(at)}</span>
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate type-sm font-[650] text-ink">
                    {post.title?.trim() || 'Untitled post'}
                  </span>
                  <span className="mt-0.5 block truncate type-meta text-muted tabular-nums">
                    {CLOCK.format(at)} {zoneLabel(zone, at)}
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
