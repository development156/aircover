import { CardEmpty } from '@/components/empty-state'
import { Card, CardLabel } from '@/components/ui/card'
import { METRIC_LABELS, type MetricKey } from '@/lib/analytics/compare'
import { MIN_SERIES_DAYS, type MetricSeries, type SeriesPoint } from '@/lib/analytics/series'

/**
 * Performance over time — the trend, once there is one.
 *
 * ── THE FIVE THINGS THIS CHART REFUSES TO DRAW ───────────────────────────────
 *  1. A zero for a day nothing was measured. There is no point at all on such a
 *     day, so no cliff appears where a sync simply did not run.
 *  2. A line THROUGH a missing day. The path breaks instead: a segment is drawn
 *     only between days that are next to each other. A line spanning a gap is
 *     indistinguishable from two real readings, which is the same lie as (1) told
 *     with better manners.
 *  3. A trend from two points. Two readings are a straight line between them and
 *     imply a rate of change nothing supports — see `MIN_SERIES_DAYS`.
 *  4. A per-day figure derived by subtracting one day from the next. The stored
 *     numbers are RUNNING TOTALS since each post went out, which is what the
 *     platforms report; the difference between two of them is a number no platform
 *     ever gave us.
 *  5. A total whose coverage it hides. The count of post-channels measured can
 *     move from day to day, so when it does the card says so under the chart
 *     rather than letting the reader assume one line means one population.
 *
 * ── AND WHY IT MAY RENDER NOTHING AT ALL ─────────────────────────────────────
 * The history lives in `post_metric_snapshots`, added by migration 20260819000100,
 * which applies to production and is the founder's to run. Until it does, this
 * renders exactly what it rendered before any of this was built: the container,
 * saying Sahoda does not keep a history yet. That sentence is true today and this
 * component stops saying it the moment it stops being true.
 */

const WIDTH = 560
const HEIGHT = 132
const PAD_X = 6
const PAD_Y = 10

/** One day, in whole days since the epoch — the x axis's real unit. */
function dayNumber(day: string): number {
  return Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000)
}

/**
 * The polyline commands, broken wherever a day is missing.
 *
 * The break is the honest part. Points are joined only when their days are
 * consecutive; anywhere else the path lifts, so a week with a two-day outage reads
 * as two runs of measurement rather than one continuous line.
 */
export function pathFor(points: readonly SeriesPoint[]): string {
  if (points.length === 0) return ''

  const days = points.map((point) => dayNumber(point.day))
  const firstDay = days[0]!
  const lastDay = days[days.length - 1]!
  const span = Math.max(1, lastDay - firstDay)

  const totals = points.map((point) => point.total)
  const top = Math.max(...totals)
  const bottom = Math.min(...totals)
  // A flat series has no range to scale against; it is drawn down the middle
  // rather than divided by zero or stretched into invented variation.
  const range = top - bottom

  const x = (day: number): number => PAD_X + ((day - firstDay) / span) * (WIDTH - PAD_X * 2)
  const y = (total: number): number =>
    range === 0 ? HEIGHT / 2 : HEIGHT - PAD_Y - ((total - bottom) / range) * (HEIGHT - PAD_Y * 2)

  let path = ''
  points.forEach((point, i) => {
    const command = i > 0 && days[i]! - days[i - 1]! === 1 ? 'L' : 'M'
    path += `${path === '' ? 'M' : command}${x(days[i]!).toFixed(1)} ${y(point.total).toFixed(1)} `
  })
  return path.trim()
}

function Container({ children }: { children: React.ReactNode }) {
  return (
    <Card className="space-y-3">
      <CardLabel className="mb-0">Performance over time</CardLabel>
      {children}
    </Card>
  )
}

/**
 * What this card says when it has no series to draw.
 *
 * ── IT USED TO WEAR `.is-proposed`, AND THAT WAS A CATEGORY ERROR ────────────
 * The empty box was literally `className="is-proposed …"` — a dashed edge, which
 * in this product is not decoration. docs/26 §3 makes it one of four CERTAINTY
 * rungs, and `.is-proposed` means "Sahoda suggests it. Nobody agreed." Applied
 * to "nothing has been measured yet" it says the opposite of the truth: it
 * dresses an ABSENCE as a PROPOSAL, and it spends a load-bearing signature on a
 * state that is not on the ladder at all.
 *
 * docs/27 §1 counted this as one of five empty treatments in five visual
 * languages on this screen. It is now `CardEmpty` (docs/26 §4.1), the same one
 * every other card on the page uses.
 */
function Note({ children }: { children: React.ReactNode }) {
  return <CardEmpty className="min-h-[132px]" body={children} />
}

export interface PerformanceOverTimeProps {
  /**
   * Optional, and its default is the state production is in: the history table
   * does not exist yet, so the card says what it has always said.
   */
  series?: MetricSeries
  metric?: MetricKey
}

export function PerformanceOverTime({
  series = { kind: 'unavailable' },
  metric = 'reach',
}: PerformanceOverTimeProps) {
  if (series.kind === 'unavailable') {
    return (
      <Container>
        <Note>
          Sahoda reads your numbers fresh each time and does not keep a history yet, so there is no
          trend to draw. This is where it will go.
        </Note>
      </Container>
    )
  }

  if (series.kind === 'no-workspace') {
    // NO REMEDY, deliberately. Nothing failed here and reloading cannot make a
    // workspace, so offering a retry would send someone to press a button forever.
    // Caught by `e2e/no-impossible-remedy.spec.ts` when this said "could not read".
    return (
      <Container>
        <Note>A history belongs to a workspace, and this account does not have one yet.</Note>
      </Container>
    )
  }

  if (series.kind === 'unreadable') {
    // NOT "there is no history" — that is a claim about the workspace's data, and
    // this read did not establish it. What failed was the reading.
    return (
      <Container>
        <Note>Sahoda could not read the history for this chart. Reload to try again.</Note>
      </Container>
    )
  }

  if (series.kind === 'empty') {
    return (
      <Container>
        <Note>
          Sahoda has started keeping a history. Nothing has been measured yet. The first readings
          arrive once your published posts report.
        </Note>
      </Container>
    )
  }

  if (series.kind === 'sparse') {
    return (
      <Container>
        <Note>
          {series.days === 1 ? 'One day' : `${series.days} days`} measured so far. A trend needs at
          least {MIN_SERIES_DAYS}, because a line through two readings shows a direction neither of
          them measured.
        </Note>
      </Container>
    )
  }

  const totals = series.points.map((point) => point.total)
  const top = Math.max(...totals)
  const bottom = Math.min(...totals)
  const first = series.points[0]!
  const last = series.points[series.points.length - 1]!

  return (
    <Container>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] text-muted">
          {METRIC_LABELS[metric]}, running total since each post went out
        </span>
        <span className="text-[12.5px] font-[550] tabular-nums">
          {last.total.toLocaleString('en-IN')}
        </span>
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-[132px] w-full min-w-[280px]"
          role="img"
          aria-label={`${METRIC_LABELS[metric]} across ${series.points.length} measured days, from ${first.total.toLocaleString('en-IN')} to ${last.total.toLocaleString('en-IN')}`}
        >
          <path
            d={pathFor(series.points)}
            fill="none"
            stroke="var(--acc)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[11px] text-muted">
        <span className="tabular-nums">
          {first.day} to {last.day} · {series.points.length} measured days
        </span>
        <span className="tabular-nums">
          {bottom.toLocaleString('en-IN')} to {top.toLocaleString('en-IN')}
        </span>
      </div>

      {series.minSeries !== series.maxSeries ? (
        // Coverage moved across the window. Said out loud, because a total drawn
        // from fewer posts on one day dips for a reason that is not performance.
        <p className="text-[11px] text-muted">
          Measured across {series.minSeries} to {series.maxSeries} post channels a day, so part of
          the movement is how many reported rather than how they did.
        </p>
      ) : null}
    </Container>
  )
}
