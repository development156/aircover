import Link from 'next/link'
import { creditCost } from '@sahoda/shared'

import { FirstRun } from '@/components/home/first-run'
import { GetStarted } from '@/components/home/get-started'
import { GreetingBanner } from '@/components/home/greeting-banner'
import { NeedsAttention } from '@/components/home/needs-attention'
import { BrainCard, ConnectionsCard } from '@/components/home/rail-cards'
import { countIndexedDocuments } from '@/lib/knowledge/store'
import { InstagramInsights } from '@/components/home/instagram-insights'
import { PerformanceStrip } from '@/components/analytics/performance-strip'
import { SahodaRail } from '@/components/home/sahoda-rail'
import { SpendCard } from '@/components/home/spend-card'
import { WeekStrip } from '@/components/home/week-strip'
import { Card, CardLabel } from '@/components/ui/card'
import { StaggerItem } from '@/components/motion/stagger'
import { Unreadable } from '@/components/design-system/absence-row'
import { ActivityFeed } from '@/components/home/activity-feed'
import { readInstagramAnalytics } from '@/lib/analytics/account-insights'
import { readBrain } from '@/lib/brand/read-brain'
import { listConnections } from '@/lib/connections/read'
import { greetingFor, greetingState } from '@/lib/home/greeting'
import { readPostCounts } from '@/lib/home/posts'
import { readPublishSummary } from '@/lib/home/publishing'
import { readSpend } from '@/lib/home/spend'
import { startSteps, workspaceHasStarted, type StartedSignals } from '@/lib/home/started'
import { bucketWeek } from '@/lib/planner/week'
import { forDisplay } from '@/lib/posts/display-post'
import { listPosts, listVariantStates } from '@/lib/posts/read'
import { readBalance, readLedger } from '@/lib/wallet/read'

export const metadata = { title: 'Home' }

/**
 * Home.
 *
 * DESIGNED FOR EMPTY FIRST. Most workspaces have no publish logs, a handful of
 * spend rows and nothing from Sahoda, so that is the state this page is built
 * around — sparse with intent, not a full dashboard degrading into zeroes. A
 * grid of zero-value cards reads broken; a short page with one clear thing to
 * press reads calm, and it is what a new workspace honestly is.
 *
 * The layout is deliberately ASYMMETRIC: a display-size greeting, the week strip
 * full-bleed as the hero, a 2-column split, then a dense table. The density
 * contrast — a lot of air above, tight rows below — is what stops it reading as
 * a grid of equal cards.
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
 * above it is a report, and a report can wait for a scroll.
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
  ] = await Promise.all([
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
  ])

  // No workspace ⇒ no wallet, no posts, no credits, and nothing on this page can
  // be pressed to fix that. Every read above already short-circuits on a null
  // workspace WITHOUT touching the database, so this branch costs nothing and the
  // dashboard is replaced rather than rendered empty. See FirstRun for why.
  if (balance.status === 'no-workspace') return <FirstRun now={now} />

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
  if (!workspaceHasStarted(signals)) {
    return <GetStarted now={now} steps={startSteps()} />
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
    <div className="space-y-4">
      {/* ── THE FOUR QUESTIONS, IN ORDER (SPECIFICATION.md §1) ──────────────
          what happened · what is happening · what needs me · what next.

          The order is the design. Leading with the week strip, as this page
          used to, answers "what is scheduled" — a question nobody opened the
          app to ask — and pushes the queue below the fold. */}

      {/* The banner. Carries the page's ONE primary action, which this screen
          previously did not have at all: it was a dashboard you could only
          read. */}
      <GreetingBanner greeting={greetingFor(now)} state={greetingState(counts, publish)} />

      {/* `split--wide` — 1fr / 380px, not the 280px this page used. The rail
          holds three cards; at 280px the connection tiles wrapped to one per
          row and the stack read as a leftovers column. */}
      <div className="grid grid-cols-[minmax(0,1fr)_380px] items-start gap-4 max-wide:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-4">
          {/* WHAT NEEDS ME — the lead. See the header note: this is the question
              someone actually opened the app to ask, and it used to sit fourth,
              below two charts and a spend card. */}
          <StaggerItem i={0}>
            <NeedsAttention posts={displayPosts} />
          </StaggerItem>

          {/* WHAT IS HAPPENING. This page had no metric container at all — not
              an empty one, none. Its four slots stay unmeasured until something
              is connected, which is the honest answer; showing nothing left the
              reader unable to tell "we measured nothing" from "this product
              does not measure". */}
          <StaggerItem i={1}>
            <PerformanceStrip analytics={instagram} />
          </StaggerItem>

          {/* Instagram's own series sits below the strip: the strip carries the
              headline numbers, this carries the one real chart. */}
          <StaggerItem i={2}>
            <InstagramInsights analytics={instagram} />
          </StaggerItem>

          <StaggerItem i={3}>
            <SpendCard spend={spend} />
          </StaggerItem>

          <StaggerItem i={4}>
            <WeekStrip buckets={buckets} variantStates={variantStates} />
          </StaggerItem>
        </div>

        <div className="flex flex-col gap-4">
          {/* 1 — WHAT HAPPENED. The reference puts the activity feed at the
                  top of the rail; this app had it as a full-width table at the
                  very bottom, which is the least-read position on the page. */}
          {/* WHAT HAPPENED. */}
          <StaggerItem i={5}>
            <section className="surface-ring rounded-card bg-surface">
              <header className="flex min-h-[46px] items-center gap-3 border-b border-line-soft px-4 py-3">
                <h2 className="type-h3">Recent activity</h2>
                <Link
                  href="/wallet"
                  className="card-link ml-auto type-meta font-[550] text-muted hover:text-accent"
                >
                  View all
                </Link>
              </header>
              <ActivityFeed entries={ledger.entries.slice(0, 4)} />
            </section>
          </StaggerItem>

          {/* The balance, DEMOTED. It was `type-display` with a brand shadow —
              the second hero docs/27 §1 found — while the identical figure was
              already rendering in the topbar chip and the rail foot. Third copy,
              biggest type. It is now a `type-h2` stat: still readable at a
              glance, no longer competing with the greeting for the fold.

              It does NOT count up. Authoritative live balance, docs/26 §8.1,
              enforced by count-up.guard.test.ts. */}
          <StaggerItem i={6}>
            <Card>
              <CardLabel>Available credits</CardLabel>
              <p className="type-h2 num mt-1 text-ink">
                {balance.status === 'ok' ? (
                  balance.balance.available.toLocaleString('en-IN')
                ) : (
                  <Unreadable what="Your credit balance" />
                )}
              </p>
              <p className="mt-1 type-sm text-muted">
                {balance.status === 'ok' && balance.balance.held > 0
                  ? `${balance.balance.held} held by actions in progress`
                  : 'credits to spend'}
              </p>
            </Card>
          </StaggerItem>

          {/* WHAT NEXT: what Sahoda knows, and what it can post to. */}
          <StaggerItem i={7}>
            <BrainCard brain={brain} knowledgeDocuments={knowledgeDocuments} />
          </StaggerItem>
          <StaggerItem i={8}>
            <ConnectionsCard connections={connections} />
          </StaggerItem>

          <StaggerItem i={9}>
            <Card>
              <SahodaRail drafted={draftedThisWeek} planCost={creditCost('loop_cycle')} />
            </Card>
          </StaggerItem>
        </div>
      </div>
    </div>
  )
}
