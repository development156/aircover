import Link from 'next/link'
import { creditCost } from '@sahoda/shared'

import { FirstRun } from '@/components/home/first-run'
import { GreetingBanner } from '@/components/home/greeting-banner'
import { NeedsAttention } from '@/components/home/needs-attention'
import { BrainCard, ConnectionsCard } from '@/components/home/rail-cards'
import { InstagramInsights } from '@/components/home/instagram-insights'
import { SahodaRail } from '@/components/home/sahoda-rail'
import { SpendArea } from '@/components/home/spend-area'
import { SpendBars } from '@/components/home/spend-bars'
import { WeekStrip } from '@/components/home/week-strip'
import { Card, CardLabel } from '@/components/ui/card'
import { ActivityFeed } from '@/components/home/activity-feed'
import { readInstagramAnalytics } from '@/lib/analytics/account-insights'
import { readBrain } from '@/lib/brand/read-brain'
import { listConnections } from '@/lib/connections/read'
import { greetingFor, greetingState } from '@/lib/home/greeting'
import { readPostCounts } from '@/lib/home/posts'
import { readPublishSummary } from '@/lib/home/publishing'
import { readSpend } from '@/lib/home/spend'
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
  const [posts, spend, counts, publish, balance, ledger, instagram, brain, connections] =
    await Promise.all([
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
    ])

  // No workspace ⇒ no wallet, no posts, no credits, and nothing on this page can
  // be pressed to fix that. Every read above already short-circuits on a null
  // workspace WITHOUT touching the database, so this branch costs nothing and the
  // dashboard is replaced rather than rendered empty. See FirstRun for why.
  if (balance.status === 'no-workspace') return <FirstRun now={now} />

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
          {/* 2 — WHAT IS HAPPENING. Instagram first when connected; spend is
                  the only other real series this workspace has. */}
          <InstagramInsights analytics={instagram} />

          <Card className="space-y-4">
            <div className="flex items-baseline justify-between gap-3">
              <CardLabel>Credits spent · last 30 days</CardLabel>
              <span className="num text-[13px] font-semibold">{spend.total}</span>
            </div>
            <SpendArea spend={spend} />
            <SpendBars spend={spend} />
          </Card>

          {/* 3 — WHAT NEEDS ME. The question this page did not answer. */}
          <NeedsAttention posts={displayPosts} />

          {/* 4a — the week, now third in the left column rather than the hero. */}
          <WeekStrip buckets={buckets} variantStates={variantStates} />
        </div>

        <div className="flex flex-col gap-4">
          {/* 1 — WHAT HAPPENED. The reference puts the activity feed at the
                  top of the rail; this app had it as a full-width table at the
                  very bottom, which is the least-read position on the page. */}
          <section className="surface-ring rounded-card bg-surface">
            <header className="flex min-h-[46px] items-center gap-3 border-b border-line-soft px-4 py-3">
              <h2 className="text-[14px] font-semibold tracking-[-0.01em]">Recent activity</h2>
              <Link
                href="/wallet"
                className="ml-auto text-[12px] font-[550] text-muted hover:text-accent"
              >
                View all
              </Link>
            </header>
            <ActivityFeed entries={ledger.entries.slice(0, 4)} />
          </section>

          <Card className="shadow-brand">
            <CardLabel>Available credits</CardLabel>
            <p className="type-display num text-ink">
              {balance.status === 'ok' ? balance.balance.available : '\u2014'}
            </p>
            <p className="mt-1 text-[13px] text-muted">
              {balance.status === 'ok' && balance.balance.held > 0
                ? `${balance.balance.held} held by actions in progress`
                : 'credits to spend'}
            </p>
          </Card>

          {/* 4b — WHAT NEXT: what Sahoda knows, and what it can post to. */}
          <BrainCard brain={brain} />
          <ConnectionsCard connections={connections} />

          <Card>
            <SahodaRail drafted={draftedThisWeek} planCost={creditCost('loop_cycle')} />
          </Card>
        </div>
      </div>
    </div>
  )
}
