import Link from 'next/link'

import { ChartEmpty } from '@/components/home/chart-empty'
import { Card, CardLabel } from '@/components/ui/card'
import { accountLagCopy } from '@/lib/analytics/copy'
import type { AccountAnalytics, SeriesPoint } from '@/lib/analytics/account-insights'

/**
 * Instagram followers and account insights on Home.
 *
 * ── WHY THIS CAN RENDER NOTHING ──────────────────────────────────────────────
 * Home is designed for empty first, and its own docstring says why: a grid of
 * zero-value cards reads broken. A workspace with no Instagram connection has no
 * business seeing an insights card full of dashes, so that case renders nothing at
 * all — the Connections page is where connecting is asked for.
 *
 * A BROKEN connection is different and does render, because it is an action the
 * owner needs to take and would otherwise never learn about.
 *
 * The chart follows `SpendArea`: hand-rolled SVG painting with `var(--brand)`, so
 * it re-themes with the Brand Skin and has no per-theme branch to keep in sync.
 */

const W = 300
const H = 80

export function InstagramInsights({ analytics }: { analytics: AccountAnalytics }) {
  // Nothing connected: say nothing. See the note above.
  if (analytics.kind === 'not-connected') return null

  if (analytics.kind === 'reconnect') {
    return (
      <Card className="space-y-2">
        <CardLabel>Instagram</CardLabel>
        <p className="text-[14px] text-ink">Reconnect Instagram to see followers and reach.</p>
        <p className="text-[12.5px] text-muted">
          The connection expired, so we can’t read metrics until it’s renewed.
        </p>
        <Link
          href="/connections"
          className="inline-flex text-[13px] font-semibold text-accent underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Open connections
        </Link>
      </Card>
    )
  }

  if (analytics.kind === 'unreadable') {
    return (
      <Card className="space-y-2">
        <CardLabel>Instagram</CardLabel>
        <ChartEmpty status="unreadable" empty="" />
      </Card>
    )
  }

  const { followers, insights, lagHours, withinLag } = analytics

  return (
    <Card className="space-y-4">
      <CardLabel>Instagram · last 30 days</CardLabel>

      {followers.length === 0 ? (
        <ChartEmpty
          status="empty"
          // NOT "0 followers". Instagram told us nothing, which is not a count.
          empty={
            withinLag
              ? 'No follower history yet — Instagram reports on a delay.'
              : 'Instagram hasn’t reported follower history for this window.'
          }
        />
      ) : (
        <FollowerLine points={followers} />
      )}

      {insights.length > 0 ? (
        <dl className="flex flex-wrap gap-x-6 gap-y-2">
          {insights.map((tile) => (
            <div key={tile.label}>
              <dt className="text-[12px] text-muted">{tile.label}</dt>
              <dd className="text-[17px] leading-6 font-bold tabular-nums text-ink">
                {tile.value.toLocaleString('en-IN')}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <p className="text-[12px] text-muted">{accountLagCopy(lagHours)}</p>
    </Card>
  )
}

/**
 * Follower count over the window.
 *
 * Scaled between the window's own min and max rather than from zero: follower
 * counts do not start at zero, and a zero baseline flattens every real movement
 * into a straight line. The two endpoints are LABELLED so the scale cannot be
 * misread as bigger growth than it is — an unlabelled zoomed axis is its own lie.
 */
function FollowerLine({ points }: { points: readonly SeriesPoint[] }) {
  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  // A flat window is real data, not a divide-by-zero. Render it flat, centred.
  const span = max - min || 1
  const step = values.length > 1 ? W / (values.length - 1) : W

  const coords = values.map((value, index) => {
    const x = values.length > 1 ? index * step : W / 2
    const y = max === min ? H / 2 : H - ((value - min) / span) * H
    return `${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`
  })

  const first = values[0] ?? 0
  const last = values[values.length - 1] ?? 0
  const change = last - first

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[24px] leading-7 font-bold tabular-nums text-ink">
          {last.toLocaleString('en-IN')}
        </span>
        <span className="text-[13px] tabular-nums text-muted">
          {change === 0 ? 'No change' : `${change > 0 ? '+' : ''}${change.toLocaleString('en-IN')}`}{' '}
          over {points.length} {points.length === 1 ? 'day' : 'days'}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Instagram followers over ${points.length} days, from ${first.toLocaleString('en-IN')} to ${last.toLocaleString('en-IN')}.`}
        className="h-[80px] w-full"
      >
        <path
          d={`M${coords.join('L')}`}
          fill="none"
          stroke="var(--brand)"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* The axis is zoomed, so its ends are stated. Without these two numbers the
          line's steepness is unreadable. */}
      <div className="flex justify-between text-[11px] tabular-nums text-muted">
        <span>{min.toLocaleString('en-IN')}</span>
        <span>{max.toLocaleString('en-IN')}</span>
      </div>
    </div>
  )
}
