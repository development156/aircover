import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { creditCost } from '@sahoda/shared'

import { PlanOfferMount } from '@/components/billing/plan-offer-mount'
import { planOfferDecision } from '@/lib/billing/plan-offer'
import { planOfferRows } from '@/lib/billing/plan-offer-rows'
import { readSubscription } from '@/lib/billing/read'

import { AtAGlance } from '@/components/home/at-a-glance'
import { FirstRun } from '@/components/home/first-run'
import { GetStarted } from '@/components/home/get-started'
import { GreetingBanner } from '@/components/home/greeting-banner'
import { HomeSection } from '@/components/home/section'
import { NeedsAttention } from '@/components/home/needs-attention'
import { BrainCard, ConnectionsCard } from '@/components/home/rail-cards'
import { countIndexedDocuments } from '@/lib/knowledge/store'
import { InstagramInsights } from '@/components/home/instagram-insights'
import { PerformanceStrip } from '@/components/analytics/performance-strip'
import { LiveConsole } from '@/components/home/live-console'
import { SahodaRail } from '@/components/home/sahoda-rail'
import { SetupStrip } from '@/components/home/setup-strip'
import { SpendCard } from '@/components/home/spend-card'
import { WeekStrip } from '@/components/home/week-strip'
import { StaggerItem } from '@/components/motion/stagger'
import { ActivityFeed } from '@/components/home/activity-feed'
import { readInstagramAnalytics } from '@/lib/analytics/account-insights'
import { readBrain } from '@/lib/brand/read-brain'
import { listConnections } from '@/lib/connections/read'
import { greetingFor, greetingState } from '@/lib/home/greeting'
import { hasDeferredOnboarding } from '@/lib/onboarding/defer'
import { landingDecision, type LandingDecision } from '@/lib/onboarding/landing'
import { onboardingStateRead } from '@/lib/onboarding/read-onboarding-state'
import { readPostCounts } from '@/lib/home/posts'
import { readPublishSummary } from '@/lib/home/publishing'
import { readSpend } from '@/lib/home/spend'
import { readCronRun } from '@/lib/cron/heartbeat-store'
import { balanceSeries } from '@/lib/home/balance-history'
import { liveLines } from '@/lib/home/live'
import { setupLadder } from '@/lib/home/setup'
import { startSteps, workspaceHasStarted, type StartedSignals } from '@/lib/home/started'
import { resolveDisplayZone } from '@/lib/time/zone'
import { activeWorkspaceRead } from '@/lib/workspaces'
import { bucketWeek } from '@/lib/planner/week'
import { forDisplay } from '@/lib/posts/display-post'
import { listPosts, listVariantStates } from '@/lib/posts/read'
import { readBalance, readLedger } from '@/lib/wallet/read'

export const metadata = { title: 'Home' }

/**
 * THE LANDING RULE — a new user lands in onboarding, not on the dashboard.
 *
 * ── WHY IT IS ON THIS PAGE AND NOT IN THE LAYOUT ─────────────────────────────
 * /home IS the landing. Clerk returns to `/` after sign-in and `app/page.tsx`
 * redirects here, so this is the first authenticated screen of every session.
 * The `(app)` layout was the other candidate and asks a different question: it
 * runs for every route in the group, so the rule would fire on a typed
 * /posts/new and on every refresh of every page. That is a wall, and the ruling
 * says "lands".
 *
 * ── THE THREE ANSWERS IT ACTS ON ─────────────────────────────────────────────
 *   never onboarded  → /onboarding.
 *   mid-way          → /onboarding, and the stage restores the step they left
 *                      from localStorage on mount. The server cannot tell these
 *                      two apart and does not need to: same URL, different
 *                      screen, decided by the browser that holds the answer.
 *   completed        → this page. Nothing offers the flow again.
 *
 * `unreadable` is deliberately not one of them: a failed read is not a fact
 * about the account, and moving somebody on it would walk a customer who
 * finished onboarding weeks ago back to its first screen. `no-workspace` is not
 * one either — that account is answered by the layout, which replaces this page
 * with the first-run screen rather than sending it anywhere.
 *
 * `Save & exit` sets a session cookie that stands this down for the visit, so
 * the button wt-onboard2 built still arrives somewhere. It re-arms at the next
 * sign-in, which is the ruling's "resumes at the step they left".
 */
async function landingFor(): Promise<LandingDecision> {
  const [deferred, state] = await Promise.all([hasDeferredOnboarding(), onboardingStateRead()])
  return landingDecision(state.status, deferred)
}

/**
 * Home.
 *
 * DESIGNED FOR EMPTY FIRST. Most workspaces have no publish logs, a handful of
 * spend rows and nothing from Sahoda, so that is the state this page is built
 * around — sparse with intent, not a full dashboard degrading into zeroes. A
 * grid of zero-value cards reads broken; a short page with one clear thing to
 * press reads calm, and it is what a new workspace honestly is.
 *
 * ── THE 2026-08-30 REBUILD ───────────────────────────────────────────────────
 * The brief was that this read as separate UI blocks rather than one product,
 * and the measurement agreed: the page rendered its regions in THREE different
 * card grammars at once — a 46px ruled header on four of them, an unruled 20px
 * head on the charts, and a small caps label with no heading at all on the
 * planner block. Counting the four stat cards, thirteen separate ringed boxes
 * went down one screen. Restyling any one of them could not fix that, because
 * the defect was that there were three of them.
 *
 * So: ONE card language (`home/section.tsx`), and the four numbers became one
 * divided board rather than four boxes. Then the queue — the question somebody
 * actually opened the app to ask — came out of the 1fr column and now leads
 * across the full width, which left the split with a clean division of labour:
 * the REPORT on the left, the SOURCES on the right.
 *
 * NOTHING WAS REMOVED. Every region, sentence, absence state and remedy that
 * was on the old page is on this one, and every figure still comes from a table
 * or from a platform that reported it.
 *
 * ── ONE THING LEADS, AND IT IS THE QUEUE (2026-08-20 restructure) ────────────
 * docs/27 §1 found "two competing heroes" and no focal point. Both heroes were
 * real: the greeting, and `Available credits` at `type-display` with a brand
 * shadow in the rail. docs/26 §5 allows ONE `type-display` per view and says it
 * may never sit beside another hero.
 *
 * The credits number lost. Not because it matters less, but because it was
 * already on this screen TWICE MORE — the topbar chip and the rail foot both
 * render the same figure — so the biggest type on the page was its third copy.
 * It is now a compact stat in the rail, and the greeting is the page's only
 * display-weight element.
 *
 * What leads instead is `Needs your attention`. The four questions
 * (SPECIFICATION.md §1) are what happened · what is happening · what needs me ·
 * what next, and that is the order they are ANSWERED in, not the order of
 * importance. A shop owner checking this between customers is answering "what
 * needs me" — so the queue moved from fourth in the left column, below two
 * charts and a spend card, to directly under the greeting. Everything that was
 * above it is a report, and a report can wait for a scroll. The 2026-08-30
 * rebuild took the same argument one step further and gave it the full width.
 *
 * ── ARRIVAL ─────────────────────────────────────────────────────────────────
 * The nine reads stay in ONE `Promise.all`. That is one wait, not nine, and
 * splitting it into per-section Suspense boundaries would trade a single
 * skeleton for nine independent pop-ins. `loading.tsx` holds the shape while it
 * resolves and the regions then arrive in sequence via `StaggerItem` — one
 * ladder down the left column and on into the rail, so the page deals itself
 * rather than flashing (docs/26 §8.1).
 *
 * Every number comes from a table or from a platform that reported it. No
 * placeholder figures and no seeded demo values.
 *
 * Followers and reach DO appear here now, which the previous version of this note
 * said they never would — at the time nothing recorded them. They arrive from
 * Instagram via Zernio, and they arrive with the same rule the rest of the page
 * follows: a number is shown only when something measured it. Instagram reports on
 * a ~24-48h delay and expresses "nothing yet" as zeroes, so those zeroes are
 * classified upstream and rendered as "not available yet" rather than as a reading.
 * A workspace with no Instagram connection sees no insights card at all, because a
 * grid of zero-value cards reads broken — the rule above, applied to the new block.
 */
export default async function HomePage() {
  const now = new Date()

  // Two reads were ADDED for the restructure — the rail's Brand Brain and
  // Connections cards. Both already existed and are already used elsewhere
  // (the topbar ring, /connections), so this adds calls, not queries, and both
  // degrade to a named state rather than throwing.
  const [
    landing,
    posts,
    spend,
    counts,
    publish,
    balance,
    ledger,
    instagram,
    brain,
    connections,
    knowledgeDocuments,
    subscription,
    session,
    workspace,
    sweepRanAt,
  ] = await Promise.all([
    /**
     * IN THE BATCH, NOT IN FRONT OF IT.
     *
     * The landing rule has to be decided before this page may render, and the
     * obvious shape — `await landingFor()` on its own line — puts a whole round
     * trip in front of the nine reads for EVERY returning customer, which is a
     * waterfall `lib/perf/read-waterfall.test.ts` exists to refuse. Here it is
     * one wait, not two.
     *
     * What it costs instead: an account that is about to be redirected runs
     * these nine reads and throws them away. That is a new workspace with almost
     * nothing in it, once, on the way into onboarding — the right side of the
     * trade against a slower dashboard for everyone who has already finished.
     *
     * Both of its own reads are `cache()`d and the layout has already asked for
     * them this render, so this is a shared promise rather than a second query.
     */
    landingFor(),
    listPosts(),
    readSpend(now),
    readPostCounts(),
    readPublishSummary(now),
    readBalance(),
    readLedger(),
    // Degrades to a named state — never throws, never zeroes. A dead Zernio must
    // not take Home down with it.
    readInstagramAnalytics(now),
    readBrain(),
    listConnections(),
    /**
     * The library count for the rail's Brand Brain card.
     *
     * `readLibrary` is `cache`d and short-circuits on a null workspace without
     * touching the database, so this joins the batch rather than adding a
     * blocking read — the same argument the two reads above it carry. It
     * returns `null` when the query fails, which renders the Unmeasured mark
     * rather than a zero: a failed read is not an empty library.
     */
    countIndexedDocuments(),
    /**
     * The plan offer's read. In the batch rather than on its own line below —
     * see the offer's own note for the guard that decided that. It short-circuits
     * on a null workspace without touching the database, like the rest of them.
     */
    readSubscription(),
    /**
     * The Clerk session, for the plan offer's dismissal key. In the batch for
     * the same reason `readSubscription` is: `lib/perf/read-waterfall.test.ts`
     * counts a bare `await` below this block as a sequential read and refuses
     * it, and it was right both times — a round trip in front of the dashboard
     * costs every returning customer, where being in the batch costs only the
     * accounts on their way into onboarding one throwaway call.
     */
    auth(),
    /**
     * The workspace row, for its timezone. Already `cache()`d by every reader
     * above, so this is the shared promise and not a fourteenth query.
     */
    activeWorkspaceRead(),
    /**
     * When the publishing sweep last ran, for the live console's last line.
     * One Upstash GET; null without credentials, which the console renders as
     * the schedule rather than as a failure.
     */
    readCronRun('sweeps').catch(() => null),
  ])

  // The greeting's clock is the workspace's, not Kolkata's. `resolveDisplayZone`
  // falls back to IST for a workspace that never set one.
  const zone = resolveDisplayZone(
    workspace.status === 'ok' ? workspace.workspace.timezone : null,
  ).zone

  // THE RULING, ACTED ON. Everything above was read in parallel with the
  // decision; nothing below this line renders for an account that belongs in
  // onboarding. `redirect` throws, so it never falls through.
  if (landing.kind === 'redirect') redirect(landing.to)

  // No workspace ⇒ no wallet, no posts, no credits, and nothing on this page can
  // be pressed to fix that. Every read above already short-circuits on a null
  // workspace WITHOUT touching the database, so this branch costs nothing and the
  // dashboard is replaced rather than rendered empty. See FirstRun for why.
  if (balance.status === 'no-workspace') return <FirstRun now={now} />

  /**
   * ── THE PLANS, OFFERED ONCE TO A WORKSPACE THAT IS NOT ON ONE ──────────────
   *
   * /home is where a session lands (see the landing rule above), so it is where
   * "on arriving at the dashboard" happens. Mounting this in the `(app)` layout
   * was the other candidate and was refused for the same reason the landing rule
   * is not there: the layout runs for every route in the group, so the offer
   * would appear over /posts, over a typed URL and over every refresh. That is a
   * wall, not an offer.
   *
   * ── AND ITS READ IS IN THE BATCH ABOVE, BECAUSE A GUARD INSISTED ──────────
   * It was written as its own `await` on this line, with a comment arguing that
   * only accounts which actually reach the dashboard should pay for it.
   * `lib/perf/read-waterfall.test.ts` refused: "/(app)/home: 7 to 8 sequential
   * reads (new: readSubscription)". The guard is right and the argument was
   * wrong. A sequential read is a whole extra round trip in front of EVERY
   * returning customer's dashboard, and what it was buying was one saved query
   * for an account on its way into onboarding. That is the same trade the batch
   * already makes for its other nine reads, and its own comment says so.
   *
   * ── THE SESSION ID IS READ ON THE CLIENT, NOT HERE ────────────────────────
   * The dismissal is scoped to the Clerk session so that closing it lasts for
   * one sign-in and no longer. The obvious way to get that id is `auth()` on
   * this server component, and it was written that way first. It broke four
   * tests in this page's own suite: `auth()` pulls in `server-only`, which
   * throws under the component test environment, and every existing assertion
   * about the landing rule went red naming a Realtime auth token.
   *
   * That was the test telling the truth about a real cost — a whole Clerk
   * server module dragged into the dashboard's render for one string the
   * browser already has. `useAuth()` in the modal reads it where it is used, and
   * this page keeps exactly one new read.
   *
   * ── AND IT SHOWS RUPEES, WITH NO LOCAL APPROXIMATION ──────────────────────
   * /wallet converts its prices for the reader's country, which costs two more
   * reads: the billing profile for a declared country and today's FX rates. Both
   * on the hottest route in the product, for an approximation, when the rupee
   * figure IS the charge — `plans.ts` is explicit that every plan is billed in
   * rupees and anything else is an approximation of one. So the dialog states
   * the charge and says it is in rupees, and /wallet stays the screen that
   * converts. The component keeps the props for a caller that wants to pay for
   * them.
   */
  // Decided below, once `workspaceHasStarted` has spoken: the offer waits for
  // the workspace's first action, and that verdict is the same one that picks
  // the empty dashboard over the full one.
  let offer: React.ReactNode = null

  /**
   * ── AND A WORKSPACE THAT EXISTS AND HOLDS NOTHING GETS ITS OWN SCREEN TOO ──
   *
   * The branch above replaces the dashboard when there is no workspace. The state
   * one step along — a workspace that exists and has nothing in it, which is
   * every account for its first hour — had no branch at all, so it rendered all
   * nine containers and each one announced the same absence independently.
   * MEASURED 2026-08-23: SEVEN statements of "you have not done anything yet" in
   * six visual languages, over 1085px at 1440, 1795px at 1024 and 2025px at 390.
   * `lib/home/started.ts` carries the count and the argument.
   *
   * Every signal is read ABOVE this line already, so the branch costs nothing,
   * and every unknown resolves to "started" — replacing a customer's dashboard on
   * the strength of a query that failed is a far worse error than one extra
   * scroll past some empty cards.
   */
  const signals: StartedSignals = {
    posts: posts.length,
    // `listConnections` returns null when the read failed, never on an empty table.
    connections: connections === null ? null : connections.length,
    hasBrain: brain.status === 'unreadable' ? null : brain.status === 'ok',
    spendRows: spend.status === 'unreadable' ? null : spend.byAction.length,
    // Account figures belong to the ACCOUNT, not to this workspace's work — a
    // shop with an Instagram following has something to report on day one.
    accountReported: instagram.kind === 'ready' && instagram.insights.length > 0,
  }
  const started = workspaceHasStarted(signals)
  /**
   * ── THE THREE DOORS, WITH A TICK EACH ──────────────────────────────────────
   * The same list `GetStarted` shows a workspace with nothing in it, for the
   * workspace that has begun but not finished — which is most of them, most
   * of the time. docs/37 §15: one absence, one statement, at the top, with the
   * action. The cards below keep their structure and stop repeating it.
   */
  const ladder = setupLadder({
    hasBrain: signals.hasBrain,
    connections: signals.connections,
    posts: posts.length,
  })
  const channelStated = !ladder.steps.some((step) => step.id === 'connect' && step.done)
  offer =
    session.sessionId !== null &&
    planOfferDecision(subscription, {
      hasStarted: started,
      // The balance was read for the board; the offer reads the same number,
      // so the dialog and the "Credits left" cell can never disagree about
      // whether the free grant is running out.
      creditsAvailable: balance.status === 'ok' ? balance.balance.available : null,
    }).kind === 'offer' ? (
      <PlanOfferMount sessionKey={session.sessionId} plans={planOfferRows()} />
    ) : null

  if (!started) {
    /* The offer rides BOTH dashboard states. A workspace with nothing in it yet
       is still a workspace on Free, and it is the account most likely to be
       weighing a plan. It used to ride this branch for that reason. MEASURED
       2026-09-05 in a real browser, the effect was a pricing dialog over the
       first dashboard a workspace ever saw, before it had done anything, and
       the founder ruled the same day that the offer waits for the first action.
       `planOfferDecision` takes `hasStarted` and returns `silent` here, exactly
       as it does for an account with NO workspace (which cannot check out at
       all): both exclusions live in the decision rather than in this JSX, so
       `{offer}` stays on every branch and is null on the ones it must not reach. */
    return (
      <>
        <GetStarted now={now} steps={startSteps()} />
        {offer}
      </>
    )
  }

  // The evidence behind `.is-real` on the strip. This page read publish-log
  // MODES here and never the variant rows, so a post that had genuinely gone out
  // could not render as real on Home at all — `posts.status` stays `approved`
  // through a publish. One batched query for the week, and it fails safe to an
  // empty map, in which case every entry under-claims rather than denying a
  // publish nobody read.
  const variantStates = await listVariantStates(posts.map((post) => post.id))
  // Converted at the page boundary, in the open: past this line no component can
  // reach `post.status` at all. See `display-post.ts`.
  // Converted ONCE and shared: the week strip and the attention queue both need
  // display posts, and calling `forDisplay` twice would be two chances to leak
  // a raw `post.status` into a component.
  const displayPosts = posts.map(forDisplay)
  const buckets = bucketWeek(displayPosts, now)

  const weekIds = new Set(buckets.days.flatMap((day) => day.posts.map((post) => post.id)))
  const draftedThisWeek = posts.filter(
    (post) => post.origin === 'plan_week' && weekIds.has(post.id),
  )

  return (
    /* ── ONE RHYTHM BETWEEN REGIONS, AND IT IS NOW A STEP ABOVE THE ONE
       INSIDE THEM ──────────────────────────────────────────────────────────
       This page ran 20 outside a card and 20 inside it, and the note that set
       it said so deliberately: the separation was left to the card's ring. With
       ONE card language across all nine regions (see `home/section.tsx`) that
       no longer holds — every block now wears the same ring, so the ring can no
       longer be what tells the reader where a group ends. The gap has to.

       24 outside, 20 inside. Both are on docs/37 §4's ladder, and the step
       between them is what makes the page read as regions rather than as a run
       of identical boxes. It drops back to 20 below `narrow`, where 24 is a
       whole extra scroll across nine blocks and the phone has no columns for
       the gap to separate anyway. */
    <div className="space-y-6 max-narrow:space-y-5">
      {/* ── THE FOUR QUESTIONS, IN ORDER (SPECIFICATION.md §1) ──────────────
          what happened · what is happening · what needs me · what next.

          The order is the design. Leading with the week strip, as this page
          used to, answers "what is scheduled" — a question nobody opened the
          app to ask — and pushes the queue below the fold. */}

      {/* The header. Carries the page's ONE primary action, which this screen
          previously did not have at all: it was a dashboard you could only
          read. No band behind it any more — see the component. */}
      <GreetingBanner greeting={greetingFor(now, zone)} state={greetingState(counts, publish)} />

      {/* Renders nothing once the three doors are done. Not staggered: it is
          the greeting's second line, not a region arriving. */}
      <SetupStrip ladder={ladder} />

      {/* ── FOUR NUMBERS AS ONE BOARD, NOT FOUR BOXES ─────────────────────
          All four are counts of rows this product owns or a ledger balance, so
          the board is full on day one with nothing connected — which is the
          whole reason /home could not have a KPI row before. It is now a single
          divided card rather than four ringed ones: see `StatStrip`'s `board`
          for the argument, which is that thirteen separate boxes down one page
          is most of what made this screen read as assembled parts. */}
      <StaggerItem i={0}>
        <AtAGlance
          posts={displayPosts}
          buckets={buckets}
          publish={publish}
          balance={balance}
          /* From the fifty ledger rows the activity feed already holds: the
             one series every workspace can draw on day one, at no extra read.
             An unreadable ledger is an empty list, and the cell keeps its
             figure without a line — a chart is never drawn from a read that
             did not answer. */
          history={ledger.unreadable ? [] : balanceSeries(ledger.entries, now)}
        />
      </StaggerItem>

      {/* ── WHAT NEEDS ME — FULL WIDTH, AND THAT IS THE RESTRUCTURE ───────
          This is the question somebody actually opened the app to ask, and it
          was rendered inside the 1fr column of a 1fr/380 split — so the page's
          lead had 68% of the page's width, with the Brand Brain card level with
          it competing for the same eye. It leads across the whole width now,
          and its own grid opens to three columns when three or more things are
          waiting, which is the shape a queue should have and could not take at
          870px. */}
      <StaggerItem i={1}>
        <NeedsAttention posts={displayPosts} />
      </StaggerItem>

      {/* `split--wide` — 1fr / 380px, not the 280px this page used. The rail
          holds four cards; at 280px the connection tiles wrapped to one per
          row and the stack read as a leftovers column.

          WHAT IS IN EACH SIDE CHANGED with the queue's promotion. Left is now
          purely the REPORT — the measured series, in one reading column, so
          somebody scrolling to ask "how is it going" gets four things in a row
          that answer that and nothing else. Right is the SOURCES: what
          happened, what Sahoda knows, what it can post to, and what it drafted.
          That is the "what next" question, and it belongs beside the report
          rather than interleaved with it. */}
      <div className="grid grid-cols-[minmax(0,1fr)_380px] items-start gap-6 max-wide:grid-cols-1 max-narrow:gap-5">
        <div className="flex min-w-0 flex-col gap-6 max-narrow:gap-5">
          {/* WHAT IS HAPPENING. This page had no metric container at all — not
              an empty one, none. Its four slots stay unmeasured until something
              is connected, which is the honest answer; showing nothing left the
              reader unable to tell "we measured nothing" from "this product
              does not measure". */}
          <StaggerItem i={2}>
            {/* `reasonStated` while the ladder above already says "Connect a
                channel": the card keeps its four named slots and drops the
                second copy of the remedy. */}
            <PerformanceStrip analytics={instagram} reasonStated={channelStated} />
          </StaggerItem>

          <StaggerItem i={3}>
            <SpendCard spend={spend} />
          </StaggerItem>

          {/* Instagram's own series: the strip carries the headline numbers,
              this carries the one real chart a platform reported. */}
          <StaggerItem i={4}>
            <InstagramInsights analytics={instagram} />
          </StaggerItem>

          <StaggerItem i={5}>
            <WeekStrip buckets={buckets} variantStates={variantStates} />
          </StaggerItem>
        </div>

        {/* ── THE RAIL: TWO COLUMNS IN THE MIDDLE BAND ─────────────────────
            Below `wide` the split collapses and the rail stacks under the
            report. MEASURED 2026-09-06 at 1024 and 768: four 380px-designed
            cards stretched to ~900px, one holding a single sentence, and the
            page ran 2,014px. Two columns from `narrow` up, back to one at
            `wide` where the rail is a rail again. */}
        <div className="grid grid-cols-1 items-start gap-6 narrow:grid-cols-2 wide:grid-cols-1 max-narrow:gap-5">
          {/* ── WHAT NEXT BEFORE WHAT HAPPENED, UNTIL SETUP IS DONE ───────────
              The reference puts the activity feed at the top of the rail, and
              for a workspace that is set up it belongs there: the ledger is
              the money. A workspace still missing a channel or a brain opens
              the app to finish setting up, so its rail leads with the two
              cards that are doors — Connections, then Brand Brain — and the
              feed follows. One order per state, decided by the same ladder
              that renders the strip above. */}
          {/* ── RIGHT NOW: what Sahoda is doing, in plain words, refreshed while
              the page is open. First render is the server's, from the rows
              this page already read; the client polls the same reads. */}
          <StaggerItem i={5}>
            <LiveConsole
              initial={liveLines({
                posts: displayPosts.map((post) => ({
                  id: post.id,
                  title: post.title,
                  intent: post.intent,
                  updated_at: post.updated_at,
                  scheduled_at: post.scheduled_at,
                  origin: post.origin,
                })),
                ledger: ledger.unreadable ? [] : ledger.entries,
                sweepRanAt,
                now,
              })}
              readAt={now.toISOString()}
            />
          </StaggerItem>
          {ladder.remaining > 0 ? (
            <>
              <StaggerItem i={6}>
                <ConnectionsCard connections={connections} />
              </StaggerItem>
              <StaggerItem i={7}>
                <BrainCard brain={brain} knowledgeDocuments={knowledgeDocuments} />
              </StaggerItem>
              <StaggerItem i={8}>
                <HomeSection
                  id="home-activity"
                  title="What happened"
                  action={{ href: '/wallet', label: 'View all' }}
                  flush
                >
                  <ActivityFeed
                    entries={ledger.entries.slice(0, 4)}
                    unreadable={ledger.unreadable}
                  />
                </HomeSection>
              </StaggerItem>
            </>
          ) : (
            <>
              {/* 1 — WHAT HAPPENED. The reference puts the activity feed at
                  the top of the rail; this app had it as a full-width table at
                  the very bottom, which is the least-read position on the page. */}
              <StaggerItem i={6}>
                {/* `flush`: the feed's rows run to the card's own edge, so the
                    body may not carry the standard 20px inset. The header still
                    does, so this heading sits on the same line as every other
                    card's. */}
                <HomeSection
                  id="home-activity"
                  title="What happened"
                  action={{ href: '/wallet', label: 'View all' }}
                  flush
                >
                  <ActivityFeed
                    entries={ledger.entries.slice(0, 4)}
                    unreadable={ledger.unreadable}
                  />
                </HomeSection>
              </StaggerItem>
              {/* WHAT NEXT: what Sahoda knows, and what it can post to. */}
              <StaggerItem i={7}>
                <BrainCard brain={brain} knowledgeDocuments={knowledgeDocuments} />
              </StaggerItem>
              <StaggerItem i={8}>
                <ConnectionsCard connections={connections} />
              </StaggerItem>
            </>
          )}

          <StaggerItem i={9}>
            <SahodaRail drafted={draftedThisWeek} planCost={creditCost('loop_cycle')} />
          </StaggerItem>
        </div>
      </div>

      {/* Last child, and a closed `<dialog>` is `display: none`, so the
          `space-y-5` above it costs nothing while it is shut. Open, it is in the
          browser's top layer and no ancestor's spacing reaches it at all. */}
      {offer}
    </div>
  )
}
