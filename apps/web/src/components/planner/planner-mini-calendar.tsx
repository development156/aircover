import Link from 'next/link'

import { firstGridDay, MONTH_GRID_DAYS } from '@/lib/planner/month'
import { needsAPerson } from '@/lib/approvals/queue'
import { bucketWeek } from '@/lib/planner/week'
import type { DisplayPost } from '@/lib/posts/display-post'
import { dayKey, dayOfMonth, fullDateLabel, isSameMonth, monthLabel } from '@/lib/time/day-key'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const

/**
 * The compact month beside the plan. Pick a day, the list narrows to it.
 *
 * ── IT REUSES `bucketWeek`, LIKE `MonthGrid` DOES ────────────────────────────
 * `MonthGrid`'s header states the rule: a month is 42 consecutive days of the
 * workspace's zone from the Monday on or before the 1st, `bucketWeek` already
 * buckets any such run,
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
  zone,
}: {
  posts: readonly DisplayPost[]
  now: Date
  /** The workspace's zone, resolved by the page. Decides which cell a post sits in. */
  zone: string
  selected: string | null
  view: string
  tab: string | null
  query: string
  /** The week offset, or null for this week. Carried, never reset silently. */
  week: string | null
}) {
  const buckets = bucketWeek(zone, [...posts], firstGridDay(zone, now), MONTH_GRID_DAYS)
  const todayKey = dayKey(zone, now)

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
        <h2 className="type-h3 whitespace-nowrap text-ink">{monthLabel(zone, now)}</h2>
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
          const inMonth = isSameMonth(zone, bucket.date, now)
          const isToday = bucket.key === todayKey
          const isSelected = bucket.key === selected
          const scheduled = bucket.posts.filter((p) => p.intent === 'scheduled').length
          const waiting = bucket.posts.filter((p) => needsAPerson(p)).length
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
                 months and repeats it. See `fullDateLabel`. */
              aria-label={fullDateLabel(zone, bucket.date)}
              title={
                bucket.posts.length === 0
                  ? undefined
                  : `${bucket.posts.length} ${bucket.posts.length === 1 ? 'post' : 'posts'}${waiting > 0 ? `, ${waiting} awaiting approval` : ''}`
              }
              className={cn(
                'group relative grid aspect-square place-items-center rounded-sm transition-micro',
                'focus-visible:z-10',
                !isSelected && 'hover:bg-s2',
                isToday && !isSelected && 'surface-ring',
              )}
            >
              {/* ── THE PICKED DAY IS A SMALL FILLED ORANGE CIRCLE ────────────
                  It was a tinted square with a firm ring, which is the same
                  shape "today" wears one tint weaker — two states told apart by
                  a wash, on a 35px cell. The circle is unmistakable at that size
                  and it is the mark the founder's reference draws.

                  BLACK on the orange, via `--brand-ink`, which is the token for
                  exactly this and measures 7.15:1. NOT white: white on #ff6600
                  is roughly 2.9:1 and fails at every size. The reference image
                  shows a white numeral; the reference image is wrong about that
                  one pixel and this product's own token is right.

                  `size-7` — 28px — and that is a MEASUREMENT, not a taste.
                  `accent-budget.spec.ts` treats an opaque brand box of 1000px²
                  or more inside a link as a primary action competing to be the
                  screen's one solid fill. The cell itself is about 35px square
                  (~1218px²) and would cross that line; 28px is 784px² and stays
                  a mark. The one primary on this route is the Plan my week
                  button, and a date picker must never be mistaken for it. */}
              <span
                className={cn(
                  'num type-meta grid size-7 place-items-center rounded-pill transition-micro',
                  isSelected
                    ? 'bg-brand font-[650] text-brand-ink'
                    : isToday
                      ? 'font-[650] text-ink'
                      : inMonth
                        ? 'text-ink'
                        : 'text-ink-mute',
                )}
              >
                {dayOfMonth(zone, bucket.date)}
              </span>

              {/* The marks sit BELOW the numeral inside the cell, never over it:
                  a dot on top of a digit costs the digit its legibility, and the
                  date is the thing the reader is actually looking for.

                  They are hidden on the PICKED day, where a 28px circle leaves
                  no room under it. Nothing is lost: picking a day filters the
                  plan beside this calendar to that day, so what the dot claims
                  in shorthand is on screen in full, one column across. */}
              {!isSelected ? (
                <span aria-hidden className="absolute inset-x-0 bottom-0 flex justify-center gap-1">
                  {scheduled > 0 ? <span className="size-1 rounded-pill bg-brand" /> : null}
                  {other > 0 ? (
                    <span className="size-1 rounded-pill bg-transparent shadow-[inset_0_0_0_1px_var(--line-firm)]" />
                  ) : null}
                </span>
              ) : null}
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
