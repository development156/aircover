import Link from 'next/link'
import type { Route } from 'next'

import { ChartSparse, Panel, PanelHead } from '@/components/charts/panel'
import { TrendArea, type TrendPoint } from '@/components/charts/trend-area'
import type { DailyMetricsRead, LivePoint } from '@/lib/analytics/daily-metrics'
import { MIN_SERIES_DAYS, type MetricSeries } from '@/lib/analytics/series'
import type { AnalyticsMetric } from '@/lib/analytics/view-params'
import { cn } from '@/lib/utils'

/**
 * ENGAGEMENT OVER TIME, FOR WHICHEVER OF NINE METRICS WAS ASKED FOR.
 *
 * ── THE TOGGLES ARE LINKS, AND THAT IS NOT A COMPROMISE ──────────────────────
 * Nine `<Link>`s to `?metric=…`, so this whole panel stays a server component
 * and the page's javascript budget does not move. It also makes the selection
 * shareable, which a piece of component state never is: the CMO report can
 * point at "the saves you got in August" and land on it.
 *
 * ── THE LEGEND AND THE TOGGLES ARE ONE THING ─────────────────────────────────
 * The reference draws a legend of metrics with their totals beside them, and a
 * separate row of tabs above it would be the same nine words twice. Each entry
 * is the total AND the switch, and the selected one is marked by weight and a
 * rule rather than by colour alone.
 *
 * ── TWO SOURCES, AND THE CAPTION SAYS WHICH ──────────────────────────────────
 * Three metrics come from `post_metric_snapshots` as RUNNING LIFETIME TOTALS,
 * so a day means "everything every post has earned as of that day". Six come
 * from Zernio with `attribution: 'received'`, so a day means "what came in that
 * day". Same axis, different question. A chart that switched between them in
 * silence would be the most dishonest thing on this page, so the basis is
 * printed under it and it changes with the metric.
 *
 * ── AND IT REFUSES THE SAME FIVE THINGS `PerformanceOverTime` REFUSES ────────
 * No zero for an unmeasured day, no line across a gap (`TrendArea` breaks the
 * path), no trend from two points, no per-day figure derived by differencing a
 * running total, and no total whose coverage it hides.
 */

export interface MetricLegendEntry {
  metric: AnalyticsMetric
  label: string
  /** The window's total, or null where nothing reported it. Never a zero. */
  total: number | null
  href: Route
}

export interface MetricOverTimeProps {
  metric: AnalyticsMetric
  label: string
  legend: readonly MetricLegendEntry[]
  /** Set when the chosen metric is one of the three this database stores. */
  stored?: MetricSeries
  /** Set when it is one of the six read live from Zernio. */
  live?: { read: DailyMetricsRead; points: readonly LivePoint[] }
}

function Legend({ legend, metric }: { legend: readonly MetricLegendEntry[]; metric: string }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2">
      {legend.map((entry) => {
        const selected = entry.metric === metric
        return (
          <li key={entry.metric}>
            <Link
              href={entry.href}
              aria-current={selected ? 'true' : undefined}
              className={cn(
                'flex flex-col gap-0.5 border-b-2 pb-1 transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                // Weight and a rule, never hue alone: the selected metric has to
                // survive greyscale and a screen reader gets `aria-current`.
                selected
                  ? 'border-accent text-ink'
                  : 'border-transparent text-muted hover:border-line-firm hover:text-ink',
              )}
            >
              <span className="type-meta">{entry.label}</span>
              <span className={cn('type-sm tabular-nums', selected && 'font-[550]')}>
                {/* The absence mark, not a zero. A metric no day reported is not
                    a metric that reported none. */}
                {entry.total === null ? '—' : entry.total.toLocaleString('en-IN')}
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/** One day, in whole days since the epoch — the x axis's real unit. */
function dayNumber(day: string): number {
  return Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000)
}

export function MetricOverTime({ metric, label, legend, stored, live }: MetricOverTimeProps) {
  const basis =
    stored !== undefined
      ? `${label}, as a running total since each post went out. Every post's lifetime figure, as it stood on that day.`
      : `${label} received on the day itself, on posts of any age. Read from your connected accounts.`

  return (
    <Panel className="space-y-4">
      {/* The title is UNCHANGED from the panel this replaces. Two e2e specs
          and a reader's memory both know this card by that name, and what
          changed is that it now draws nine metrics instead of one. */}
      <PanelHead
        title="Performance over time"
        sub="Pick a metric. The link keeps your date range and your channel."
      />
      <Legend legend={legend} metric={metric} />
      {stored !== undefined ? (
        <StoredChart series={stored} label={label} basis={basis} />
      ) : (
        <LiveChart live={live} label={label} basis={basis} />
      )}
    </Panel>
  )
}

function Basis({ children }: { children: React.ReactNode }) {
  return <p className="max-w-[var(--measure-prose)] type-meta text-muted">{children}</p>
}

function StoredChart({
  series,
  label,
  basis,
}: {
  series: MetricSeries
  label: string
  basis: string
}) {
  // Every sentence here is a DIFFERENT claim and they are not interchangeable.
  // `PerformanceOverTime` carries the same set and the same argument.
  if (series.kind === 'unavailable') {
    return (
      <ChartSparse compact>
        Sahoda reads your numbers fresh each time and does not keep a history yet, so there is no
        trend to draw. This is where it will go.
      </ChartSparse>
    )
  }
  if (series.kind === 'no-workspace') {
    // No remedy. Reloading cannot make a workspace.
    return (
      <ChartSparse compact>
        A history belongs to a workspace, and this account does not have one yet.
      </ChartSparse>
    )
  }
  if (series.kind === 'unreadable') {
    return (
      <ChartSparse compact>
        Sahoda could not read the history for this chart. Reload to try again.
      </ChartSparse>
    )
  }
  if (series.kind === 'empty') {
    return (
      <ChartSparse compact>
        Sahoda has started keeping a history. Nothing has been measured yet. The first readings
        arrive once your published posts report.
      </ChartSparse>
    )
  }
  if (series.kind === 'sparse') {
    return (
      <ChartSparse compact>
        {series.days === 1 ? 'One day' : `${series.days} days`} measured so far. A trend needs at
        least {MIN_SERIES_DAYS}, because a line through two readings shows a direction neither of
        them measured.
      </ChartSparse>
    )
  }

  const first = series.points[0]!
  const last = series.points[series.points.length - 1]!
  return (
    <div className="space-y-3">
      <TrendArea
        points={series.points.map((point): TrendPoint => ({
          x: dayNumber(point.day),
          y: point.total,
          label: point.day,
        }))}
        unit={label.toLowerCase()}
        pointNoun="days"
        gradientId="metric-trend-stored"
      />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 type-meta text-muted">
        <span className="tabular-nums">
          {first.day} to {last.day} · {series.points.length} measured days
        </span>
        <span className="tabular-nums">{last.total.toLocaleString('en-IN')}</span>
      </div>
      <Basis>{basis}</Basis>
      {series.minSeries !== series.maxSeries ? (
        <p className="type-meta text-muted">
          Measured across {series.minSeries} to {series.maxSeries} post channels a day, so part of
          the movement is how many reported rather than how they did.
        </p>
      ) : null}
    </div>
  )
}

function LiveChart({
  live,
  label,
  basis,
}: {
  live: { read: DailyMetricsRead; points: readonly LivePoint[] } | undefined
  label: string
  basis: string
}) {
  if (live === undefined || live.read.kind === 'not-connected') {
    return (
      <ChartSparse compact>
        {label} come from the platform itself, and no account is connected that reports them.
        Connect a channel to start this chart.
      </ChartSparse>
    )
  }
  if (live.read.kind === 'unreadable') {
    // NOT "you have no likes" and NOT "connect an account". The request went out
    // and did not come back with an answer, and that is all this establishes.
    return (
      <ChartSparse compact>
        Sahoda could not read {label.toLowerCase()} for this period. This is not a reading of your
        posts. Reload to try again.
      </ChartSparse>
    )
  }
  if (live.points.length === 0) {
    return (
      <ChartSparse compact>
        Sahoda asked your connected accounts and none of them reported {label.toLowerCase()} in this
        period.
      </ChartSparse>
    )
  }
  if (live.points.length < MIN_SERIES_DAYS) {
    return (
      <ChartSparse compact>
        {live.points.length === 1 ? 'One day' : `${live.points.length} days`} reported so far. A
        trend needs at least {MIN_SERIES_DAYS}, because a line through two readings shows a
        direction neither of them measured.
      </ChartSparse>
    )
  }

  const first = live.points[0]!
  const last = live.points[live.points.length - 1]!
  const total = live.points.reduce((sum, point) => sum + point.value, 0)
  return (
    <div className="space-y-3">
      <TrendArea
        points={live.points.map((point): TrendPoint => ({
          x: dayNumber(point.day),
          y: point.value,
          label: point.day,
        }))}
        unit={label.toLowerCase()}
        pointNoun="days"
        gradientId="metric-trend-live"
      />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 type-meta text-muted">
        <span className="tabular-nums">
          {first.day} to {last.day} · {live.points.length} reported days
        </span>
        <span className="tabular-nums">{total.toLocaleString('en-IN')} in total</span>
      </div>
      <Basis>{basis}</Basis>
    </div>
  )
}
