import { CalendarClock, Inbox, Send, TrendingUp } from 'lucide-react'

import { StatCard, StatStrip, type StatAbsence } from '@/components/charts/stat-card'
import { needsAPerson } from '@/lib/approvals/queue'
import type { DisplayPost } from '@/lib/posts/display-post'
import type { WeekBuckets } from '@/lib/planner/week'
import type { PublishSummary } from '@/lib/home/publishing'
import type { AccountAnalytics } from '@/lib/analytics/account-insights'

/**
 * FOUR NUMBERS THIS PRODUCT CAN ALWAYS PROVE.
 *
 * ── THE PROBLEM THIS SOLVES, AND WHY IT IS NOT "ADD A KPI STRIP" ─────────────
 * The reference opens with five stat cards and this page opened with none —
 * but the reason it had none is the honest one, and it has to survive: every
 * metric /home used to reach for (reach, views, followers) comes from a
 * platform, and a workspace with nothing connected therefore has nothing to
 * put in a stat card. The previous answer was to render the container with
 * four absence marks in it, which is the defect docs/40 and the founder both
 * named.
 *
 * These four are different in kind. Every one is a COUNT OF ROWS THIS PRODUCT
 * OWNS or a ledger balance:
 *
 *   Waiting on you   posts whose intent needs a person — the same predicate
 *                    `NeedsAttention` filters on, so the strip and the card
 *                    below it cannot disagree (SPECIFICATION §7: one
 *                    collection, derived, never a stored count).
 *   Scheduled        posts in the rolling 7-day window, out of `bucketWeek`.
 *   Published        SUCCEEDED LIVE publishes. Not `attempts`, not
 *                    `succeeded` — `live`, because a fixture run succeeded at
 *                    simulating and published nothing.
 *   Reach            the reach a connected account REPORTED. See below.
 *
 * ── THE FOURTH SLOT WAS THE CREDIT BALANCE, AND THE FOUNDER REMOVED IT ───────
 * Founder's ruling: no credits card, metric, chart, balance or progress bar on
 * this screen; credits live in the wallet. The slot now carries Reach, which
 * the same ruling names as its replacement.
 *
 * It is a DIFFERENT KIND of number from the other three and the card says so.
 * The first three are counts of rows this product owns, so they are fillable on
 * day one with nothing connected. Reach comes from a platform, so a workspace
 * with no connected account has no reach — not a zero, an absence. A zero here
 * would claim a measured nothing, which is the one thing this product may never
 * print, so the slot renders the absence mark and its note says which fact it
 * is: nothing connected, or connected and nothing reported yet.
 *
 * NO PERCENTAGE CHANGE. The reference asks for "+12%", and the account read
 * returns a single current value with no prior period beside it — `performance
 * -strip.tsx` states the same thing in its own header: "the insights arrive as
 * single values, not series". A delta computed from one number is a number
 * nothing measured.
 *
 * ── FOUR CARDS, NOT ONE DIVIDED BOARD ───────────────────────────────────────
 * They were one card split by hairline seams, which is the right shape when a
 * row of figures is ONE reading. The founder's reference draws four separate
 * cards and it is the better fit here, because these four are not one reading:
 * each goes to a different screen, and the board's seams said "these belong
 * together" about four numbers whose only relationship is that they are all
 * true. Separate cards also give each one a hover of its own, which a pane
 * inside a shared ring cannot have without drawing a box inside a box.
 *
 * ── WHY EACH CARD IS A LINK ──────────────────────────────────────────────────
 * A number you cannot act on is a report. Every one of these has exactly one
 * place to go and it is the place that number came from, so the whole card is
 * the target rather than a "View all" link beside it competing for the eye.
 */
export function AtAGlance({
  posts,
  buckets,
  publish,
  analytics,
}: {
  posts: readonly DisplayPost[]
  buckets: WeekBuckets
  publish: PublishSummary
  /** The connected account's own figures, or the reason there are none. */
  analytics: AccountAnalytics
}) {
  const waiting = posts.filter((post) => needsAPerson(post.intent)).length
  const scheduled = buckets.days.reduce((n, day) => n + day.posts.length, 0)

  // A read that THREW is `unreadable`, and it is the only absence these four
  // can take. `empty` is a successful read of nothing, which is a real zero and
  // is knowledge — the rule CreditChip and SpendCard already state.
  const publishAbsent: StatAbsence | undefined =
    publish.status === 'unreadable' ? 'unreadable' : undefined

  /**
   * The reach a platform actually reported, or `undefined`. `Reach` is one of
   * the keys the account-insights endpoint returns (`account-insights.ts`'s own
   * INSIGHT_KEYS), so this is a lookup rather than a computation — and when the
   * key is missing from a READY response, that is Instagram not reporting it,
   * which is still an absence and not a zero.
   */
  const reach =
    analytics.kind === 'ready'
      ? analytics.insights.find((i) => i.label === 'Reach')?.value
      : undefined

  /* One sentence per state, never a shared "no data". "You have not connected
     anything" and "we could not reach Instagram" send the reader to two
     different places, and only one of them is their to fix. */
  const reachNote =
    reach !== undefined
      ? 'Reported by your connected account'
      : analytics.kind === 'not-connected'
        ? 'Connect a channel to measure this'
        : analytics.kind === 'ready'
          ? 'Your account has not reported it yet'
          : 'We could not read it just now'

  return (
    <StatStrip>
      <StatCard
        icon={<Inbox size={15} strokeWidth={1.9} />}
        label="Waiting on you"
        value={waiting}
        unit={waiting === 1 ? 'post' : 'posts'}
        note={waiting === 0 ? 'Nothing needs a decision' : 'Approve, edit or send back'}
        href="/approvals"
      />
      <StatCard
        icon={<CalendarClock size={15} strokeWidth={1.9} />}
        label="Scheduled"
        value={scheduled}
        unit={scheduled === 1 ? 'post' : 'posts'}
        note="In the next seven days"
        href="/planner"
      />
      <StatCard
        icon={<Send size={15} strokeWidth={1.9} />}
        label="Published"
        value={publishAbsent ? null : publish.live}
        absent={publishAbsent}
        unit={publish.live === 1 ? 'post' : 'posts'}
        /* `live`, and the note says so. A fixture run is recorded as succeeded
           and published nothing, so a card reading `succeeded` would count
           simulations as reach. `readiness-is-evidence` in LEARNINGS is the
           same lesson from the other end. */
        note="Actually sent to a channel"
        href="/analytics"
      />
      <StatCard
        icon={<TrendingUp size={15} strokeWidth={1.9} />}
        label="Reach"
        value={reach ?? null}
        /* `unmeasured`, never `unreadable`. Nothing threw: there is simply no
           account reporting a figure, and the two are different claims. */
        absent={reach === undefined ? 'unmeasured' : undefined}
        unit={reach === undefined ? undefined : 'people'}
        note={reachNote}
        href="/analytics"
      />
    </StatStrip>
  )
}
