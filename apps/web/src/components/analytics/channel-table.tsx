import { Card, CardLabel } from '@/components/ui/card'
import { CoverageLine, TotalFigure } from '@/components/analytics/figure'
import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import { byChannel, coverageFor, totalFor, type ComparableRow } from '@/lib/analytics/compare'

/**
 * Channel against channel — the "which one is working" table.
 *
 * ── THE COMPARISON THIS TABLE HAS TO SURVIVE ─────────────────────────────────
 * Two channels side by side invite being read as like-for-like, and they usually are
 * not. In the live workspace on 2026-08-11, Instagram had five published channels
 * reporting and LinkedIn had one — so LinkedIn's 61 impressions against Instagram's
 * 8 is a true pair of numbers and a false comparison.
 *
 * Every figure therefore carries its own coverage (see `TotalFigure`), and the
 * bottom line states the whole table's. Neither is optional, because a number in a
 * comparison table is read AS a comparison whether or not it was offered as one.
 *
 * There is deliberately no "share of total" column. `shareOfMeasured` will compute
 * one, but only when every row in scope reported — which on a table of mixed
 * coverage is exactly when it is least likely to hold. A column that is empty most
 * of the time is worse than a column that is not there.
 */

const METRICS = [
  { key: 'impressions', label: 'Impressions' },
  { key: 'reach', label: 'Reach' },
  { key: 'engagement', label: 'Engagement' },
] as const

export function ChannelTable({ rows }: { rows: readonly ComparableRow[] }) {
  if (rows.length === 0) return null

  // Ordered by impressions, with unreported channels after the reported ones —
  // `null` is not "less than", so it is not sorted as though it were.
  const rollups = [...byChannel(rows, 'impressions')].sort((a, b) => {
    if (a.total === null && b.total === null) return a.channel.localeCompare(b.channel)
    if (a.total === null) return 1
    if (b.total === null) return -1
    return b.total.value - a.total.value
  })

  return (
    <Card className="space-y-3">
      <CardLabel>By channel</CardLabel>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line text-left">
              <th scope="col" className="py-2 pr-4 font-semibold text-muted">
                Channel
              </th>
              {METRICS.map((metric) => (
                <th
                  key={metric.key}
                  scope="col"
                  className="py-2 pr-4 text-right font-semibold text-muted"
                >
                  {metric.label}
                </th>
              ))}
              <th scope="col" className="py-2 text-right font-semibold text-muted">
                Posts
              </th>
            </tr>
          </thead>
          <tbody>
            {rollups.map((rollup) => (
              <tr key={rollup.channel} className="border-b border-line last:border-0">
                <th scope="row" className="py-2 pr-4 text-left font-medium text-ink">
                  {CHANNEL_LABELS[rollup.channel]}
                </th>
                {METRICS.map((metric) => (
                  <td key={metric.key} className="py-2 pr-4 text-right">
                    <TotalFigure total={totalFor(rollup.rows, metric.key)} noun="posts" />
                  </td>
                ))}
                <td className="py-2 text-right tabular-nums text-muted">{rollup.rows.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Coverage for the table as a whole, on impressions — the column the
          ordering above is derived from, so it is the one whose gaps change what
          the reader sees first. */}
      <CoverageLine coverage={coverageFor(rows, 'impressions')} />
    </Card>
  )
}
