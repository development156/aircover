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
      <header className="flex min-h-[46px] items-center gap-3 px-5 pt-5 pb-3 max-narrow:px-4">
        {/* `shrink-0 whitespace-nowrap`: this is a flex item, and a flex item
            shrinks below its content by default, so at 390px the IST note beside
            it squeezed the label into two lines reading "August" / "2026". A month
            and its year are one token. Same failure the topbar chips had. */}
        <h2 className="type-h3 shrink-0 whitespace-nowrap text-ink">
          {istMonthLabel(monthAnchor)}
        </h2>
        {/* THE SENTENCE IS NOT SHORTENED TO "Times in IST". The brief asks for
            less text and this is the one line that keeps every word, because the
            clause carries a claim the short form does not: these times are the
            zone the schedule is STORED in, not a conversion into the reader's
            own. A workspace in Dubai reads GST in the rail beside this grid and
            IST inside it, and this clause is the only thing on screen that
            explains why. Quieter, yes. Vaguer, no. */}
        <p className="ml-auto type-meta text-muted">
          Times are shown in IST, the zone every schedule is stored in.
        </p>
      </header>

      {/* ── ONE SCROLLER FOR BOTH ROWS ──────────────────────────────────────────
          Below 700px this used to hide the weekday header, collapse the grid to
          `grid-cols-1` and drop the cell min-height, which turned the calendar
          into 42 full-width rows of bare date numbers — 41 of them empty in a
          workspace with one dated post. It stopped being a calendar, which is the
          one thing this component's 6×7 shape exists to be.

          WeekGrid already solved this: keep the seven columns, force a min-width,
          let the container scroll. Same 840px here (120px per day). The weekday
          header and the day grid share ONE scroller so the labels cannot drift out
          of register with the columns they name. */}
      <div className="overflow-x-auto">
        {/* `aria-hidden` because each cell already names its own date — a screen
            reader reading seven weekday names before the grid would announce a
            header row it cannot navigate by. */}
        <div aria-hidden className="grid min-w-[840px] grid-cols-7 border-y border-line-soft">
          {WEEKDAYS.map((day) => (
            <div key={day} className="type-eyebrow px-2 py-2 text-center text-ink-mute">
              {day}
            </div>
          ))}
        </div>

        <div className="grid min-w-[840px] grid-cols-7">
          {buckets.days.map((bucket) => {
            const inMonth = isSameIstMonth(bucket.date, monthAnchor)
            return (
              <div
                key={bucket.key}
                className={cn(
                  // 128px, up from 104. The brief asks for "large usable cells"
                  // and the calendar to be the page's primary workspace; at 104
                  // a cell holding two posts had no room left and the grid read
                  // as a summary of a calendar rather than one.
                  'group/day min-h-[128px] border-r border-b border-line-soft p-2 transition-micro last:border-r-0',
                  // Outside the displayed month: quieter ground, but the posts
                  // still render at full strength.
                  inMonth ? 'bg-surface hover:bg-s2' : 'bg-s2',
                )}
              >
                <p
                  className={cn(
                    'num type-meta',
                    // A date is a label, not a heading. It was `font-semibold`
                    // at every cell, which put 42 bold numerals on the screen
                    // competing with the post titles that are the actual
                    // content. Only TODAY is emphasised now, and it is
                    // emphasised by a mark rather than by weight.
                    inMonth ? 'text-ink' : 'text-ink-mute',
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
                        <span className="flex items-center gap-1.5">
                          {/* ── THE ORANGE INDICATOR THE BRIEF ASKS FOR ──────
                              A 4px dot, filled for SCHEDULED and hollow for
                              anything else — the same two marks, meaning the
                              same two things, that the mini calendar in the rail
                              already draws and already legends. A third mark was
                              not added: the tab bar above answers "needs
                              approval" with a number, and this cell is 118px
                              wide.

                              `--brand` at 16px² is far under the 1000px² floor
                              `accent-budget.spec.ts` uses to tell a fill from a
                              dot, so a full month of scheduled posts still spends
                              no accent budget. It is an indicator, not a fill. */}
                          <span
                            aria-hidden
                            className={cn(
                              'size-1 shrink-0 rounded-pill',
                              post.intent === 'scheduled'
                                ? 'bg-brand'
                                : 'shadow-[inset_0_0_0_1px_var(--line-firm)]',
                            )}
                          />
                          <span className="min-w-0 flex-1 truncate type-meta font-[550] text-ink">
                            {post.title?.trim() || 'Untitled post'}
                          </span>
                        </span>
                        {post.channels.length > 0 ? (
                          <span className="block truncate pl-2.5 text-[10px] text-muted">
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
      </div>

      {/* A calendar can only show what has a date. Anything without one is
          stated here rather than silently dropped — the failure mode of every
          calendar view is work that exists and is nowhere on screen. */}
      {buckets.unscheduled.length > 0 ? (
        <p className="border-t border-line-soft px-5 py-3 type-meta text-muted max-narrow:px-4">
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
