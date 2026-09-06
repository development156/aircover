import { Bars, type BarPoint } from '@/components/charts/bars'
import { ChartSparse, Panel, PanelHead } from '@/components/charts/panel'
import type { ZernioInboxResponseTime } from '@sahoda/publishing'

/**
 * Time to first reply, as a histogram plus the headline median.
 *
 * `summary === null` is Zernio's own answer for "no conversation in this
 * window received a message AND got a reply" — see `inboxResponseTime`'s
 * normalisation. That is a different sentence from "everyone replies
 * instantly", so it renders as its own explicit empty state rather than a
 * histogram of zero-height bars.
 */
export function ResponseTime({ responseTime }: { responseTime: ZernioInboxResponseTime }) {
  if (!responseTime.summary) {
    return (
      <Panel className="space-y-4">
        <PanelHead title="Response time" />
        <ChartSparse compact>
          No paired conversations yet. This chart needs a received message that later got a reply in
          the same thread, and none in this window has both.
        </ChartSparse>
      </Panel>
    )
  }

  const { summary, histogram } = responseTime
  const points: BarPoint[] = histogram.map((bucket) => ({
    label: bucket.bucket,
    value: bucket.count,
  }))

  return (
    <Panel className="space-y-4">
      <PanelHead
        title="Response time"
        sub="First reply after a customer message, across paired conversations in this window."
      />

      <div className="flex items-baseline gap-6">
        <div>
          <p className="type-eyebrow text-muted">Median</p>
          <p className="type-h3 tabular-nums text-ink">{formatSeconds(summary.medianSeconds)}</p>
        </div>
        <div>
          <p className="type-eyebrow text-muted">90th percentile</p>
          <p className="type-h3 tabular-nums text-ink">{formatSeconds(summary.p90Seconds)}</p>
        </div>
        <div>
          <p className="type-eyebrow text-muted">Sample</p>
          <p className="type-h3 tabular-nums text-ink">
            {summary.sampleSize.toLocaleString('en-IN')}
          </p>
        </div>
      </div>

      {points.length > 0 ? <Bars points={points} unit="conversations" /> : null}
    </Panel>
  )
}

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.round((seconds % 3600) / 60)
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
}
