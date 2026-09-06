import { cn } from '@/lib/utils'

/**
 * A SMOOTH FILLED AREA. The reference's balance chart, and its two refusals.
 *
 * ── WHY THE CURVE IS MONOTONE CUBIC AND NOT A CATMULL-ROM ────────────────────
 * "Smooth" is the reference's look and the obvious way to get it is a
 * Catmull-Rom spline, which is four lines of code. It OVERSHOOTS: between a
 * high point and a low one it dips below both, so a series that goes 40, 0, 40
 * draws a curve that passes through roughly -12. On this product's charts that
 * is not a cosmetic wobble — it is a rendered reading of a value nobody
 * measured, in a component whose whole job is to refuse those.
 *
 * Fritsch-Carlson monotone cubic interpolation has exactly the property needed:
 * the curve is monotone on every interval where the data is, so it never leaves
 * the range of the two points it joins. Same look, no invented minimum.
 *
 * ── AND THE PATH BREAKS ACROSS A GAP ─────────────────────────────────────────
 * The same rule `performance-over-time.tsx` already states: a segment is drawn
 * only between points that are ADJACENT in the series. A line spanning a
 * two-day outage is indistinguishable from two real readings, which is the same
 * lie as plotting a zero, told with better manners. Each run of adjacent points
 * gets its own path and its own fill.
 *
 * ── THE FILL IS A GRADIENT AND THAT IS ITS ONLY JOB ──────────────────────────
 * Brand at 18% fading to nothing. It is not a second data channel and it
 * carries no meaning: it exists so the line has a body and the panel reads as
 * a chart rather than as a wire. `--brand` re-themes with the tenant, so there
 * is no per-theme branch here — the same reason SpendArea has none.
 */

const W = 600
const H = 160
/** Headroom, so the peak is never clipped flat against the top edge. */
const PAD_TOP = 10
const PAD_BOTTOM = 4

export interface TrendPoint {
  /** Position on the x axis in its own unit — a day number, an index. */
  x: number
  y: number
  label: string
}

/**
 * Fritsch-Carlson tangents. Exported so `trend-area.test.ts` can hold the
 * no-overshoot property directly rather than inferring it from a path string.
 */
export function monotoneTangents(xs: readonly number[], ys: readonly number[]): number[] {
  const n = xs.length
  if (n < 2) return new Array(n).fill(0)

  const slopes: number[] = []
  for (let i = 0; i < n - 1; i += 1) {
    const dx = xs[i + 1]! - xs[i]!
    slopes.push(dx === 0 ? 0 : (ys[i + 1]! - ys[i]!) / dx)
  }

  const m: number[] = new Array(n).fill(0)
  m[0] = slopes[0]!
  m[n - 1] = slopes[n - 2]!
  for (let i = 1; i < n - 1; i += 1) {
    const a = slopes[i - 1]!
    const b = slopes[i]!
    // A local maximum or minimum gets a FLAT tangent. This is the clause that
    // stops the curve sailing past a peak and coming back — without it the
    // spline can draw a value higher than anything in the series.
    m[i] = a * b <= 0 ? 0 : (a + b) / 2
  }
  // Fritsch-Carlson: no tangent may exceed three times the smaller adjacent
  // slope, which is what bounds the curve inside its own data.
  for (let i = 0; i < n - 1; i += 1) {
    const s = slopes[i]!
    if (s === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const a = m[i]! / s
    const b = m[i + 1]! / s
    const h = Math.hypot(a, b)
    if (h > 3) {
      m[i] = (3 / h) * a * s
      m[i + 1] = (3 / h) * b * s
    }
  }
  return m
}

/** One run of adjacent points, as a bezier path through them. */
export function curvePath(pts: readonly { x: number; y: number }[]): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) {
    // A single point has no curve. Drawn as a hairline tick so the reader can
    // see that a reading exists there rather than seeing nothing at all.
    const p = pts[0]!
    return `M${p.x.toFixed(1)} ${p.y.toFixed(1)}L${(p.x + 0.6).toFixed(1)} ${p.y.toFixed(1)}`
  }
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const m = monotoneTangents(xs, ys)
  let d = `M${xs[0]!.toFixed(1)} ${ys[0]!.toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i += 1) {
    const h = xs[i + 1]! - xs[i]!
    const c1x = xs[i]! + h / 3
    const c1y = ys[i]! + (m[i]! * h) / 3
    const c2x = xs[i + 1]! - h / 3
    const c2y = ys[i + 1]! - (m[i + 1]! * h) / 3
    d +=
      `C${c1x.toFixed(1)} ${c1y.toFixed(1)},` +
      `${c2x.toFixed(1)} ${c2y.toFixed(1)},` +
      `${xs[i + 1]!.toFixed(1)} ${ys[i + 1]!.toFixed(1)}`
  }
  return d
}

export function TrendArea({
  points,
  unit,
  pointNoun = 'readings',
  gradientId,
  className,
}: {
  /** Already filtered to MEASURED readings. An absent day is simply absent. */
  points: readonly TrendPoint[]
  unit: string
  /**
   * What one point IS, for the accessible summary — "days", "readings".
   *
   * A chart of daily snapshots and a chart of per-post readings are different
   * claims, and the sentence a screen reader gets is the only place that
   * difference is stated. Defaulted rather than required so a caller that has
   * not thought about it says the vaguer, safer thing.
   */
  pointNoun?: string
  /**
   * Unique per instance. Two `<linearGradient id="x">` on one document is one
   * gradient, and the second chart silently borrows the first's — invisible
   * until the two charts have different colours, at which point it looks like a
   * theming bug rather than a duplicate id.
   */
  gradientId: string
  className?: string
}) {
  if (points.length === 0) return null

  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const first = Math.min(...xs)
  const span = Math.max(1, Math.max(...xs) - first)
  const top = Math.max(...ys)
  const bottom = Math.min(...ys)
  const range = top - bottom

  const px = (x: number) => ((x - first) / span) * W
  // A flat series has no range to scale against, so it is drawn down the middle
  // rather than divided by zero or stretched into variation it does not have.
  const py = (y: number) =>
    range === 0 ? H / 2 : H - PAD_BOTTOM - ((y - bottom) / range) * (H - PAD_TOP - PAD_BOTTOM)

  // Split into runs of ADJACENT points. `x` is the caller's own unit, so
  // adjacency is "differs by one" — a day number, an index.
  const runs: { x: number; y: number }[][] = []
  points.forEach((point, i) => {
    const scaled = { x: px(point.x), y: py(point.y) }
    if (i > 0 && point.x - points[i - 1]!.x === 1) runs[runs.length - 1]!.push(scaled)
    else runs.push([scaled])
  })

  const peak = points.reduce((best, p) => (p.y > best.y ? p : best), points[0]!)

  return (
    <figure className={cn('flex flex-col', className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${points.length} measured ${pointNoun}, highest ${peak.y.toLocaleString('en-IN')} ${unit} on ${peak.label}.`}
        className="h-[168px] w-full max-narrow:h-[132px]"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {runs.map((run, i) => {
          const d = curvePath(run)
          if (!d) return null
          const startX = run[0]!.x
          const endX = run[run.length - 1]!.x
          return (
            <g key={`run-${i}`}>
              <path d={`${d}L${endX} ${H}L${startX} ${H}Z`} fill={`url(#${gradientId})`} />
              <path
                d={d}
                fill="none"
                stroke="var(--brand)"
                strokeWidth={2}
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
      <figcaption className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 type-meta text-muted">
        <span>{points[0]!.label}</span>
        <span>
          Highest{' '}
          <span className="num font-semibold text-ink">{peak.y.toLocaleString('en-IN')}</span>{' '}
          {unit} on {peak.label}
        </span>
        <span>{points[points.length - 1]!.label}</span>
      </figcaption>
    </figure>
  )
}
