import { creditCost } from '@sahoda/shared'

import { SahodaRail } from '@/components/home/sahoda-rail'
import { SpendArea } from '@/components/home/spend-area'
import { SpendBars } from '@/components/home/spend-bars'
import { WeekStrip } from '@/components/home/week-strip'
import { Card, CardLabel } from '@/components/ui/card'
import { LedgerTable } from '@/components/wallet/ledger-table'
import { greetingFor, greetingState } from '@/lib/home/greeting'
import { readPostCounts } from '@/lib/home/posts'
import { readPublishSummary } from '@/lib/home/publishing'
import { readSpend } from '@/lib/home/spend'
import { bucketWeek } from '@/lib/planner/week'
import { listPosts, listPublishModes } from '@/lib/posts/read'
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
 * Every number comes from a table. No placeholder figures, no seeded demo
 * values, and nothing about engagement, reach or followers — none of which this
 * product records.
 */
export default async function HomePage() {
  const now = new Date()

  const [posts, spend, counts, publish, balance, ledger] = await Promise.all([
    listPosts(),
    readSpend(now),
    readPostCounts(),
    readPublishSummary(now),
    readBalance(),
    readLedger(),
  ])

  // Publish modes decide `.is-real` on the strip. Fails safe to an empty map, in
  // which case a published post renders committed rather than claiming it went
  // out live.
  const modes = await listPublishModes(posts.map((post) => post.id))
  const buckets = bucketWeek(posts, now)

  const weekIds = new Set(buckets.days.flatMap((day) => day.posts.map((post) => post.id)))
  const draftedThisWeek = posts.filter(
    (post) => post.origin === 'plan_week' && weekIds.has(post.id),
  )

  return (
    <div className="space-y-8">
      {/* 1 — Greeting. Display size, then one sentence of real state. */}
      <header className="space-y-1">
        <h1 className="type-display">{greetingFor(now)}</h1>
        <p className="text-[15px] text-ink-mute">{greetingState(counts, publish)}</p>
      </header>

      {/* 2 — The week. Full width, the hero, readable without reading. */}
      <WeekStrip buckets={buckets} modes={modes} />

      {/* 3 — Asymmetric split: the chart gets the room, the rail gets the money.
              Collapses to one column below the wide breakpoint. */}
      <div className="grid grid-cols-[1fr_var(--rail-w)] gap-grid max-wide:grid-cols-1">
        <Card className="space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <CardLabel>Credits spent · last 30 days</CardLabel>
            <span className="num text-[13px] font-semibold">{spend.total}</span>
          </div>
          <SpendArea spend={spend} />
          <SpendBars spend={spend} />
        </Card>

        <div className="space-y-grid">
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
