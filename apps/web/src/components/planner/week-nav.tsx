import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Previous week, next week, Today, and the range you are looking at.
 *
 * Links rather than client state, like `ViewToggle`: the week you navigated to
 * survives a reload and the back button, and it is shareable — a planner URL
 * that always snaps back to this week cannot be sent to anyone.
 */
const RANGE = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
})
const RANGE_YEAR = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
})

export function WeekNav({ days, offset, view }: { days: Date[]; offset: number; view: string }) {
  const first = days[0]
  const last = days[days.length - 1]
  const label =
    first && last
      ? `${RANGE.format(first)} – ${RANGE.format(last)}, ${RANGE_YEAR.format(last)}`
      : null

  const step = (to: number): { pathname: string; query: Record<string, string> } => ({
    pathname: '/planner',
    // `week=0` is dropped so "this week" has one canonical URL rather than two
    // that render identically.
    query: to === 0 ? { view } : { view, week: String(to) },
  })

  return (
    <div className="flex items-center gap-2">
      <Link
        href={step(offset - 1)}
        aria-label="Previous week"
        className="grid size-8 place-items-center rounded-sm border border-line-soft text-muted transition-micro hover:text-ink max-narrow:size-11"
      >
        <ChevronLeft aria-hidden className="size-4" />
      </Link>
      <Link
        href={step(offset + 1)}
        aria-label="Next week"
        className="grid size-8 place-items-center rounded-sm border border-line-soft text-muted transition-micro hover:text-ink max-narrow:size-11"
      >
        <ChevronRight aria-hidden className="size-4" />
      </Link>

      {label !== null ? <p className="type-sm font-semibold text-ink">{label}</p> : null}

      {/* Rendered only when it would DO something. A "Today" that is already
          today is a control that promises a change and delivers none. */}
      {offset !== 0 ? (
        <Link
          href={step(0)}
          className="ml-1 rounded-pill border border-line-soft px-3 py-1 type-meta font-[550] text-ink transition-micro hover:border-brand-lift max-narrow:min-h-[44px]"
        >
          Today
        </Link>
      ) : null}
    </div>
  )
}
