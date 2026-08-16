import { creditCost } from '@sahoda/shared'

import { FirstRun } from '@/components/home/first-run'
import { InstagramInsights } from '@/components/home/instagram-insights'
import { SahodaRail } from '@/components/home/sahoda-rail'
import { SpendArea } from '@/components/home/spend-area'
import { SpendBars } from '@/components/home/spend-bars'
import { WeekStrip } from '@/components/home/week-strip'
import { Card, CardLabel } from '@/components/ui/card'
import { LedgerTable } from '@/components/wallet/ledger-table'
import { readInstagramAnalytics } from '@/lib/analytics/account-insights'
import { greetingFor, greetingState } from '@/lib/home/greeting'
import { readPostCounts } from '@/lib/home/posts'
import { readPublishSummary } from '@/lib/home/publishing'
import { readSpend } from '@/lib/home/spend'
import { bucketWeek } from '@/lib/planner/week'
import { forDisplay } from '@/lib/posts/display-post'
import { listPosts, listVariantStates } from '@/lib/posts/read'
import { HISTORY_LIMIT, readBalance, readLedger } from '@/lib/wallet/read'

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

  const [posts, spend, counts, publish, balance, ledger, instagram] = await Promise.all([
    listPosts(),
    readSpend(now),
    readPostCounts(),
    readPublishSummary(now),
    readBalance(),
    readLedger(),
    // Degrades to a named state — never throws, never zeroes. A dead Zernio must
    // not take Home down with it.
    readInstagramAnalytics(now),
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
  const buckets = bucketWeek(posts.map(forDisplay), now)

  const weekIds = new Set(buckets.days.flatMap((day) => day.posts.map((post) => post.id)))
  const draftedThisWeek = posts.filter(
    (post) => post.origin === 'plan_week' && weekIds.has(post.id),
  )

  return (
    <div className="space-y-8">
      {/* 1 — Greeting, then one sentence of real state.
              The kit's `.greet__t` / `.greet__s`: 20px at 650, and the state
              line in ACCENT rather than muted. That colour is doing work — the
              sentence below a greeting is the only line on the page that says
              what changed since you last looked, and muting it buries the one
              thing the screen exists to tell you. */}
      <header>
        <h1 className="text-[20px] leading-7 font-[650] tracking-[-0.02em]">{greetingFor(now)}</h1>
        <p className="mt-[1px] text-[13px] font-[550] text-accent">
          {greetingState(counts, publish)}
        </p>
      </header>

      {/* 2 — The week. Full width, the hero, readable without reading. */}
      <WeekStrip buckets={buckets} variantStates={variantStates} />

      {/* 3 — Asymmetric split: the chart gets the room, the rail gets the money.
              Collapses to one column below the wide breakpoint. */}
      {/* `items-start` is load-bearing: a grid stretches its items by default,
          so the chart card was growing to match the combined height of the
          three cards beside it and rendering ~250px of empty surface under a
          one-line chart. */}
      <div className="grid grid-cols-[1fr_var(--rail-w)] items-start gap-grid max-wide:grid-cols-1">
        <Card className="space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <CardLabel>Credits spent · last 30 days</CardLabel>
            <span className="num text-[13px] font-semibold">{spend.total}</span>
          </div>
          <SpendArea spend={spend} />
          <SpendBars spend={spend} />
        </Card>

        <div className="space-y-grid">
          {/* In the rail, under the money: it is a status read, not the page's
              subject. Renders nothing when Instagram is not connected. */}
          <InstagramInsights analytics={instagram} />

          <Card className="shadow-brand">
            <CardLabel>Available credits</CardLabel>
            <p className="type-display num text-ink">
              {balance.status === 'ok' ? balance.balance.available : '—'}
            </p>
            <p className="mt-1 text-[13px] text-muted">
              {balance.status === 'ok' && balance.balance.held > 0
                ? `${balance.balance.held} held by actions in progress`
                : 'credits to spend'}
            </p>
          </Card>

          <Card>
            <SahodaRail drafted={draftedThisWeek} planCost={creditCost('loop_cycle')} />
          </Card>
        </div>
      </div>

      {/* 4 — Dense activity. Tight hairline rows, after all that air. */}
      <section className="space-y-3">
        <CardLabel>Recent activity</CardLabel>
        <LedgerTable entries={ledger.entries} skipped={ledger.skipped} limit={HISTORY_LIMIT} />
      </section>
    </div>
  )
}
