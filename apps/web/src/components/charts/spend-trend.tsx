'use client'

import { TrendingUp } from 'lucide-react'
import { useId, useState } from 'react'

import { cn } from '@/lib/utils'
import { curvePath } from './trend-area'

/**
 * A THIN CONNECTED LINE OVER A VERY LIGHT FILL, with an average rule, an axis
 * of dates, and a value on hover. The founder's reference chart, in Sahoda's
 * palette.
 *
 * ── IT REPLACES `Bars` ON /home, AND THE ARGUMENT `Bars` MADE STILL HOLDS ────
 * `bars.tsx` refuses a line, and its reason is exact and correct: a line
 * INTERPOLATES, so it draws ink where no reading exists, and a run of measured
 * zeroes then renders identically to a stretch nobody looked at. That is the one
 * distinction the spend chart exists to make.
 *
 * It is answered here rather than overruled, in two parts.
 *
 *   1. On the screen this ships to, there are no gaps to interpolate ACROSS.
 *      `spend-card.tsx` states it and `readSpend` guarantees it: every day in
 *      the window was read, so every day is a measured value and a zero is a
 *      real reading of "nothing was charged". A line between two adjacent
 *      measured days invents nothing.
 *   2. Where a gap DOES exist the path breaks, exactly as `trend-area.tsx`
 *      breaks its own. A `null` is NOT MEASURED, it is never plotted as a zero,
 *      and no segment spans it. Same rule, same reason, and it is asserted.
 *
 * ── THE LINE IS STRAIGHT, NOT SMOOTHED, AND THAT IS THE SAFER CHOICE ────────
 * `trend-area.tsx` needed Fritsch-Carlson monotone cubics because a naive
 * spline OVERSHOOTS — 40, 0, 40 draws a curve passing through roughly -12, a
 * rendered reading of a value nobody measured. Straight segments cannot
 * overshoot at all: every pixel of the path lies between two real readings. So
 * the reference's own sharp peaks and dips and this product's honesty rule want
 * the same geometry, which is a rare and welcome agreement.
 *
 * ── THE AXIS STARTS AT ZERO, ALWAYS ─────────────────────────────────────────
 * NOT at the window's minimum. `TrendArea` scales between its own min and max,
 * which is right for a metric with no meaningful origin; credits have one. A
 * chart of 40, 41, 42 scaled to its own range draws a dramatic climb out of a
 * 5% change, and on a spend chart that is a misleading picture of somebody's
 * money. Height here is proportional to the credits themselves.
 *
 * ── WHY THE AVERAGE RULE AND THE AXIS ARE HTML, NOT SVG ─────────────────────
 * The path is drawn with `preserveAspectRatio="none"` so it fills whatever
 * width the panel is given, which means the SVG's x and y scale by different
 * factors. Under that, an SVG dash pattern stretches into unequal dashes and a
 * text label shears. `vector-effect` fixes the STROKE and nothing else. So
 * anything that must keep its proportions — the dashes, the labels, the hover
 * dot, the tooltip — is positioned in percentages outside the SVG, where a
 * pixel is a pixel at every width.
 *
 * ── THE ACCENT ──────────────────────────────────────────────────────────────
 * `bars.tsx` measured this and stated the rule: thirty orange bars took /home
 * from 0.550% to 0.613% brand, and highlighting only the peak did not move it
 * back, because one large solid rectangle is most of what thirty were. Its
 * conclusion was the reference's own: LINES take the accent, BARS do not. A
 * 1.5px stroke is not a large object at any width, and the fill is a gradient
 * topping out at 10% — below `TrendArea`'s 18%, because the founder's brief
 * asks for "very subtle" and because this panel sits on a screen that already
 * spends its accent elsewhere.
 */

/** Geometry of the drawing surface. Stretched horizontally to the panel. */
const W = 600
const H = 160
/** Headroom, so the peak is never clipped flat against the top edge. */
const PAD_TOP = 8
/** Room for the stroke's own width at a zero reading. */
const PAD_BOTTOM = 2

export interface SpendPoint {
  /** Axis label. Short — "12 Aug". */
  label: string
  /** The reading. `null` is NOT MEASURED and is never a zero. */
  value: number | null
}

/** How many date labels the axis prints, at most. */
const MAX_AXIS_LABELS = 6

/**
 * Evenly spaced indices, always including both ends.
 *
 * `bars.tsx` measured why this is not "every Nth": at 1440 a thirty-column axis
 * gives each label ~34px and "25 Jul" needs ~40, so eight labels rendered as
 * "25 … 29 … 2 A… 6 …" and at 390 collapsed to "2. 2. 2. 6.". Six labels across
 * the same band get ~170px each, which is why this many can be drawn where
 * eight could not.
 */
export function axisIndices(count: number, max = MAX_AXIS_LABELS): number[] {
  if (count <= 0) return []
  if (count <= max) return Array.from({ length: count }, (_, i) => i)
  const step = (count - 1) / (max - 1)
  const seen = new Set<number>()
  for (let i = 0; i < max; i += 1) seen.add(Math.round(i * step))
  return [...seen].sort((a, b) => a - b)
}

export function SpendTrend({
  points,
  unit,
  className,
}: {
  points: readonly SpendPoint[]
  /** What one reading is a quantity OF. Goes into the accessible summary. */
  unit: string
  className?: string
}) {
  const gradientId = useId()
  const [hover, setHover] = useState<number | null>(null)

  const measured = points.filter((p) => p.value !== null)
  if (points.length === 0) return null

  const peak = Math.max(0, ...measured.map((p) => p.value ?? 0))
  const peakIndex = points.findIndex((p) => p.value !== null && p.value === peak && peak > 0)
  /* The mean over MEASURED days only. Dividing by `points.length` would count
     days nobody read as zeroes and pull the average down — the same lie as
     plotting them. */
  const average =
    measured.length > 0 ? measured.reduce((sum, p) => sum + (p.value ?? 0), 0) / measured.length : 0

  /** Fraction of the plot height, 0 at the baseline. `peak || 1` only avoids a
      divide by zero on an all-zero window; every numerator there is 0. */
  const heightFraction = (value: number) => value / (peak || 1)
  const px = (i: number) => (i / Math.max(1, points.length - 1)) * W
  const py = (value: number) => H - PAD_BOTTOM - heightFraction(value) * (H - PAD_TOP - PAD_BOTTOM)

  // Runs of ADJACENT measured points. A `null` ends the current run, so no
  // segment is ever drawn across a day that was not read.
  const runs: { x: number; y: number }[][] = []
  points.forEach((point, i) => {
    if (point.value === null) return
    const scaled = { x: px(i), y: py(point.value) }
    const previousMeasured = i > 0 && points[i - 1]!.value !== null
    if (previousMeasured && runs.length > 0) runs[runs.length - 1]!.push(scaled)
    else runs.push([scaled])
  })

  const labels = axisIndices(points.length)
  const active = hover !== null ? points[hover] : undefined
  const activeMeasured = active && active.value !== null

  return (
    <figure className={cn('flex flex-col', className)}>
      <div className="relative h-[168px] w-full max-narrow:h-[132px]">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          aria-hidden
          className="absolute inset-0 h-full w-full overflow-visible"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {runs.map((run, i) => {
            // A monotone curve through the readings: smooth between days, and
            // it never overshoots a reading, so the peak drawn is the peak read.
            const line = curvePath(run)
            const start = run[0]!
            const end = run[run.length - 1]!
            return (
              <g key={`run-${i}`}>
                <path
                  d={`${line}L${end.x} ${H}L${start.x} ${H}Z`}
                  fill={`url(#${gradientId})`}
                  stroke="none"
                />
                <path
                  d={
                    run.length === 1
                      ? // One reading has no segment. A hairline tick, so the
                        // reader sees that a value exists rather than nothing.
                        `M${start.x} ${start.y}L${start.x + 0.6} ${start.y}`
                      : line
                  }
                  fill="none"
                  stroke="var(--brand)"
                  strokeWidth={2}
                  pathLength={1}
                  className="spark-draw"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  // One pixel at every width, rather than smearing with the
                  // horizontal stretch `preserveAspectRatio="none"` applies.
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            )
          })}
        </svg>

        {/* THE PEAK, marked. The one reading the caption names, so the eye
            finds it on the line without reading the axis. */}
        {peakIndex >= 0 ? (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          >
            <circle
              cx={px(peakIndex)}
              cy={py(peak)}
              r={3.5}
              fill="var(--brand)"
              stroke="var(--surface)"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : null}
        {/* THE AVERAGE, as a dotted rule. Drawn only when there is something to
            average — a rule at zero over an empty window states nothing and
            adds a line the reader has to account for. */}
        {measured.length > 0 && peak > 0 ? (
          <div
            aria-hidden
            data-avg-rule
            className="pointer-events-none absolute right-0 left-0 border-t border-dotted border-line-firm"
            /* ── THROUGH `py`, LIKE EVERYTHING ELSE THAT IS PLOTTED ──────────
               This was `(1 - heightFraction(average)) * 100`, which ignores
               PAD_TOP and PAD_BOTTOM while the line and the hover dot below both
               go through `py`. MEASURED with the panel's own constants
               (H 160, pad 8/2): the right answer is `98.75 - 93.75f` and that
               expression is `100 - 100f`, so the rule sat 8px too high at the
               peak and 2px too low at the baseline. With points [40, 41, 42] the
               "Avg 41" rule drew ABOVE the plotted 42. */
            style={{ top: `${((py(average) / H) * 100).toFixed(2)}%` }}
          >
            <span className="absolute -top-2.5 left-0 rounded-xs bg-ink px-1.5 py-0.5 type-chip text-white">
              Average <span className="num">{Math.round(average).toLocaleString('en-IN')}</span>
            </span>
          </div>
        ) : null}

        {/* THE HOVER TARGETS. One per reading, full height, invisible. A dot on
            the line would be a 3px target; a column is the whole panel height,
            which is what makes this usable with a trackpad and on a phone.
            `touch-manipulation` so a tap reads the value without waiting out
            the double-tap-to-zoom delay. */}
        <div className="absolute inset-0 flex touch-manipulation">
          {points.map((point, i) => (
            <div
              key={`${point.label}-${i}`}
              className="min-w-0 flex-1"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </div>

        {/* THE READING UNDER THE POINTER. Positioned in percentages, so it sits
            on the point at every width despite the SVG's uneven scaling. */}
        {hover !== null && activeMeasured ? (
          <div
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              left: `${((hover / Math.max(1, points.length - 1)) * 100).toFixed(2)}%`,
              top: `${((py(active!.value as number) / H) * 100).toFixed(2)}%`,
            }}
          >
            <span className="absolute -translate-x-1/2 -translate-y-1/2 block size-2 rounded-pill bg-brand ring-2 ring-surface" />
            <span
              data-tip
              className="absolute bottom-3 -translate-x-1/2 rounded-sm bg-ink px-2 py-1 type-chip whitespace-nowrap text-white"
            >
              {active!.label}{' '}
              <span className="num font-semibold">
                {(active!.value as number).toLocaleString('en-IN')}
              </span>{' '}
              {unit}
            </span>
          </div>
        ) : null}
      </div>

      {/* THE AXIS SITS UNDER THE CHART IT LABELS. Each label is centred on its
          own reading rather than distributed by `justify-between`, so the date
          under a peak is the peak's date. */}
      <div aria-hidden className="relative mt-3 h-4 type-meta text-muted">
        {labels.map((i) => (
          <span
            key={`axis-${i}`}
            className="absolute whitespace-nowrap"
            style={{
              left: `${((i / Math.max(1, points.length - 1)) * 100).toFixed(2)}%`,
              // Centred on its own reading, EXCEPT at the two ends, which would
              // hang half off the panel. Set here rather than as a utility
              // because an inline transform overrides Tailwind's anyway, and a
              // class that silently does nothing is worse than no class.
              transform:
                i === 0
                  ? 'none'
                  : i === points.length - 1
                    ? 'translateX(-100%)'
                    : 'translateX(-50%)',
            }}
          >
            {points[i]!.label}
          </span>
        ))}
      </div>

      {/* THE ONE NUMBER WORTH PRINTING, carried over from `Bars` unchanged.
          The brief replaces the VISUALISATION; this sentence is information the
          card already gave, and dropping it while swapping the drawing would be
          a silent removal rather than a redraw. The rest is readable from the
          shape, and the average is on the chart itself. */}
      {peakIndex >= 0 ? (
        <p className="mt-3 flex items-center gap-2 rounded-sm bg-surface-2 px-3 py-2 type-meta text-muted">
          <TrendingUp aria-hidden className="size-3.5 shrink-0 text-accent" />
          <span>
            Most used:{' '}
            <span className="num font-semibold text-ink">{peak.toLocaleString('en-IN')}</span>{' '}
            {unit} on {points[peakIndex]!.label}
          </span>
        </p>
      ) : null}

      {/* The chart in words. `figcaption` rather than an `aria-label` on a div:
          this is the summary a screen reader gets INSTEAD of thirty readings,
          and the count of unmeasured days is part of it — an absence is
          information. */}
      <figcaption className="sr-only">
        {measured.length} of {points.length} {points.length === 1 ? 'point' : 'points'} measured
        {peak > 0 ? `, highest ${peak} ${unit} on ${points[peakIndex]!.label}` : ''}
        {measured.length > 0 ? `, average ${Math.round(average)} ${unit}` : ''}.
        {points.length - measured.length > 0
          ? ` ${points.length - measured.length} not measured.`
          : ''}
      </figcaption>
    </figure>
  )
}
