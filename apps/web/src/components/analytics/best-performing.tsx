import { CardEmpty } from '@/components/empty-state'
import Link from 'next/link'

import { Panel } from '@/components/charts/panel'
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
 * "Performance over time" needs the SAME metric at SEVERAL POINTS IN TIME, which
 * nothing stored until `post_metric_snapshots` (migration 20260819000100). It now
 * lives in its own file — `performance-over-time.tsx` — and draws nothing until
 * that history exists.
 *
 * ── WHAT IT WILL NOT DO ──────────────────────────────────────────────────────
 * Rank unmeasured rows, and pad the list to a fixed length. Three real rows are
 * three rows; the reference's card is not filled out with blanks to reach five.
 */
export function BestPerforming({
  rows,
  metric = 'reach',
  reasonStated = false,
}: {
  rows: readonly ComparableRow[]
  metric?: MetricKey
  /** See `PerformanceStrip`. The page said it once; this card does not repeat it. */
  reasonStated?: boolean
}) {
  const ranked = rankBy(rows, metric, 5)

  return (
    <Panel className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="type-h3 text-ink">Best performing</h2>
        <span className="type-meta text-muted">by {METRIC_LABELS[metric].toLowerCase()}</span>
      </div>

      {ranked.length === 0 ? (
        // NOT "no posts performed well" — that is a claim about the posts. This
        // is a statement about the measurement, which is what we actually know.
        // The CLAIM is unchanged; only the treatment moved, to the one language
        // every empty card on this page now speaks (docs/26 §4.1).
        <CardEmpty
          body={
            reasonStated
              ? // The page's line already carries the cause and the remedy. What is
                // left that only this card knows is that a RANKING specifically has
                // no input — a narrower claim, and the only part worth a sentence.
                'No ranking yet.'
              : 'Nothing has been measured yet, so there is nothing to rank.'
          }
        />
      ) : (
        <ol className="space-y-2">
          {ranked.map((row, i) => (
            <li key={`${row.postId}-${row.channel}`} className="flex items-baseline gap-2">
              <span className="w-[14px] shrink-0 type-meta text-muted tabular-nums">{i + 1}</span>
              <Link
                href={`/posts/${row.postId}`}
                className="min-w-0 flex-1 truncate type-meta font-[550] transition-micro hover:text-accent"
              >
                {row.title || 'Untitled post'}
              </Link>
              <span className="shrink-0 type-meta text-muted">{CHANNEL_LABELS[row.channel]}</span>
              <span className="shrink-0 type-meta font-[550] tabular-nums">
                {row.value.toLocaleString('en-IN')}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}
