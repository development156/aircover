import { CalendarDays } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import { PageTitle } from '@/components/page-title'
import { PlanWeekPanel } from '@/components/planner/plan-week-panel'
import { PlannerRow } from '@/components/planner/planner-row'
import { ViewToggle, type PlannerView } from '@/components/planner/view-toggle'
import { WeekGrid } from '@/components/planner/week-grid'
import { bucketWeek } from '@/lib/planner/week'
import { listPosts, LIST_LIMIT } from '@/lib/posts/read'

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
  const view: PlannerView = rawView === 'week' ? 'week' : 'list'
  const posts = await listPosts()
  // One instant for the whole screen: the week buckets and the past-due notes
  // must not be computed against two different clocks.
  const now = new Date()

  return (
    <div className="space-y-grid">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>Planner</PageTitle>
        {posts.length > 0 ? <ViewToggle active={view} /> : null}
      </div>

      <PlanWeekPanel />

      {posts.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Your week shows up here"
          body="One click up there drafts five posts and places them across your coming week."
          tip="Add goals first if you have a push this week — the plan bends toward them."
        />
      ) : view === 'week' ? (
        <WeekGrid buckets={bucketWeek(posts, now)} now={now} />
      ) : (
        <ul className="space-y-2" data-guide="planner.list">
          {posts.map((post) => (
            <li key={post.id}>
              <PlannerRow post={post} now={now} />
            </li>
          ))}
        </ul>
      )}

      {posts.length === LIST_LIMIT ? (
        <p className="text-[13px] tabular-nums text-faint">
          Showing the {LIST_LIMIT} most recently updated posts — older ones may not be on this page.
        </p>
      ) : null}
    </div>
  )
}
