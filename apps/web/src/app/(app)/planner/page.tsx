import type { Channel } from '@sahoda/shared'
import { CalendarDays } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import { CreateWorkspaceButton } from '@/components/workspace/create-workspace-button'
import { PageTitle } from '@/components/page-title'
import { PlanWeekPanel } from '@/components/planner/plan-week-panel'
import { PlannerRow } from '@/components/planner/planner-row'
import { ViewToggle, type PlannerView } from '@/components/planner/view-toggle'
import { WeekGrid } from '@/components/planner/week-grid'
import { MonthGrid } from '@/components/planner/month-grid'
import { firstGridDay, MONTH_GRID_DAYS } from '@/lib/planner/month'
import { bucketWeek } from '@/lib/planner/week'
import { forDisplay } from '@/lib/posts/display-post'
import { readPosts, listVariantStates, LIST_LIMIT } from '@/lib/posts/read'
import { assembleSnapshot } from '@/lib/posts/live-state'
import { PublishStateProvider } from '@/components/posts/live/publish-state-provider'
import { LivePhaseNote } from '@/components/posts/live/live-phase-note'
import { autoPublishEnabled } from '@/lib/posts/auto-publish-server'
import { readConnectedChannels } from '@/lib/connections/read'
import { readCampaignsByPost } from '@/lib/campaigns/read'
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
  // THREE answers. "Your week shows up here" was rendered for a failed read and
  // for an account with no workspace as readily as for a genuinely empty plan —
  // and the panel above it offers to draft five posts into a week that cannot
  // hold them.
  const read = await readPosts()
  const posts = read.status === 'ok' ? read.posts : []
  // The evidence behind any "it happened" claim. Fails safe to an empty map, in
  // which case every chip renders the weaker claim rather than a solid publish.
  const postIds = posts.map((post) => post.id)
  // Batched for the whole week: one query, not one per row.
  // Campaign memberships join the SAME batch: one query for the whole page,
  // never one per row. `readCampaignsByPost` returns null on a failed read, and
  // `PlannerRow` renders nothing for `undefined` rather than claiming a post is
  // in no campaign.
  const [variantStates, connected, campaignsByPost] = await Promise.all([
    listVariantStates(postIds),
    readConnectedChannels(),
    readCampaignsByPost(postIds),
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
  // The gate below already models NOT KNOWN as `undefined` and answers it with
  // silence (see `unconnectedFrom`) — this read was the half that could not say
  // it. `listConnectedChannels` returned an EMPTY SET for a failed read, which
  // the gate reads as "known: nothing is connected", so a hiccup warned that
  // every picked channel was disconnected and sent the writer to reconnect
  // accounts that were fine. `no-workspace` stays an empty set because there it
  // is simply true.
  const connectedChannels =
    connected.status === 'ok'
      ? connected.channels
      : connected.status === 'no-workspace'
        ? new Set<Channel>()
        : undefined

  const shown = posts.map(forDisplay)

  return (
    <PublishStateProvider initial={liveSeed}>
      {/* ── THE PLAN COMES FIRST. AT EVERY WIDTH. ────────────────────────────────
          The founder ruled this for the phone: at 390 the grid used to start at
          y=773, behind the page header, the connect note and the Plan my week
          panel, and a planner whose plan is below three panels is not a planner.
          The ruling was applied `max-narrow` only, and desktop was left alone.

          MEASURED on this lane's baseline capture, 1440 light: it is worse on
          desktop, not better. On `?view=month` — a view the reader reached by
          deliberately clicking "Calendar" — the calendar begins at y=580 of a
          900px viewport, so more than half the screen is spent before the thing
          they asked for. The panel above it is 260px of a PAID action nobody
          requested. The phone ruling was not a mobile accommodation; it was the
          right answer, discovered at the width where the cost was unmissable.

          So the DOM order is now the reading order and there is no per-band
          reordering left. `space-y-grid` is back for the same reason it was
          dropped: it is margin-based and follows DOM order, which is now the
          order the eye sees at every width. The `max-narrow:order-*` ladder
          existed only to fight the old order and would now be six classes
          keeping two identical sequences in step. */}
      <div className="space-y-grid">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PageTitle sub="Plan, schedule and stay ahead.">Planner</PageTitle>
          {posts.length > 0 ? <ViewToggle active={view} /> : null}
        </div>

        <ConnectFirstNote connections={connected} />

        <div>
          {read.status === 'unreadable' ? (
            <p className="rounded-input bg-warn-bg px-3 py-2.5 text-[13px] text-warn">
              Couldn&rsquo;t load your plan just now &mdash; reload to see it. Nothing has been
              lost.
            </p>
          ) : read.status === 'no-workspace' ? (
            <EmptyState
              icon={CalendarDays}
              title="Create a workspace to plan a week"
              body="A plan belongs to a workspace and you don't have one yet. Nothing failed. There is simply no week to fill until one exists."
              action={<CreateWorkspaceButton variant="primary" />}
            />
          ) : posts.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="Your week shows up here"
              /* Not "up there". MEASURED at 390: the Plan my week control the
                 sentence points at is roughly 400px BELOW this text, because the
                 two-column desktop layout stacks on a phone. With exactly two
                 breakpoints (docs/26 §9.1) any direction word is a claim about
                 one of them; naming the control instead survives every reflow. */
              body="Plan my week drafts five posts and places them across your coming week."
              tip="Add goals first if you have a push this week: the plan bends toward them."
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
                    connected={connectedChannels}
                    autoPublish={autoPublish}
                    variantStates={variantStates.get(post.id) ?? []}
                    campaigns={campaignsByPost?.get(post.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* AFTER the plan, at every width. It is an offer to SPEND 20 credits,
            which is not what the reader opened this route to see — and as a
            260px panel carrying the loudest object in the lane it was taking the
            slot the plan needed. The one-line connect note above costs the plan
            nothing and is a standing condition worth meeting early; this is not.

            The spend panel goes only where there is something to spend from. A
            read hiccup keeps it — the plan may well be there. */}
        {read.status === 'no-workspace' ? null : <PlanWeekPanel />}

        <LivePhaseNote />

        {posts.length === LIST_LIMIT ? (
          <p className="type-meta tabular-nums text-muted">
            Showing the {LIST_LIMIT} most recently updated posts. Older ones may not be on this
            page.
          </p>
        ) : null}
      </div>
    </PublishStateProvider>
  )
}
