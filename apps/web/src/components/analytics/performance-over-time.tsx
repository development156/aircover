import { ChartSparse, Panel, PanelHead } from '@/components/charts/panel'
import { TrendArea, type TrendPoint } from '@/components/charts/trend-area'
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
 * ── THE CURVE IS `TrendArea` NOW, AND `pathFor` WENT WITH IT ────────────────
 * This file used to own a `pathFor` helper and four unit tests on it, and those
 * tests encoded rules 1 and 2 above — no point on an unmeasured day, no segment
 * across a gap. The rules did not change; the drawing moved into a shared
 * component so /home's charts obey them too, and a helper nothing renders with
 * four tests still passing on it is the worst thing in this codebase to leave
 * behind. `charts/trend-area.test.ts` holds the same two properties against the
 * code that actually ships, plus a third the old path could not have: the curve
 * is monotone cubic, so it never dips below the two readings it joins. A
 * Catmull-Rom through 40, 0, 40 passes through roughly -12, which would be a
 * rendered negative reach.
 *
 * ── AND WHY IT MAY RENDER NOTHING AT ALL ─────────────────────────────────────
 * The history lives in `post_metric_snapshots`, added by migration 20260819000100,
 * which applies to production and is the founder's to run. Until it does, this
 * renders exactly what it rendered before any of this was built: the container,
 * saying Sahoda does not keep a history yet. That sentence is true today and this
 * component stops saying it the moment it stops being true.
 */

/** One day, in whole days since the epoch — the x axis's real unit. */
function dayNumber(day: string): number {
  return Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000)
}

function Container({ children }: { children: React.ReactNode }) {
  return (
    <Panel className="space-y-4">
      <PanelHead title="Performance over time" />
      {children}
    </Panel>
  )
}

/**
 * What this card says when it has no series to draw.
 *
 * ── IT USED TO WEAR `.is-proposed`, AND THAT WAS A CATEGORY ERROR ────────────
 * The empty box was literally `className="is-proposed …"` — a dashed edge,
 * which in this product is one of four CERTAINTY rungs meaning "Sahoda suggests
 * it. Nobody agreed." Applied to "nothing has been measured yet" it dresses an
 * ABSENCE as a PROPOSAL and spends a load-bearing signature on a state that is
 * not on the ladder at all.
 *
 * ── AND THEN IT WAS A CENTRED PARAGRAPH IN AN EMPTY BOX ──────────────────────
 * `CardEmpty` fixed the category error and inherited the shape docs/40 §3.2
 * already named on this page: a container three times wider than anything in
 * it, prose centred in the middle of it. MEASURED on
 * `page-dash-before__populated__analytics__full__1440__light`, this card is
 * ~460x130 holding one sentence on three centred lines.
 *
 * `ChartSparse` draws the baseline the chart is waiting to fill and puts the
 * sentence at the left margin above it, which is the difference between "not
 * yet" and "broken". THE SENTENCES ARE UNCHANGED — every one of them is
 * asserted by `performance-over-time.test.tsx` and each states a different
 * claim (docs/37 §9); only the container moved.
 */
function Note({ children }: { children: React.ReactNode }) {
  return <ChartSparse>{children}</ChartSparse>
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
        <span className="type-meta text-muted">
          {METRIC_LABELS[metric]}, running total since each post went out
        </span>
        <span className="type-meta font-[550] tabular-nums">
          {last.total.toLocaleString('en-IN')}
        </span>
      </div>

      <TrendArea
        points={series.points.map((point): TrendPoint => ({
          x: dayNumber(point.day),
          y: point.total,
          label: point.day,
        }))}
        unit={METRIC_LABELS[metric].toLowerCase()}
        pointNoun="days"
        gradientId="pot-trend"
      />

      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 type-meta text-muted">
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
        <p className="type-meta text-muted">
          Measured across {series.minSeries} to {series.maxSeries} post channels a day, so part of
          the movement is how many reported rather than how they did.
        </p>
      ) : null}
    </Container>
  )
}
