import Link from 'next/link'
import { Search, X } from 'lucide-react'

import { Segmented, segmentedItem } from '@/components/planner/segmented'
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
      {/* ── ONE SEGMENTED CONTROL, THE SAME ONE `ViewToggle` WEARS ────────────
          These were four loose pills on the page ground, where the standing tab
          was told apart by a ring the other three did not have. Two rows above,
          `ViewToggle` draws the identical job — pick one of four — as the kit's
          `.sl-seg`: a padded well, and the chosen item LIFTED onto `--surface`
          rather than sunk into a darker fill. One page carrying two grammars for
          one interaction is the drift this whole redesign is about, so the tabs
          take the grammar that was already right.

          The well is `bg-s2`, the same `--surface-2` the view control uses, and
          the group is `rounded-md` (20px) with items at `rounded-sm` (12px) —
          docs/37 §5's ladder rule: a nested surface's radius is the parent's
          minus one step. */}
      <Segmented label="Filter the plan">
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
              className={segmentedItem(on, 'py-1.5')}
            >
              {TAB_LABELS[tab]}
              {/* A zero is still information here — it is the answer to "is there
                  anything waiting?" — so it is shown rather than hidden.

                  On the standing tab the count sits in its own tinted chip, so
                  the number the reader came for is the strongest thing in the
                  control. Off the standing tab it stays a quiet numeral: four
                  chips would be four badges and none of them a signal. */}
              <span
                className={cn(
                  'num type-meta',
                  on ? 'rounded-pill bg-brand-tint px-1.5 font-bold text-ink' : 'text-ink-mute',
                )}
              >
                {counts[tab]}
              </span>
            </Link>
          )
        })}
      </Segmented>

      {/* A plain GET form. `method` is omitted because GET is the default and
          the whole point is that submitting produces a shareable URL. */}
      <form action="/planner" className="flex items-center gap-2">
        <input type="hidden" name="view" value={view} />
        {week !== null ? <input type="hidden" name="week" value={week} /> : null}
        {active !== 'all' ? <input type="hidden" name="tab" value={active} /> : null}
        {dateKey !== null ? <input type="hidden" name="date" value={dateKey} /> : null}

        <div className="surface-ring flex items-center gap-2 rounded-pill bg-surface px-3 transition-micro focus-within:shadow-[inset_0_0_0_1.5px_var(--brand)]">
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
            className="inline-flex items-center gap-1 rounded-pill px-2 py-1.5 type-meta text-muted transition-micro hover:bg-s2 hover:text-ink max-narrow:min-h-11"
          >
            <X size={13} strokeWidth={2} aria-hidden />
            Clear
          </Link>
        ) : null}
      </form>
    </div>
  )
}
