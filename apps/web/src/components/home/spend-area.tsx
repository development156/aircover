import { ChartEmpty, CoverageNote } from './chart-empty'
import type { SpendRead } from '@/lib/home/spend'
import { credits } from '@/lib/credit-words'

/**
 * Credit spend over the window, as an area chart. Hand-rolled SVG — no chart
 * library, by design: two paths and a viewBox are less code than a dependency's
 * config object, and nothing here needs to be configurable.
 *
 * It re-themes for free because both paths paint with `var(--brand)`, which the
 * Brand Skin overrides upstream. There is no per-theme branch to keep in sync.
 *
 * The viewBox is scaled non-uniformly so the chart fills whatever width it is
 * given; `vector-effect="non-scaling-stroke"` keeps the line one pixel at every
 * size rather than smearing with the horizontal stretch.
 */

/** Internal coordinate space. Rendered width comes from CSS, not from these. */
const W = 300
const H = 90
/** Headroom so a peak is never clipped flat against the top edge. */
const PEAK_PAD = 1.08

export function SpendArea({ spend }: { spend: SpendRead }) {
  if (spend.status !== 'ok' || spend.days.length === 0) {
    return (
      <ChartEmpty
        status={spend.status === 'unreadable' ? 'unreadable' : 'empty'}
        empty="No credits spent yet. Your first AI action will show up here."
      />
    )
  }

  const values = spend.days.map((day) => day.credits)

  /* ── TOO LITTLE HISTORY TO BE A SHAPE ──────────────────────────────────────
     A line needs somewhere to go. With one active day in thirty, this drew 29
     points at an identical y and one spike at the right edge — MEASURED, and it
     reads as a rendering fault rather than as a chart. No axis weight, grid
     density or line treatment fixes that; the series simply has no shape yet.

     Three is the floor because two points are a straight line between them,
     which says nothing a number does not say better. Below it, the card states
     the figure and what it is waiting for, which is the honest version of the
     same information.

     `activeDays` is a real count of days that had spend — read, never invented.
     The days themselves ARE data: "you spent nothing on 29 days" is true. It is
     just not a trend, and drawing it as one overstates what happened. */
  const activeDays = values.filter((v) => v > 0).length
  if (activeDays < 3) {
    return (
      <div data-testid="spend-sparse" className="grid min-h-[120px] place-items-center px-3">
        <p className="max-w-[40ch] text-center type-meta text-muted">
          {activeDays === 0
            ? 'No credits spent in the last 30 days.'
            : `Spend shows as a trend once a few days have activity. So far ${activeDays === 1 ? 'one day has' : `${activeDays} days have`}.`}
        </p>
      </div>
    )
  }
  // A genuine all-zero window still plots — those days were read and really had
  // no spend, which is different from having no data. The `|| 1` only avoids a
  // divide-by-zero; it never invents height.
  const peak = Math.max(...values) * PEAK_PAD || 1
  const step = values.length > 1 ? W / (values.length - 1) : W

  const points = values.map((value, index) => {
    const x = values.length > 1 ? index * step : W / 2
    const y = H - (value / peak) * H
    return `${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`
  })

  const line = `M${points.join('L')}`
  const area = `${line}L${W},${H}L0,${H}Z`

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Credit spend over the last ${spend.days.length} days. ${credits(spend.total)} total.`}
        className="h-[120px] w-full"
      >
        <path data-testid="spend-area-fill" d={area} fill="var(--brand)" fillOpacity={0.14} />
        <path
          data-testid="spend-area-line"
          d={line}
          fill="none"
          stroke="var(--brand)"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <CoverageNote coveredFrom={spend.capped ? spend.coveredFrom : null} />
    </div>
  )
}
