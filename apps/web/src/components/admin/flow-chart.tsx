import {
  FLOW_CAVEAT,
  FLOW_STAGES,
  FLOW_STAGE_LABEL,
  type FlowHistory,
  type FlowStage,
} from '@/lib/ops/flow-history'

/**
 * Cumulative flow (SL-042). Hand-rolled SVG, matching `home/spend-area.tsx`:
 * no chart library, by design.
 *
 * The four columns are an ORDERED sequence, not four categories, so they take
 * one hue light→dark rather than four different hues. That is both truer to the
 * data and colour-blind safe by construction — lightness separates where hue
 * would not. Every step is an L1 Brand Skin token, so the chart re-themes with
 * the workspace and there is no per-theme branch to keep in sync.
 *
 * Below five days it draws BARS, not an area. A line through four points is a
 * trend claim the data cannot support, and the rule is easier to keep when the
 * chart simply cannot render one.
 */

const W = 320
const H = 120
/** A 2px surface-coloured gap so adjacent bands never bleed into each other. */
const SEPARATOR = 2

const FILL: Record<FlowStage, string> = {
  done: 'var(--pstrong)',
  review: 'var(--p)',
  in_progress: 'var(--t300)',
  todo: 'var(--t100)',
}

interface FlowChartProps {
  history: FlowHistory
}

export function FlowChart({ history }: FlowChartProps) {
  if (history.days.length === 0) {
    return (
      <p className="text-[13px] text-muted">
        No tasks yet, so there is no flow to draw. The first card will start this.
      </p>
    )
  }

  const peak = Math.max(...history.days.map((day) => day.total)) || 1
  const step = history.days.length > 1 ? W / (history.days.length - 1) : W
  const y = (value: number) => H - (value / peak) * H

  /** Running totals bottom-up, so each band sits on the one below it. */
  const bands = FLOW_STAGES.map((stage, index) => {
    const below = FLOW_STAGES.slice(0, index)
    return {
      stage,
      points: history.days.map((day, i) => {
        const base = below.reduce((sum, s) => sum + day.counts[s], 0)
        return {
          x: history.days.length > 1 ? i * step : W / 2,
          base,
          top: base + day.counts[stage],
        }
      }),
    }
  })

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Cumulative flow over ${history.windowLabel}. ${history.days.at(-1)!.total} tasks total.`}
        className="h-32 w-full"
      >
        {history.enoughForTrend
          ? bands.map((band) => (
              <path
                key={band.stage}
                d={[
                  `M ${band.points[0]!.x} ${y(band.points[0]!.base)}`,
                  ...band.points.map((point) => `L ${point.x} ${y(point.top)}`),
                  ...[...band.points].reverse().map((point) => `L ${point.x} ${y(point.base)}`),
                  'Z',
                ].join(' ')}
                fill={FILL[band.stage]}
                stroke="var(--canvas)"
                strokeWidth={SEPARATOR}
                vectorEffect="non-scaling-stroke"
              />
            ))
          : bands.map((band) =>
              band.points.map((point, i) => {
                const height = y(point.base) - y(point.top)
                if (height <= 0) return null
                const width = Math.max(W / history.days.length - 6, 4)
                return (
                  <rect
                    key={`${band.stage}-${i}`}
                    x={point.x - width / 2}
                    y={y(point.top)}
                    width={width}
                    height={height}
                    fill={FILL[band.stage]}
                    stroke="var(--canvas)"
                    strokeWidth={SEPARATOR}
                    vectorEffect="non-scaling-stroke"
                  />
                )
              }),
            )}
      </svg>

      <figcaption className="mt-2 space-y-1">
        {/* Legend: identity is never colour alone. */}
        <ul className="flex flex-wrap gap-x-3 gap-y-1">
          {[...FLOW_STAGES].reverse().map((stage) => (
            <li key={stage} className="flex items-center gap-1.5 text-[12px] text-muted">
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 rounded-[2px]"
                style={{ background: FILL[stage] }}
              />
              {FLOW_STAGE_LABEL[stage]}
              <span className="tabular-nums">{history.days.at(-1)!.counts[stage]}</span>
            </li>
          ))}
        </ul>

        <p className="text-[12px] text-muted">{history.windowLabel}</p>

        {/* The rule, said out loud when it bites. */}
        {!history.enoughForTrend ? (
          <p className="text-[12px] text-warn">
            Fewer than five days of history — drawn as daily totals, not a trend.
          </p>
        ) : null}

        <p className="text-[12px] text-muted">{FLOW_CAVEAT}</p>
      </figcaption>
    </figure>
  )
}
