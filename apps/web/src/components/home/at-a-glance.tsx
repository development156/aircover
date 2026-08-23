import { StatCard, StatStrip, type StatAbsence } from '@/components/charts/stat-card'
import { needsAPerson } from '@/lib/approvals/queue'
import type { DisplayPost } from '@/lib/posts/display-post'
import type { WeekBuckets } from '@/lib/planner/week'
import type { PublishSummary } from '@/lib/home/publishing'
import type { BalanceRead } from '@/lib/wallet/read'

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
export function AtAGlance({
  posts,
  buckets,
  publish,
  balance,
}: {
  posts: readonly DisplayPost[]
  buckets: WeekBuckets
  publish: PublishSummary
  balance: BalanceRead
}) {
  const waiting = posts.filter((post) => needsAPerson(post.intent)).length
  const scheduled = buckets.days.reduce((n, day) => n + day.posts.length, 0)

  // A read that THREW is `unreadable`, and it is the only absence these four
  // can take. `empty` is a successful read of nothing, which is a real zero and
  // is knowledge — the rule CreditChip and SpendCard already state.
  const publishAbsent: StatAbsence | undefined =
    publish.status === 'unreadable' ? 'unreadable' : undefined

  return (
    <StatStrip>
      <StatCard
        label="Waiting on you"
        value={waiting}
        unit={waiting === 1 ? 'post' : 'posts'}
        note={waiting === 0 ? 'Nothing needs a decision' : 'Approve, edit or send back'}
        href="/approvals"
      />
      <StatCard
        label="Scheduled"
        value={scheduled}
        unit={scheduled === 1 ? 'post' : 'posts'}
        note="In the next seven days"
        href="/planner"
      />
      <StatCard
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
        label="Credits left"
        value={balance.status === 'ok' ? balance.balance.available : null}
        absent={balance.status === 'ok' ? undefined : 'unreadable'}
        unit="credits"
        note={
          balance.status === 'ok' && balance.balance.held > 0
            ? `${balance.balance.held} held by actions in progress`
            : 'To spend on drafts and plans'
        }
        href="/wallet"
      />
    </StatStrip>
  )
}
