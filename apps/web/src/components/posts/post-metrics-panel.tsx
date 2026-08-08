import { MetricStrip } from '@/components/posts/metric-strip'
import { Card, CardLabel } from '@/components/ui/card'
import type { ChannelMetrics } from '@/lib/analytics/post-metrics'

/**
 * How this post performed, per channel, on the detail view.
 *
 * Shows every channel and its reason in full — unlike the card, which hides the
 * ones with nothing to say. On the detail view "Instagram has not reported metrics
 * for this post" is the answer someone came for; on a list of fifty cards it would
 * be fifty lines of noise.
 *
 * Renders nothing at all when the post has never been published. An empty
 * "Performance" card under a draft implies a measurement that failed, when in fact
 * there is nothing to measure yet.
 */
export function PostMetricsPanel({ metrics }: { metrics: readonly ChannelMetrics[] }) {
  const anyPublished = metrics.some(
    (entry) => !(entry.state.kind === 'unavailable' && entry.state.reason === 'not-published'),
  )
  if (!anyPublished) return null

  return (
    <Card className="space-y-3">
      <CardLabel>Performance</CardLabel>
      <MetricStrip metrics={metrics} variant="detail" />
      {/* Says whose schedule this is. Without it, a page of "not available yet"
          reads as Sahoda failing rather than as the platform's documented delay. */}
      <p className="text-[12px] text-muted">
        Platforms report metrics on their own delay, so a post published today usually has nothing
        here yet.
      </p>
    </Card>
  )
}
