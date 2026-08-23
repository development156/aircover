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
 * ── AND BELOW 700px IT IS NOT A TABLE ────────────────────────────────────────
 * MEASURED 2026-08-23 at 390: `min-w-[420px]` inside `overflow-x-auto` against
 * ~344px of usable card width, so the header rendered "Engager" and the `Posts`
 * column — which on an unmeasured workspace holds the ONLY real numbers on the
 * whole page — sat entirely off-screen with nothing drawn to say the region
 * scrolls. `no-truncated-labels.spec.ts` did not see it: /analytics is not in
 * its route list.
 *
 * docs/37 §13: "Mobile is recomposed, not shrunk." A four-metric comparison does
 * not fit in 344px at a readable size and no amount of narrowing makes it, so
 * below `narrow` each channel becomes a block with its metrics as a small grid.
 * Same figures, same `TotalFigure` (so the coverage suffix and the refusal to
 * print a total nobody reported both survive), same order, a shape that fits the
 * hand. The two renderings are `display:none`'d for each other rather than
 * conditionally mounted, so nothing is announced twice.
 *
 * There is deliberately no "share of total" column. An honest one could only fill
 * when every row in scope reported — which on a table of mixed coverage is exactly
 * when it is least likely to hold — so it would sit empty most of the time, and a
 * column that is usually blank is a worse answer than a column that is not there.
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

      {/* ── narrow: a block per channel ─────────────────────────────────── */}
      <ul className="space-y-3 narrow:hidden">
        {rollups.map((rollup) => (
          <li key={rollup.channel} className="border-b border-line pb-3 last:border-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="type-body font-[550] text-ink">
                {CHANNEL_LABELS[rollup.channel]}
              </span>
              <span className="type-meta tabular-nums text-muted">
                {rollup.rows.length} {rollup.rows.length === 1 ? 'post' : 'posts'}
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-3 gap-3">
              {METRICS.map((metric) => (
                <div key={metric.key} className="min-w-0">
                  <dt className="type-meta truncate text-muted">{metric.label}</dt>
                  <dd className="type-sm">
                    <TotalFigure total={totalFor(rollup.rows, metric.key)} noun="posts" />
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>

      {/* ── narrow and up: the comparison as a table ─────────────────────── */}
      <div className="overflow-x-auto max-narrow:hidden">
        <table className="w-full min-w-[420px] border-collapse type-sm">
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
