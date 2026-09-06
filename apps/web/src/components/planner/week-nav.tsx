import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Previous week, next week, Today, and the range you are looking at.
 *
 * Links rather than client state, like `ViewToggle`: the week you navigated to
 * survives a reload and the back button, and it is shareable — a planner URL
 * that always snaps back to this week cannot be sent to anyone.
 *
 * The range is read in the WORKSPACE'S zone, the same one the columns beneath
 * it are keyed by. Built per zone and cached, because the zone is a
 * per-workspace fact rather than a constant.
 */
const CACHE = new Map<string, { range: Intl.DateTimeFormat; year: Intl.DateTimeFormat }>()

function formatters(zone: string) {
  let f = CACHE.get(zone)
  if (!f) {
    f = {
      range: new Intl.DateTimeFormat('en-IN', { timeZone: zone, day: 'numeric', month: 'short' }),
      year: new Intl.DateTimeFormat('en-IN', { timeZone: zone, year: 'numeric' }),
    }
    CACHE.set(zone, f)
  }
  return f
}

export function WeekNav({
  days,
  offset,
  view,
  zone,
  filters = {},
}: {
  days: Date[]
  offset: number
  view: string
  /** The workspace's zone, resolved by the page. The label must match the columns. */
  zone: string
  /** The reader's tab, search and picked date. Defaults to none so existing
      call sites keep working; see `step` for why it must be carried. */
  filters?: Record<string, string>
}) {
  const { range, year } = formatters(zone)
  const first = days[0]
  const last = days[days.length - 1]
  const label =
    first && last ? `${range.format(first)} – ${range.format(last)}, ${year.format(last)}` : null

  const step = (to: number): { pathname: string; query: Record<string, string> } => ({
    pathname: '/planner',
    // `week=0` is dropped so "this week" has one canonical URL rather than two
    // that render identically.
    //
    // `filters` rides along. Without it this control emitted `{ view, week }`
    // and nothing else, so stepping a week silently cleared the tab and the
    // search shown in the toolbar directly above it — the reader's own choice,
    // discarded by a control that says nothing about filtering.
    query: to === 0 ? { view, ...filters } : { view, week: String(to), ...filters },
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
