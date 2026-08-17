import Link from 'next/link'

import { Card, CardLabel } from '@/components/ui/card'
import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import { METRIC_LABELS, rankBy, type ComparableRow, type MetricKey } from '@/lib/analytics/compare'

/**
 * Best performing (reference: the 340x206 card beside the channel table).
 *
 * ── WHY THIS ONE COULD BE WIRED AND ITS NEIGHBOUR COULD NOT ──────────────────
 * A ranking needs one number per row RIGHT NOW, which is exactly what the
 * analytics read already returns. `rankBy` was already written and already
 * refuses to rank a row that has no measurement — an unmeasured post sorted to
 * the bottom has been called the worst performer without a zero ever being
 * drawn, which is the refusal `compare.ts` exists for.
 *
 * "Performance over time" needs the SAME metric at SEVERAL POINTS IN TIME, and
 * nothing in this product stores that. See the note on the container beside it.
 *
 * ── WHAT IT WILL NOT DO ──────────────────────────────────────────────────────
 * Rank unmeasured rows, and pad the list to a fixed length. Three real rows are
 * three rows; the reference's card is not filled out with blanks to reach five.
 */
export function BestPerforming({
  rows,
  metric = 'reach',
}: {
  rows: readonly ComparableRow[]
  metric?: MetricKey
}) {
  const ranked = rankBy(rows, metric, 5)

  return (
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <CardLabel className="mb-0">Best performing</CardLabel>
        <span className="text-[11px] text-muted">by {METRIC_LABELS[metric].toLowerCase()}</span>
      </div>

      {ranked.length === 0 ? (
        // NOT "no posts performed well" — that is a claim about the posts. This
        // is a statement about the measurement, which is what we actually know.
        <p className="text-[12.5px] text-muted">
          Nothing has been measured yet, so there is nothing to rank.
        </p>
      ) : (
        <ol className="space-y-2">
          {ranked.map((row, i) => (
            <li key={`${row.postId}-${row.channel}`} className="flex items-baseline gap-2">
              <span className="w-[14px] shrink-0 text-[11px] text-muted tabular-nums">{i + 1}</span>
              <Link
                href={`/posts/${row.postId}`}
                className="min-w-0 flex-1 truncate text-[12.5px] font-[550] transition-micro hover:text-accent"
              >
                {row.title || 'Untitled post'}
              </Link>
              <span className="shrink-0 text-[11px] text-muted">{CHANNEL_LABELS[row.channel]}</span>
              <span className="shrink-0 text-[12.5px] font-[550] tabular-nums">
                {row.value.toLocaleString('en-IN')}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

/**
 * Performance over time — the container, with no series behind it.
 *
 * ── SCHEMA-REQUIRED, AND WHY NOTHING CAN STAND IN ────────────────────────────
 * A trend needs the same metric measured repeatedly. This product measures
 * LIVE: `readPostMetrics` asks Zernio for each post's current numbers on every
 * page load and stores none of them. The only timestamp that IS persisted is
 * `post_publish_logs.published_at`, which says when a post went out — not what
 * it scored a week later.
 *
 * Plotting current lifetime totals against publish dates would produce a line
 * that LOOKS like a trend and is not one: each point would be a different post
 * measured once, at a different age. That is the single most misleading chart
 * this screen could draw, so it draws none.
 *
 * NEEDED: `post_metric_snapshots` (workspace_id, post_id, channel, metric,
 * value, measured_at) written on a schedule, so one metric acquires a history.
 * Migrations apply to production, so this run logs it rather than writing it.
 */
export function PerformanceOverTime() {
  return (
    <Card className="space-y-3">
      <CardLabel className="mb-0">Performance over time</CardLabel>
      <div className="is-proposed grid min-h-[132px] place-items-center rounded-card px-3">
        <p className="max-w-[38ch] text-center text-[12.5px] text-muted">
          Sahoda reads your numbers fresh each time and does not keep a history yet, so there is no
          trend to draw. This is where it will go.
        </p>
      </div>
    </Card>
  )
}
