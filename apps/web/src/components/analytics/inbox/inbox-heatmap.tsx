import { Panel, PanelHead, ChartSparse } from '@/components/charts/panel'
import type { ZernioInboxHeatmapBucket } from '@sahoda/publishing'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
/** 1 = Monday … 7 = Sunday, Zernio's own `toDayOfWeek` convention. */
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 7] as const

/**
 * When messages land: day-of-week × hour-of-day, received count as the shade.
 *
 * ── WHY THE HOURS ARE NOT CONVERTED TO THE WORKSPACE'S TIMEZONE ──────────────
 * `TimingHeatmap`'s posting slots are computed from `publishedAt`, a timestamp
 * this codebase owns and can convert freely. Zernio's `/analytics/inbox/heatmap`
 * buckets a message by `dow`/`hour` on ITS OWN side and never states which
 * clock those numbers are in — its OpenAPI names only the day-of-week
 * convention (ClickHouse's `toDayOfWeek`), not a timezone. Re-labelling hours
 * we did not compute as the workspace's local time would be a guess dressed as
 * a measurement, so this states its own clock explicitly instead of silently
 * assuming UTC or the workspace zone.
 *
 * ── SPARSE, LIKE THE API ITSELF ───────────────────────────────────────────────
 * Only cells with at least one event are returned. Missing cells are
 * zero-filled here, which is safe: a bucket the API never sent is a bucket
 * with no events, per its own documented contract — not an unmeasured cell.
 */
export function InboxHeatmap({ buckets }: { buckets: readonly ZernioInboxHeatmapBucket[] }) {
  if (buckets.length === 0) {
    return (
      <Panel className="space-y-4">
        <PanelHead title="When messages land" />
        <ChartSparse compact>
          No inbox activity in this window yet, so there is no pattern to map by day and hour.
        </ChartSparse>
      </Panel>
    )
  }

  const byKey = new Map<string, ZernioInboxHeatmapBucket>(
    buckets.map((b) => [`${b.dow}|${b.hour}`, b]),
  )
  const peak = Math.max(1, ...buckets.map((b) => b.received))
  const hours = Array.from({ length: 24 }, (_, i) => i)

  return (
    <Panel className="space-y-3">
      <PanelHead
        title="When messages land"
        sub="Received messages by day of week and hour, in Zernio's reporting clock (not necessarily your workspace's timezone)."
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-separate border-spacing-1">
          <caption className="sr-only">Received messages by day of week and hour of day.</caption>
          <thead>
            <tr>
              <th scope="col" className="type-meta text-muted">
                <span className="sr-only">Day</span>
              </th>
              {hours.map((hour) => (
                <th key={hour} scope="col" className="px-0.5 py-1 type-meta text-muted">
                  {hour % 3 === 0 ? hour : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DOW_ORDER.map((dow, i) => (
              <tr key={dow}>
                <th
                  scope="row"
                  className="whitespace-nowrap px-2 py-1 text-left type-meta text-muted"
                >
                  {WEEKDAYS[i]}
                </th>
                {hours.map((hour) => {
                  const bucket = byKey.get(`${dow}|${hour}`)
                  const received = bucket?.received ?? 0
                  const shade = received / peak
                  const description = `${WEEKDAYS[i]} ${hour}:00: ${received} received.`
                  return (
                    <td key={hour} className="p-0">
                      <div
                        title={description}
                        className="h-5 w-5 rounded-sm surface-ring"
                        style={
                          received > 0
                            ? {
                                backgroundColor: `color-mix(in srgb, var(--acc) ${Math.min(shade * 90, 90)}%, transparent)`,
                              }
                            : undefined
                        }
                      >
                        <span className="sr-only">{description}</span>
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
