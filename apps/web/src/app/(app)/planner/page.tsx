import Link from 'next/link'
import { getActiveWorkspace } from '@/lib/workspaces'
import type { Channel } from '@sahoda/shared'
import { CalendarDays } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import { CreateWorkspaceButton } from '@/components/workspace/create-workspace-button'
import { PlanWeekPanel } from '@/components/planner/plan-week-panel'
import { PlannerHero } from '@/components/planner/planner-hero'
import { OffGridNote } from '@/components/planner/off-grid-note'
import { PlannerToolbar } from '@/components/planner/planner-toolbar'
import { PlannerMiniCalendar } from '@/components/planner/planner-mini-calendar'
import { PlannerUpcoming } from '@/components/planner/planner-upcoming'
import {
  applyFilter,
  isFiltered,
  matchesTab,
  parseDate,
  parseQuery,
  parseTab,
  upcoming,
  PLANNER_TABS,
  type PlannerTab,
} from '@/lib/planner/filters'
import { PlannerRow } from '@/components/planner/planner-row'
import { ViewToggle, type PlannerView } from '@/components/planner/view-toggle'
import { WeekTimeline } from '@/components/planner/week-timeline'
import { PlannerSummary } from '@/components/planner/planner-summary'
import { WeekNav } from '@/components/planner/week-nav'
import { istDayKey, weekWindow } from '@/lib/planner/week-window'
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
  searchParams: Promise<{
    view?: string
    week?: string
    tab?: string
    date?: string
    q?: string
  }>
}) {
  const {
    view: rawView,
    week: rawWeek,
    tab: rawTab,
    date: rawDate,
    q: rawQuery,
  } = await searchParams
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
  const view: PlannerView =
    rawView === 'week' ? 'week' : rawView === 'day' ? 'day' : rawView === 'month' ? 'month' : 'list'
  // A week offset that is not a finite integer is not a week. Falling back to 0
  // shows THIS week rather than throwing, and never renders a window derived
  // from NaN — which would produce seven Invalid Date columns.
  const parsedWeek = Number(rawWeek)
  const weekOffset = Number.isFinite(parsedWeek) ? Math.trunc(parsedWeek) : 0
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
  const [variantStates, connected, campaignsByPost, workspace] = await Promise.all([
    listVariantStates(postIds),
    readConnectedChannels(),
    readCampaignsByPost(postIds),
    // Alongside the others: `read-waterfall.test.ts` counts sequential reads per
    // route, and it caught this one being awaited on its own line.
    getActiveWorkspace(),
  ])
  // One instant for the whole screen: the week buckets and the past-due notes
  // must not be computed against two different clocks.
  const autoPublish = autoPublishEnabled()
  const now = new Date()
  // The clock every time on this page is rendered in: the workspace's own when
  // it has one, the shipped default when it does not.
  const zone = workspace?.timezone ?? null

  // The Monday-anchored window this view is looking at. `bucketWeek` starts at
  // TODAY, which cannot be navigated: "previous week" would move by a
  // different amount depending on the weekday you asked on.
  const window = weekWindow(now, weekOffset)
  const todayKey = istDayKey(now)
  const isToday = (day: Date): boolean => istDayKey(day) === todayKey
  const windowKeys = new Set(window.days.map(istDayKey))

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

  // ── WHAT THE READER NARROWED THE PLAN TO ──────────────────────────────────
  // All three live in the URL, for the reason `flow-journeys.spec.ts` already
  // pins for `?view=`: "The view lives in the URL rather than in state… moving
  // it into React state would be an easy, invisible regression." It also means
  // the whole toolbar and the whole calendar cost this route no client JS.
  const filter = {
    tab: parseTab(rawTab),
    query: parseQuery(rawQuery),
    dateKey: parseDate(rawDate),
  }
  const narrowed = isFiltered(filter)
  /** Carried on every filter link. `null` for this week, so the URL stays clean. */
  const weekParam = weekOffset === 0 ? null : String(weekOffset)

  /**
   * Where "see them in the list" goes. It keeps the tab, the search and the
   * picked date, because the count in that sentence was measured against them:
   * sending the reader to an UNFILTERED list would show a different number of
   * posts from the one the sentence has just promised.
   */
  const listCarry = {
    view: 'list',
    ...(filter.tab === 'all' ? {} : { tab: filter.tab }),
    ...(filter.query === '' ? {} : { q: filter.query }),
    ...(filter.dateKey === null ? {} : { date: filter.dateKey }),
  }
  const visible = applyFilter(shown, filter)

  // ── EACH COUNT IS WHAT THAT TAB WOULD SHOW, GIVEN THE OTHER TWO FILTERS ────
  // Not the count of the whole page, and not the count of what is already
  // showing. The first was wrong and shipped for an hour: with `?q=chai` the All
  // tab read 4 above a list of 1, which is a figure no query produced. The
  // second is wrong differently — it reads 0 on every tab you are not standing
  // on, which is the opposite of what a count is for.
  //
  // So: apply the search and the picked date, then count each tab within that.
  // Stand on any tab and its own number is exactly the number of rows beneath it.
  const beforeTab = applyFilter(shown, { ...filter, tab: 'all' })
  const tabCounts = Object.fromEntries(
    PLANNER_TABS.map((tab) => [tab, beforeTab.filter((p) => matchesTab(p, tab)).length]),
  ) as Record<PlannerTab, number>

  // Five, not three: the founder's brief says "next 3-5", and five fills the
  // rail beside the calendar without needing its own scroller.
  const next = upcoming(shown, now, 5)

  // ── WHAT THE CHOSEN VIEW CAN ACTUALLY DRAW ────────────────────────────────
  // Keyed to the days the view RENDERS, not to the week. The week's keys were
  // the wrong set and it left a hole a click could reach: on `?view=day` the
  // timeline draws today's column only, so picking tomorrow in the calendar
  // showed an empty day, while `offGrid` measured against the whole week said 0
  // and printed nothing. A screen that renders nothing and explains nothing is
  // the failure `no-impossible-remedy.spec.ts` exists to catch, one state along.
  const drawnKeys =
    view === 'month'
      ? new Set(
          Array.from({ length: MONTH_GRID_DAYS }, (_, i) =>
            istDayKey(new Date(firstGridDay(now).getTime() + i * 86_400_000)),
          ),
        )
      : view === 'day'
        ? new Set(window.days.filter(isToday).map(istDayKey))
        : windowKeys

  const offGrid = visible.filter((p) => {
    if (p.scheduled_at === null) return true
    const at = new Date(p.scheduled_at)
    return Number.isNaN(at.getTime()) || !drawnKeys.has(istDayKey(at))
  }).length

  return (
    <PublishStateProvider initial={liveSeed}>
      {/* ── THE PLAN COMES FIRST. AT EVERY WIDTH. ────────────────────────────────
          The founder ruled this for the phone: at 390 the grid used to start at
          y=773, behind the page header, the connect note and the Plan my week
          panel, and a planner whose plan is below three panels is not a planner.
          The ruling was applied `max-narrow` only, and desktop was left alone.

          MEASURED on this lane's baseline capture, 1440 light: it is worse on
          desktop, not better. On `?view=month` — a view the reader reached by
          deliberately clicking "Month" — the calendar begins at y=580 of a
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
        <div className="enter">
          <PlannerHero context={<ConnectFirstNote connections={connected} />}>
            {posts.length > 0 ? <ViewToggle active={view} /> : null}
          </PlannerHero>
        </div>

        {/* THE FIGURES DESCRIBE THE WHOLE PLAN, NEVER THE FILTER. They sit
            ABOVE the toolbar and they are how the reader decides which filter to
            pick — a "Needs approval" figure that dropped to 0 because you
            searched for "chai" would remove the very reason to clear the search.
            So they read `shown`, and the tab counts below read the filtered set.
            The two are different questions and are deliberately different
            numbers; an earlier comment here claimed they could never disagree,
            which was false the moment a search existed. */}
        {posts.length > 0 ? (
          <div className="enter-step" style={{ '--i': 1 } as React.CSSProperties}>
            <PlannerSummary posts={shown} now={now} zone={zone} />
          </div>
        ) : null}

        {/* ── THE PLAN, AND THE RAIL BESIDE IT ────────────────────────────────
            One column until 1180, two above it. `wide` and not `narrow` on
            purpose: the middle band (700-1179) already gives the shell a 72px
            icon rail, and taking a further 300px out of a 1024px viewport
            leaves the plan itself under 600px — which is the width the founder's
            brief calls "content remains primary" and this would not be.

            DOM order is reading order: the plan first, the calendar after. On a
            phone that is exactly what the brief asks for ("calendar moves below
            content"), so there is no per-band reordering here at all. */}
        <div className="flex flex-col gap-grid wide:flex-row wide:items-start">
          <div className="min-w-0 flex-1 space-y-3">
            {read.status === 'unreadable' ? (
              <p className="rounded-input bg-warn-bg px-3 py-2.5 type-sm text-warn">
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
                tip="Add goals first if you have a push this week. The plan bends toward them."
              />
            ) : (
              <>
                {/* The toolbar sits above EVERY view, not just the list: a tab or a
                  search that vanished when you clicked Month would read as the
                  filter having been discarded. */}
                <PlannerToolbar
                  active={filter.tab}
                  counts={tabCounts}
                  query={filter.query}
                  view={view}
                  dateKey={filter.dateKey}
                  week={weekParam}
                />

                {/* ── NOTHING LEFT AFTER FILTERING IS A DIFFERENT SENTENCE ──────
                  "Your week shows up here" is the claim for a workspace with no
                  posts. Saying it to someone who has eight drafts and typed
                  "chai" would be false, and the remedy it offers — plan a week —
                  is not the remedy for a search that matched nothing.
                  `no-impossible-remedy.spec.ts` exists for exactly this class. */}
                {narrowed && visible.length === 0 ? (
                  <p className="surface-ring rounded-card bg-surface px-4 py-8 text-center type-sm text-muted">
                    No post matches this filter.{' '}
                    <Link
                      href={{ pathname: '/planner', query: { view } }}
                      className="font-[650] text-accent underline underline-offset-2"
                    >
                      Show everything
                    </Link>
                  </p>
                ) : view === 'month' ? (
                  // 42 IST days from the Monday on or before the 1st — `bucketWeek`
                  // already buckets any run of consecutive days, so the calendar needed
                  // no second date implementation to drift from the first.
                  <div className="space-y-3">
                    <MonthGrid
                      buckets={bucketWeek(visible, firstGridDay(now), MONTH_GRID_DAYS)}
                      monthAnchor={now}
                    />
                    {/* The month grid had no such note at all, so a picked date
                        outside its 42 days rendered a calendar with nothing on it
                        and no sentence saying why. */}
                    <OffGridNote count={offGrid} carry={listCarry} />
                  </div>
                ) : view === 'week' || view === 'day' ? (
                  <div className="space-y-3">
                    {/* The filters ride along. Stepping a week used to emit
                        `{ view, week }` and nothing else, so "Next week" silently
                        cleared the tab and the search the reader was looking at. */}
                    <WeekNav
                      days={window.days}
                      offset={weekOffset}
                      view={view}
                      filters={{
                        ...(filter.tab === 'all' ? {} : { tab: filter.tab }),
                        ...(filter.query === '' ? {} : { q: filter.query }),
                        ...(filter.dateKey === null ? {} : { date: filter.dateKey }),
                      }}
                    />
                    {/* No `zone`: the grid places every card by
                        PLANNER_GRID_ZONE, and its caption reads the same zone.
                        Passing the workspace's would only let the two drift
                        apart again. */}
                    <WeekTimeline
                      days={view === 'day' ? window.days.filter(isToday) : window.days}
                      posts={visible}
                      variantStates={variantStates}
                      today={now}
                    />
                    {/* WHAT THE VIEW STRUCTURALLY CANNOT SHOW, SAID RATHER THAN
                        DROPPED. A post with no `scheduled_at` has no minute to sit
                        at, and one scheduled outside the drawn days belongs to
                        another window. Rendering `WeekGrid` underneath would have
                        covered them — and would also have redrawn every post already
                        on the timeline, so the week appeared twice. The note names
                        the count and points at List, the one view that can show them
                        without inventing a date for them. */}
                    <OffGridNote count={offGrid} carry={listCarry} />
                  </div>
                ) : (
                  <ul
                    /* One surface with hairline dividers, not forty bordered cards.
                 Same information, a fraction of the ink — and `divide-y` puts
                 the rule BETWEEN rows, so neither the first nor the last carries
                 a stray edge against the card's own ring. */
                    className="surface-ring divide-y divide-line-soft overflow-hidden rounded-card bg-surface"
                    data-guide="planner.list"
                  >
                    {visible.map((post) => (
                      <li key={post.id}>
                        {/* `autoPublish` was computed here and never passed, so every row
                  defaulted to false and read "Won't post itself — scheduled
                  auto-publish isn't live yet" while the dispatcher was on. The
                  default under-promises, which was the safe direction right up
                  until the rail went live. It is also what `PlannerReschedule`
                  needs before it can warn about an unconnected channel. */}
                        <PlannerRow
                          zone={zone}
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
              </>
            )}
          </div>

          {/* ── THE RAIL ────────────────────────────────────────────────────
              300px at `wide`, full width below it, and `sticky` only where
              there is a viewport tall enough to make sticking useful. It holds
              the two questions the list cannot answer at a glance: which days
              of the month carry work, and what is actually next.

              It is rendered only when the workspace HAS posts. A calendar with
              no dots and an "Upcoming" heading over nothing are two more cards
              explaining an absence the empty state already states once, which
              is the exact shape docs/37 §16 names as the v4 failure. */}
          {posts.length > 0 ? (
            <aside
              className="enter-step flex w-full shrink-0 flex-col gap-3 wide:sticky wide:top-6 wide:w-[300px]"
              style={{ '--i': 2 } as React.CSSProperties}
            >
              <PlannerMiniCalendar
                posts={shown}
                now={now}
                selected={filter.dateKey}
                view={view}
                tab={filter.tab === 'all' ? null : filter.tab}
                query={filter.query}
                week={weekParam}
              />
              {next.length > 0 ? <PlannerUpcoming posts={next} zone={zone} /> : null}
            </aside>
          ) : null}
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
