/**
 * Two small charts for a stat cell: a line for a quantity that moves through
 * time, and a row of bars for a count per bucket. Server-safe (no hooks), one
 * accent (`var(--brand)`), and both draw the theme's own ink for the axis, so
 * they read on the light and the dark surface alike.
 *
 * ── WHAT THEY MAY NEVER DO ───────────────────────────────────────────────────
 * Invent a point. A `null` in the line's series is a day nothing was read for
 * and it breaks the path; a run of measured zeroes is drawn flat at the floor,
 * because a real zero is knowledge. The bars never fabricate a scale: an
 * all-zero row draws its stubs at the baseline, and that is the picture.
 *
 * ── THE DRAW-IN ──────────────────────────────────────────────────────────────
 * The line is revealed once, left to right, by `.spark-draw` (globals.css),
 * which animates `stroke-dashoffset` over `pathLength="1"`. It is a reveal of
 * something already there, not a gate on it: the path exists in the markup,
 * the global reduced-motion rule collapses the animation to 10ms, and a
 * headless renderer sees the finished line.
 */

import { curvePath } from './trend-area'

const W = 120
const H = 28
const PAD = 2

function scale(values: readonly (number | null)[]) {
  const measured = values.filter((v): v is number => v !== null)
  const min = Math.min(...measured)
  const max = Math.max(...measured)
  const span = max - min || 1
  // Inset by the endpoint's radius so the dot is never clipped by a cell
  // that hides its overflow (the board does).
  const inset = 3
  const step = values.length > 1 ? (W - inset * 2) / (values.length - 1) : 0
  return {
    x: (i: number) => (values.length > 1 ? inset + i * step : W / 2),
    // A flat series sits mid-height rather than on the floor, so a wallet that
    // did not move is a level line and not a line hugging the axis.
    y: (v: number) => (max === min ? H / 2 : PAD + (1 - (v - min) / span) * (H - PAD * 2)),
    min,
    max,
    measured: measured.length,
  }
}

export function Sparkline({
  values,
  label,
  className,
}: {
  /** Oldest first. `null` is an unread day and breaks the line. */
  values: readonly (number | null)[]
  /** The accessible sentence. Say what the series is and what it did. */
  label: string
  className?: string
}) {
  const s = scale(values)
  if (s.measured === 0) return null

  // Runs of consecutive measured points; a null starts a new run.
  const runs: { x: number; y: number }[][] = []
  let current: { x: number; y: number }[] = []
  values.forEach((v, i) => {
    if (v === null) {
      if (current.length) runs.push(current)
      current = []
      return
    }
    current.push({ x: s.x(i), y: s.y(v) })
  })
  if (current.length) runs.push(current)
  // The same monotone curve the spend chart draws: smooth, never overshooting.
  const line = (run: { x: number; y: number }[]) => curvePath(run)

  const lastIndex = values.length - 1
  const last = values[lastIndex]

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
      className={className ?? 'h-7 w-full overflow-visible'}
      preserveAspectRatio="none"
      style={{ color: 'var(--brand)' }}
    >
      {runs.map((run, i) => (
        <g key={i}>
          <path
            d={`${line(run)} L${run[run.length - 1]!.x.toFixed(1)},${H} L${run[0]!.x.toFixed(1)},${H} Z`}
            fill="currentColor"
            fillOpacity={0.1}
            stroke="none"
          />
          <path
            d={line(run)}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            pathLength={1}
            className="spark-draw"
          />
        </g>
      ))}
      {last !== null && last !== undefined ? (
        <circle cx={s.x(lastIndex)} cy={s.y(last)} r={2.5} fill="currentColor" />
      ) : null}
    </svg>
  )
}

export function MiniBars({
  values,
  label,
  emphasis,
  className,
}: {
  /** One bar per bucket, in order. Zero draws a stub at the baseline. */
  values: readonly number[]
  label: string
  /** Index of the bucket to draw in the accent; the rest are ink at low opacity. */
  emphasis?: number
  className?: string
}) {
  if (values.length === 0) return null
  const peak = Math.max(0, ...values)
  const gap = 3
  const bar = (W - gap * (values.length - 1)) / values.length
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
      className={className ?? 'h-7 w-full'}
      preserveAspectRatio="none"
    >
      {values.map((v, i) => {
        const h = peak === 0 ? 0 : (v / peak) * (H - PAD)
        const x = i * (bar + gap)
        return (
          <g key={i}>
            {/* The stub: a 2px baseline mark so an empty bucket is still a bucket. */}
            <rect x={x} y={H - 2} width={bar} height={2} fill="var(--line)" />
            {h > 0 ? (
              <rect
                x={x}
                y={H - h}
                width={bar}
                height={h}
                rx={1}
                fill={i === emphasis ? 'var(--brand)' : 'var(--ink)'}
                fillOpacity={i === emphasis ? 1 : 0.55}
                className="bar-grow"
                style={{ animationDelay: `${i * 40}ms` }}
              />
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}
