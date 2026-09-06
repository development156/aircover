import { CalendarClock, Coins, Inbox, Send } from 'lucide-react'

import { MiniBars, Sparkline } from '@/components/charts/sparkline'
import { StatCard, StatStrip, type StatAbsence } from '@/components/charts/stat-card'
import type { BalanceDay } from '@/lib/home/balance-history'
import { needsAPerson } from '@/lib/approvals/queue'
import type { DisplayPost } from '@/lib/posts/display-post'
import type { WeekBuckets } from '@/lib/planner/week'
import type { PublishSummary } from '@/lib/home/publishing'
import type { BalanceRead } from '@/lib/wallet/read'
import type { PostStatus } from '@sahoda/shared'

/** What "scheduled" means on this board: a commitment, not a date on a draft. */
const COMMITTED: ReadonlySet<PostStatus> = new Set<PostStatus>([
  'approved',
  'scheduled',
  'publishing',
])

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
 *   Scheduled        COMMITTED posts (approved, scheduled, publishing) in the
 *                    rolling 7-day window, out of `bucketWeek`. A dated draft
 *                    or a post in review is counted one cell to the left.
 *   Published        SUCCEEDED LIVE publishes. Not `attempts`, not
 *                    `succeeded` — `live`, because a fixture run succeeded at
 *                    simulating and published nothing.
 *   Credits left     the wallet balance, which is a real number the moment a
 *                    workspace exists.
 *
 * So the strip is fillable on day one, with no channel connected and no post
 * published — which is the state the founder's screenshot is in. Nothing here
 * can render an absence mark for a reason a customer has to fix; the only
 * absence any of these can take is `unreadable`, and that means a query threw.
 *
 * ── AND THE CREDIT BALANCE IS NOW ON THIS SCREEN TWICE, DOWN FROM THREE ──────
 * docs/40 §2.3 counted it three times on one page — the topbar chip, the rail
 * foot, and an `Available credits` card in the right column. That card is gone
 * and this slot replaces it, so the count goes to two; and the rail foot's copy
 * is hidden whenever the rail is minimised, which is now the default. At the
 * width the founder is looking at, the number appears in the topbar and here.
 *
 * ── WHY EACH CARD IS A LINK ──────────────────────────────────────────────────
 * A number you cannot act on is a report. Every one of these has exactly one
 * place to go and it is the place that number came from, so the whole card is
 * the target rather than a "View all" link beside it competing for the eye.
 */
/** "Mon 7", for the bars' accessible sentence. Read in the zone the buckets were keyed in. */
const DAY_CACHE = new Map<string, Intl.DateTimeFormat>()

function dayLabel(zone: string, at: Date): string {
  let f = DAY_CACHE.get(zone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-IN', { timeZone: zone, weekday: 'short' })
    DAY_CACHE.set(zone, f)
  }
  return f.format(at)
}

export function AtAGlance({
  posts,
  buckets,
  publish,
  balance,
  history = [],
  zone,
}: {
  posts: readonly DisplayPost[]
  buckets: WeekBuckets
  /** The workspace's zone: the one `buckets` were keyed in. */
  zone: string
  publish: PublishSummary
  balance: BalanceRead
  /**
   * The wallet's total, day by day, from `balanceSeries`. Drawn under the
   * credits figure as the one line every workspace can show from day one —
   * see `lib/home/balance-history.ts` for why it is the ledger's own column
   * and costs no query. Optional so a caller without a ledger read still gets
   * the four numbers.
   */
  history?: readonly BalanceDay[]
}) {
  const waiting = posts.filter((post) => needsAPerson(post)).length
  // COMMITTED intents only — the same three the certainty ladder draws as
  // solid. MEASURED 2026-09-06: a post in review, dated tomorrow, counted here
  // as "Scheduled · 1 post" while the week strip beneath drew it as a neutral
  // outline. A dated draft or a post still in review is waiting on a person,
  // and the cell to the left already counts it; counting it here too claimed
  // a commitment nobody had made.
  const perDay = buckets.days.map(
    (day) => day.posts.filter((post) => COMMITTED.has(post.intent)).length,
  )
  const scheduled = perDay.reduce((n, count) => n + count, 0)

  // ── THE TWO SHAPES A STAT CELL CAN CARRY WITHOUT INVENTING A POINT ───────
  // Credits: the ledger's `balance_after` at the end of each of the last
  // thirty days, which exists for every workspace from its welcome grant on.
  // Scheduled: one bar per day of the week ahead, committed posts only. Both
  // are counts of rows this product owns, which is the board's whole premise.
  const measured = history.filter((d): d is BalanceDay & { total: number } => d.total !== null)
  const first = measured[0]?.total
  const lastTotal = measured[measured.length - 1]?.total
  const balanceChart =
    measured.length > 1 && first !== undefined && lastTotal !== undefined ? (
      <Sparkline
        values={history.map((d) => d.total)}
        label={`Credits over the last ${history.length} days, from ${first.toLocaleString('en-IN')} to ${lastTotal.toLocaleString('en-IN')}.`}
      />
    ) : undefined
  const weekChart =
    buckets.days.length > 0 ? (
      <MiniBars
        values={perDay}
        emphasis={0}
        label={
          scheduled === 0
            ? 'Nothing ready to go in the next 7 days.'
            : `Posts ready to go, by day: ${buckets.days
                .map((day, i) => `${dayLabel(zone, day.date)} ${perDay[i]}`)
                .join(', ')}.`
        }
      />
    ) : undefined

  // A read that THREW is `unreadable`, and it is the only absence these four
  // can take. `empty` is a successful read of nothing, which is a real zero and
  // is knowledge — the rule CreditChip and SpendCard already state.
  const publishAbsent: StatAbsence | undefined =
    publish.status === 'unreadable' ? 'unreadable' : undefined

  return (
    <StatStrip board>
      <StatCard
        variant="cell"
        /* ── THE ONE CELL THAT ASKS FOR A DECISION WEARS THE WASH ───────────
           docs/37 §16: what needs the reader leads. Four identical cells gave
           "Waiting on you · 3" the same weight as "Published · 0"; the wash is
           the same treatment the week strip gives today, and it is spent only
           while there is something to decide. Nothing else on the board is
           tinted, so the eye lands here first and nowhere else. */
        /* `--brand-wash` is a 6% orange OVER whatever is beneath it, and a
           board cell sits on the board's line-coloured ground, not on a card
           — MEASURED 2026-09-06: the bare wash rendered as a grey-brown pane
           beside the week strip's peach. The gradient paints the same wash
           over the cell's own opaque surface, so the two read as one colour. */
        className={
          waiting > 0
            ? 'bg-surface [background-image:linear-gradient(var(--brand-wash),var(--brand-wash))]'
            : undefined
        }
        icon={<Inbox size={15} strokeWidth={1.9} />}
        label="Needs your OK"
        value={waiting}
        unit={waiting === 1 ? 'post' : 'posts'}
        note={waiting === 0 ? 'Nothing to check right now' : 'Check these before they go out'}
        href="/approvals"
      />
      <StatCard
        variant="cell"
        icon={<CalendarClock size={15} strokeWidth={1.9} />}
        label="Going out this week"
        value={scheduled}
        unit={scheduled === 1 ? 'post' : 'posts'}
        note="Ready and set to post in the next 7 days"
        chart={weekChart}
        href="/planner"
      />
      <StatCard
        variant="cell"
        icon={<Send size={15} strokeWidth={1.9} />}
        label="Posted"
        value={publishAbsent ? null : publish.live}
        absent={publishAbsent}
        unit={publish.live === 1 ? 'post' : 'posts'}
        /* `live`, and the note says so. A fixture run is recorded as succeeded
           and published nothing, so a card reading `succeeded` would count
           simulations as reach. `readiness-is-evidence` in LEARNINGS is the
           same lesson from the other end. */
        note="Really went out to your accounts"
        href="/analytics"
      />
      <StatCard
        variant="cell"
        icon={<Coins size={15} strokeWidth={1.9} />}
        label="Credits left"
        value={balance.status === 'ok' ? balance.balance.available : null}
        absent={balance.status === 'ok' ? undefined : 'unreadable'}
        unit="credits"
        note={
          balance.status === 'ok' && balance.balance.held > 0
            ? `${balance.balance.held} held while Sahoda works`
            : 'Use these to write and plan'
        }
        chart={balanceChart}
        href="/wallet"
      />
    </StatStrip>
  )
}
