import Link from 'next/link'

import {
  firstGridDay,
  isSameIstMonth,
  istDayKey,
  istDayOfMonth,
  istFullDate,
  istMonthLabel,
  MONTH_GRID_DAYS,
} from '@/lib/planner/month'
import { needsAPerson } from '@/lib/approvals/queue'
import { bucketWeek } from '@/lib/planner/week'
import type { DisplayPost } from '@/lib/posts/display-post'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const

/**
 * The compact month beside the plan. Pick a day, the list narrows to it.
 *
 * ── IT REUSES `bucketWeek`, LIKE `MonthGrid` DOES ────────────────────────────
 * `MonthGrid`'s header states the rule: a month is 42 consecutive IST days from
 * the Monday on or before the 1st, `bucketWeek` already buckets any such run,
 * "so this needed no new bucketing logic and no second date implementation to
 * drift from the first". A third date implementation living in the rail beside
 * the second would be exactly that drift, one panel further along.
 *
 * ── DOTS, AND WHAT EACH ONE CLAIMS ───────────────────────────────────────────
 * Two marks, never more. A filled dot means at least one post on that day is
 * SCHEDULED; a hollow one means the day holds work that is not scheduled yet.
 * A third mark for "needs approval" was tried and dropped: three dots in a
 * 28px cell is a legend nobody reads, and the tab bar already answers that
 * question with a number. The cell's title attribute carries the full count for
 * anyone who wants it.
 *
 * ── WHY THE WEEKDAY ROW IS `aria-hidden` ─────────────────────────────────────
 * Same reason as `MonthGrid`: each cell names its own date, and single-letter
 * column headers would have a screen reader announce "M T W T F S S" before a
 * grid it cannot navigate by. Two of those letters are not even distinct.
 */
export function PlannerMiniCalendar({
  posts,
  now,
  selected,
  view,
  tab,
  query,
  week,
}: {
  posts: readonly DisplayPost[]
  now: Date
  selected: string | null
  view: string
  tab: string | null
  query: string
  /** The week offset, or null for this week. Carried, never reset silently. */
  week: string | null
}) {
  const buckets = bucketWeek([...posts], firstGridDay(now), MONTH_GRID_DAYS)
  const todayKey = istDayKey(now)

  /* Carried on every cell link so picking a day does not silently discard the
     tab and the search the reader already chose. */
  const carry = {
    view,
    ...(tab !== null ? { tab } : {}),
    ...(query !== '' ? { q: query } : {}),
    ...(week !== null ? { week } : {}),
  }

  return (
    <section aria-label="Month" className="surface-ring rounded-card bg-surface p-4">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="type-h3 whitespace-nowrap text-ink">{istMonthLabel(now)}</h2>
        {selected !== null ? (
          <Link
            href={{ pathname: '/planner', query: carry }}
            className="card-link type-meta text-accent"
          >
            Show all days
          </Link>
        ) : null}
      </header>

      <div aria-hidden className="mt-3 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((letter, i) => (
          <span key={i} className="type-meta text-center text-ink-mute">
            {letter}
          </span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {buckets.days.map((bucket) => {
          const inMonth = isSameIstMonth(bucket.date, now)
          const isToday = bucket.key === todayKey
          const isSelected = bucket.key === selected
          const scheduled = bucket.posts.filter((p) => p.intent === 'scheduled').length
          const waiting = bucket.posts.filter((p) => needsAPerson(p.intent)).length
          const other = bucket.posts.length - scheduled

          return (
            <Link
              key={bucket.key}
              href={{
                pathname: '/planner',
                // Clicking the picked day again clears the pick. A calendar you
                // cannot un-pick is a filter with no way out.
                query: isSelected ? carry : { ...carry, date: bucket.key },
              }}
              aria-current={isSelected ? 'date' : undefined}
              /* The numeral alone is NOT a name: a 42-cell grid spans three
                 months and repeats it. See `istFullDate`. */
              aria-label={istFullDate(bucket.date)}
              title={
                bucket.posts.length === 0
                  ? undefined
                  : `${bucket.posts.length} ${bucket.posts.length === 1 ? 'post' : 'posts'}${waiting > 0 ? `, ${waiting} awaiting approval` : ''}`
              }
              className={cn(
                'group relative grid aspect-square place-items-center rounded-sm transition-micro',
                'focus-visible:z-10',
                isSelected ? 'surface-ring-firm bg-brand-wash' : 'hover:bg-s2',
                isToday && !isSelected && 'surface-ring',
              )}
            >
              <span
                className={cn(
                  'num type-meta',
                  isSelected || isToday ? 'font-[650]' : '',
                  // NOT `text-accent` on the wash: MEASURED 2.75:1 in light,
                  // below the 4.5:1 floor. The ground and the ring carry the
                  // "picked" reading; the date itself stays legible.
                  isSelected ? 'text-ink' : inMonth ? 'text-ink' : 'text-ink-mute',
                )}
              >
                {istDayOfMonth(bucket.date)}
              </span>

              {/* The marks sit BELOW the numeral inside the cell, never over it:
                  a dot on top of a digit costs the digit its legibility, and the
                  date is the thing the reader is actually looking for. */}
              <span aria-hidden className="absolute inset-x-0 bottom-1 flex justify-center gap-1">
                {scheduled > 0 ? <span className="size-1 rounded-pill bg-brand" /> : null}
                {other > 0 ? (
                  <span className="size-1 rounded-pill bg-transparent shadow-[inset_0_0_0_1px_var(--line-firm)]" />
                ) : null}
              </span>
            </Link>
          )
        })}
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 type-meta text-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-1.5 rounded-pill bg-brand" />
          Scheduled
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-1.5 rounded-pill shadow-[inset_0_0_0_1px_var(--line-firm)]"
          />
          Not scheduled
        </span>
      </p>
    </section>
  )
}
