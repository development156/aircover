import Link from 'next/link'
import { Search, X } from 'lucide-react'

import { PLANNER_TABS, TAB_LABELS, type PlannerTab } from '@/lib/planner/filters'
import { cn } from '@/lib/utils'

/**
 * All · Drafts · Scheduled · Needs approval, plus a search box.
 *
 * ── LINKS AND A GET FORM, NOT CLIENT STATE ───────────────────────────────────
 * Same reasoning `ViewToggle` already carries and `flow-journeys.spec.ts`
 * already pins for `?view=`: a filter in the URL survives a reload, the back
 * button and a shared link, and it costs this route zero client JavaScript.
 * `/planner` has a JS budget; a tab bar that shipped a `useState` would spend
 * from it to deliver something worse.
 *
 * ── THE COUNT IS ON THE TAB ──────────────────────────────────────────────────
 * Not decoration: the reason to look at "Needs approval" is that the number is
 * not zero, and a tab that makes you click to find out is a tab you click four
 * times. Counts come from the caller so they are the SAME numbers the figures
 * above the list are reading.
 *
 * There is deliberately no "Filter" button. The tabs, the search and the
 * calendar ARE the filters, and a fourth control that opened a menu duplicating
 * them would be a second door to one room.
 */
export function PlannerToolbar({
  active,
  counts,
  query,
  view,
  dateKey,
  week,
}: {
  active: PlannerTab
  counts: Readonly<Record<PlannerTab, number>>
  query: string
  view: string
  dateKey: string | null
  /** The week offset, or null for this week. A GET form replaces the WHOLE
      query string, so anything not named here is silently discarded. */
  week: string | null
}) {
  /* Every link carries the view and the picked date forward. Dropping them would
     make choosing a tab silently reset two other choices the reader made. */
  const carry = {
    view,
    ...(dateKey !== null ? { date: dateKey } : {}),
    ...(week !== null ? { week } : {}),
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav aria-label="Filter the plan" className="flex flex-wrap items-center gap-1">
        {PLANNER_TABS.map((tab) => {
          const on = tab === active
          return (
            <Link
              key={tab}
              href={{
                pathname: '/planner',
                query: {
                  ...carry,
                  ...(tab === 'all' ? {} : { tab }),
                  ...(query ? { q: query } : {}),
                },
              }}
              aria-current={on ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-2 rounded-full px-3 py-1.5 type-sm transition-micro',
                'max-narrow:min-h-11',
                on
                  ? 'surface-ring-firm bg-surface font-[650] text-ink'
                  : 'text-muted hover:bg-s2 hover:text-ink',
              )}
            >
              {TAB_LABELS[tab]}
              {/* A zero is still information here — it is the answer to "is there
                  anything waiting?" — so it is shown rather than hidden. */}
              <span className={cn('num type-meta', on ? 'text-muted' : 'text-ink-mute')}>
                {counts[tab]}
              </span>
            </Link>
          )
        })}
      </nav>

      {/* A plain GET form. `method` is omitted because GET is the default and
          the whole point is that submitting produces a shareable URL. */}
      <form action="/planner" className="flex items-center gap-2">
        <input type="hidden" name="view" value={view} />
        {week !== null ? <input type="hidden" name="week" value={week} /> : null}
        {active !== 'all' ? <input type="hidden" name="tab" value={active} /> : null}
        {dateKey !== null ? <input type="hidden" name="date" value={dateKey} /> : null}

        <div className="surface-ring flex items-center gap-2 rounded-full bg-surface px-3 transition-micro focus-within:shadow-[inset_0_0_0_1.5px_var(--brand)]">
          <Search size={14} strokeWidth={2} aria-hidden className="shrink-0 text-ink-mute" />
          <label htmlFor="planner-search" className="sr-only">
            Search post titles
          </label>
          <input
            id="planner-search"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Search titles"
            className="h-9 w-40 bg-transparent type-sm text-ink outline-none placeholder:text-ink-mute max-narrow:h-11 max-narrow:w-32"
          />
        </div>

        {query !== '' ? (
          <Link
            href={{
              pathname: '/planner',
              query: { ...carry, ...(active === 'all' ? {} : { tab: active }) },
            }}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1.5 type-meta text-muted transition-micro hover:bg-s2 hover:text-ink max-narrow:min-h-11"
          >
            <X size={13} strokeWidth={2} aria-hidden />
            Clear
          </Link>
        ) : null}
      </form>
    </div>
  )
}
