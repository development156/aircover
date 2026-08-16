import type { Route } from 'next'
import Link from 'next/link'

import { CHANNEL_SHORT } from '@/components/posts/channel-label'
import {
  firstGridDay,
  MONTH_GRID_DAYS,
  istMonthLabel,
  istDayOfMonth,
  isSameIstMonth,
} from '@/lib/planner/month'
import type { WeekBuckets } from '@/lib/planner/week'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/**
 * The month calendar (reference `Planner.calendar()`).
 *
 * A Monday-first 6×7 grid INCLUDING the leading and trailing days of the
 * adjacent months, which is what makes a calendar read as a calendar rather
 * than as a ragged grid that starts partway through a row.
 *
 * ── WHY IT REUSES `bucketWeek` ───────────────────────────────────────────────
 * `bucketWeek(posts, start, dayCount)` already buckets any run of consecutive
 * IST days from any start, and it already carries the two honest overflow
 * buckets (`unscheduled`, `outside`). A month is 42 of those days beginning on
 * the Monday on or before the 1st — so this needed no new bucketing logic and
 * no second date implementation to drift from the first.
 *
 * Days outside the displayed month are dimmed but still show their posts: a
 * post scheduled for the 31st of last month is a real commitment, and hiding it
 * because the header says a different month would be the calendar lying by
 * omission.
 */
export function MonthGrid({ buckets, monthAnchor }: { buckets: WeekBuckets; monthAnchor: Date }) {
  return (
    <section className="surface-ring overflow-hidden rounded-card bg-surface">
      <header className="flex min-h-[46px] items-center gap-3 border-b border-line-soft px-4 py-3">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em]">
          {istMonthLabel(monthAnchor)}
        </h2>
        <p className="ml-auto text-[12px] text-muted">
          Times are shown in IST, the zone every schedule is stored in.
        </p>
      </header>

      {/* Weekday header. `aria-hidden` because each cell already names its own
          date — a screen reader reading seven weekday names before the grid
          would announce a header row it cannot navigate by. */}
      <div aria-hidden className="grid grid-cols-7 border-b border-line-soft max-narrow:hidden">
        {WEEKDAYS.map((day) => (
          <div key={day} className="type-eyebrow px-2 py-2 text-center text-muted">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 max-narrow:grid-cols-1">
        {buckets.days.map((bucket) => {
          const inMonth = isSameIstMonth(bucket.date, monthAnchor)
          return (
            <div
              key={bucket.key}
              className={cn(
                'min-h-[104px] border-r border-b border-line-soft p-2 last:border-r-0 max-narrow:min-h-0',
                // Outside the displayed month: quieter ground, but the posts
                // still render at full strength.
                inMonth ? 'bg-surface' : 'bg-s2',
              )}
            >
              <p
                className={cn(
                  'text-[11px] font-semibold tabular-nums',
                  inMonth ? 'text-ink' : 'text-muted',
                )}
              >
                {istDayOfMonth(bucket.date)}
              </p>

              <ul className="mt-1 flex flex-col gap-1">
                {bucket.posts.map((post) => (
                  <li key={post.id}>
                    <Link
                      href={`/posts/${post.id}` as Route}
                      className="surface-ring block rounded-sm bg-surface px-[6px] py-[3px] transition-micro hover:shadow-[inset_0_0_0_1px_var(--line-firm)]"
                    >
                      <span className="block truncate text-[11px] font-[550] text-ink">
                        {post.title?.trim() || 'Untitled post'}
                      </span>
                      {post.channels.length > 0 ? (
                        <span className="block truncate text-[10px] text-muted">
                          {post.channels.map((c) => CHANNEL_SHORT[c]).join(' · ')}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>

      {/* A calendar can only show what has a date. Anything without one is
          stated here rather than silently dropped — the failure mode of every
          calendar view is work that exists and is nowhere on screen. */}
      {buckets.unscheduled.length > 0 ? (
        <p className="border-t border-line-soft px-4 py-3 text-[12px] text-muted">
          <span className="font-[550] text-ink tabular-nums">{buckets.unscheduled.length}</span>{' '}
          {buckets.unscheduled.length === 1 ? 'post has' : 'posts have'} no date yet, so they cannot
          appear on a calendar.{' '}
          <Link href={{ pathname: '/planner', query: { view: 'list' } }} className="text-accent">
            See them in the list
          </Link>
          .
        </p>
      ) : null}
    </section>
  )
}

export { firstGridDay, MONTH_GRID_DAYS }
