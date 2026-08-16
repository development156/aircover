import { CalendarDays } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import { PageTitle } from '@/components/page-title'
import { PlanWeekPanel } from '@/components/planner/plan-week-panel'
import { PlannerRow } from '@/components/planner/planner-row'
import { ViewToggle, type PlannerView } from '@/components/planner/view-toggle'
import { WeekGrid } from '@/components/planner/week-grid'
import { MonthGrid } from '@/components/planner/month-grid'
import { firstGridDay, MONTH_GRID_DAYS } from '@/lib/planner/month'
import { bucketWeek } from '@/lib/planner/week'
import { forDisplay } from '@/lib/posts/display-post'
import { listPosts, listVariantStates, LIST_LIMIT } from '@/lib/posts/read'
import { assembleSnapshot } from '@/lib/posts/live-state'
import { PublishStateProvider } from '@/components/posts/live/publish-state-provider'
import { LivePhaseNote } from '@/components/posts/live/live-phase-note'
import { autoPublishEnabled } from '@/lib/posts/auto-publish-server'
import { listConnectedChannels } from '@/lib/connections/read'
import { ConnectFirstNote } from '@/components/connections/connect-first-note'

export const metadata = { title: 'Planner' }

export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  const { view: rawView } = await searchParams
  // LIST is the default on purpose: approve and reschedule live on list rows,
  // and the seeded approve.first_tour targets `planner.approve` on THIS route —
  // defaulting to the week grid would put the tour's anchor (and Alpha item 7's
  // reschedule) behind a toggle the user hasn't found yet. The review that
  // caught this: anchor-integrity scans source text, so only runtime DOM
  // reachability decides whether a tour actually shows.
  // LIST stays the DEFAULT even though the reference leads with its calendar.
  // The reason above still holds: approve and reschedule live on list rows and
  // the seeded tour anchors `planner.approve` on this route, so defaulting to a
  // grid would put the tour's anchor behind a toggle nobody has found yet.
  // Calendar is one click away and is the first segment in the control.
  const view: PlannerView = rawView === 'week' ? 'week' : rawView === 'month' ? 'month' : 'list'
  const posts = await listPosts()
  // The evidence behind any "it happened" claim. Fails safe to an empty map, in
  // which case every chip renders the weaker claim rather than a solid publish.
  const postIds = posts.map((post) => post.id)
  // Batched for the whole week: one query, not one per row.
  const [variantStates, connected] = await Promise.all([
    listVariantStates(postIds),
    listConnectedChannels(),
  ])
  // One instant for the whole screen: the week buckets and the past-due notes
  // must not be computed against two different clocks.
  const autoPublish = autoPublishEnabled()
  const now = new Date()

  // The provider's seed, assembled from reads this page has ALREADY done —
  // `listPosts` returns `status` and `scheduled_at`, and the two maps are right
  // there. So live updates cost this render exactly nothing; the first paint is
  // still one server pass with no fetch behind it.
  const liveSeed = assembleSnapshot(
    posts.map((post) => ({
      id: post.id,
      status: post.status,
      scheduledAt: post.scheduled_at,
    })),
    variantStates,
    now.toISOString(),
  )

  // Converted at the page boundary, in the open: past this line no component can
  // reach `post.status` at all. See `display-post.ts`.
  const shown = posts.map(forDisplay)

  return (
    <PublishStateProvider initial={liveSeed}>
      <div className="space-y-grid">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PageTitle sub="Plan, schedule and stay ahead.">Planner</PageTitle>
          {posts.length > 0 ? <ViewToggle active={view} /> : null}
        </div>

        <ConnectFirstNote connectedCount={connected.size} />

        <PlanWeekPanel />

        {posts.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Your week shows up here"
            body="One click up there drafts five posts and places them across your coming week."
            tip="Add goals first if you have a push this week — the plan bends toward them."
          />
        ) : view === 'month' ? (
          // 42 IST days from the Monday on or before the 1st — `bucketWeek`
          // already buckets any run of consecutive days, so the calendar needed
          // no second date implementation to drift from the first.
          <MonthGrid
            buckets={bucketWeek(shown, firstGridDay(now), MONTH_GRID_DAYS)}
            monthAnchor={now}
          />
        ) : view === 'week' ? (
          <WeekGrid
            buckets={bucketWeek(shown, now)}
            now={now}
            variantStates={variantStates}
            autoPublish={autoPublish}
          />
        ) : (
          <ul className="space-y-2" data-guide="planner.list">
            {shown.map((post) => (
              <li key={post.id}>
                {/* `autoPublish` was computed here and never passed, so every row
                  defaulted to false and read "Won't post itself — scheduled
                  auto-publish isn't live yet" while the dispatcher was on. The
                  default under-promises, which was the safe direction right up
                  until the rail went live. It is also what `PlannerReschedule`
                  needs before it can warn about an unconnected channel. */}
                <PlannerRow
                  post={post}
                  now={now}
                  connected={connected}
                  autoPublish={autoPublish}
                  variantStates={variantStates.get(post.id) ?? []}
                />
              </li>
            ))}
          </ul>
        )}

        <LivePhaseNote />

        {posts.length === LIST_LIMIT ? (
          <p className="text-[13px] tabular-nums text-muted">
            Showing the {LIST_LIMIT} most recently updated posts — older ones may not be on this
            page.
          </p>
        ) : null}
      </div>
    </PublishStateProvider>
  )
}
