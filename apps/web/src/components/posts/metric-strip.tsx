import { Clock, HelpCircle } from 'lucide-react'

import { CHANNEL_SHORT } from '@/components/posts/channel-label'
import type { ChannelMetrics } from '@/lib/analytics/post-metrics'
import { metricCopy, metricValue } from '@/lib/analytics/copy'
import { cn } from '@/lib/utils'

/**
 * Impressions, reach and engagement for one post — per channel.
 *
 * ── WHY THIS IS NEVER A ROW OF ZEROES ────────────────────────────────────────
 * The state was decided upstream by `classifyPostMetrics`; this component only
 * renders the verdict. It has no access to a raw metrics object and therefore no
 * way to print a number that was not judged real, which is deliberate — the rule
 * "never render a zero as if it were a measurement" is enforced by what this
 * component cannot reach, not by remembering to check.
 *
 * Server component: nothing here is interactive.
 */

/** Only channels that could have metrics are worth a line on the card. */
function isWorthShowing(entry: ChannelMetrics): boolean {
  return !(entry.state.kind === 'unavailable' && entry.state.reason === 'not-published')
}

export interface MetricStripProps {
  metrics: readonly ChannelMetrics[]
  /**
   * `card` is one tight line per channel and hides channels with nothing to say.
   * `detail` shows every channel and its reason in full.
   */
  variant?: 'card' | 'detail'
  className?: string
}

export function MetricStrip({ metrics, variant = 'card', className }: MetricStripProps) {
  const rows = variant === 'card' ? metrics.filter(isWorthShowing) : metrics
  // A post nothing has gone out on says nothing here. The card already carries its
  // draft/scheduled badge, and an empty metrics block under it would read as a
  // failure to load rather than as a post that has not run yet.
  if (rows.length === 0) return null

  return (
    <dl
      className={cn('space-y-1.5', className)}
      data-guide={variant === 'detail' ? 'posts.metrics' : undefined}
    >
      {rows.map((entry) => (
        <MetricRow key={entry.channel} entry={entry} variant={variant} />
      ))}
    </dl>
  )
}

function MetricRow({ entry, variant }: { entry: ChannelMetrics; variant: 'card' | 'detail' }) {
  const copy = metricCopy(entry.state, entry.channel)
  const label = CHANNEL_SHORT[entry.channel]

  if (entry.state.kind === 'ready') {
    const { impressions, reach, engagement } = entry.state.metrics
    return (
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12.5px]">
        <dt className="font-medium text-muted">{label}</dt>
        <dd className="flex flex-wrap items-baseline gap-x-3">
          <Figure label="Impressions" value={metricValue(impressions)} />
          <Figure label="Reach" value={metricValue(reach)} />
          <Figure label="Engagement" value={metricValue(engagement)} />
        </dd>
        {variant === 'detail' && copy.detail ? (
          <dd className="w-full text-[12px] text-muted">{copy.detail}</dd>
        ) : null}
      </div>
    )
  }

  // `none` claims nothing and nothing went wrong (a capped list, an unpublished
  // channel) — a question mark there would read as "something is unknown", undoing
  // the distinction the tone exists to draw. Only `blocked` gets the query glyph.
  const Icon = copy.tone === 'blocked' ? HelpCircle : Clock

  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12.5px]">
      <dt className="font-medium text-muted">{label}</dt>
      <dd
        // `data-certainty` is read by the certainty stylesheet; `none` claims nothing,
        // which is exactly right for a metric we do not have.
        data-certainty="none"
        className={cn(
          'inline-flex items-center gap-1',
          copy.tone === 'blocked' ? 'text-warn' : 'text-muted',
        )}
      >
        <Icon size={12} strokeWidth={1.8} aria-hidden />
        {copy.headline}
      </dd>
      {variant === 'detail' && copy.detail ? (
        <dd className="w-full text-[12px] text-muted">{copy.detail}</dd>
      ) : null}
    </div>
  )
}

/**
 * One figure. `tabular-nums` so a column of these keeps a fixed advance width —
 * without it, changing digits make the row jitter as data lands.
 */
function Figure({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-muted">{label}</span>
      <span className="font-semibold tabular-nums text-ink">{value}</span>
    </span>
  )
}
