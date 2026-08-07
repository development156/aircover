import { ChartEmpty, CoverageNote } from './chart-empty'
import type { SpendRead } from '@/lib/home/spend'

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
        aria-label={`Credit spend over the last ${spend.days.length} days. ${spend.total} credits total.`}
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
