import { coverageNote, type GateHistory, type GateStatus } from '@/lib/ops/gate-history'
import { cn } from '@/lib/utils'

/**
 * Gate health per suite over time (doc 13 §12, SL-042).
 *
 * A strip of day cells per suite rather than a line chart, because the data is
 * a STATE per day, not a quantity — and because it makes the gap rule physical:
 * a day a suite did not run is an empty cell you can see through. There is no
 * line to accidentally join across it, so the chart cannot claim evidence that
 * does not exist.
 *
 * Status colours are reserved (crimson = failed, never "series 2") and never
 * carry meaning alone: every row names its latest verdict in words, and every
 * cell has a title.
 */

const CELL: Record<GateStatus, string> = {
  pass: 'bg-ok',
  fail: 'bg-danger',
  blocked: 'bg-danger',
}

const VERDICT_LABEL: Record<GateStatus, string> = {
  pass: 'passing',
  fail: 'failing',
  blocked: 'blocked',
}

export function GateChart({ history }: { history: GateHistory }) {
  const measured = history.series.filter((series) => series.measuredDays > 0)

  return (
    <div className="space-y-2">
      <p className="text-[12px] text-muted">{history.windowLabel}</p>

      <ul className="space-y-1.5">
        {history.series.map((series) => (
          <li key={series.suite} className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-[12px] font-semibold">{series.suite}</span>

            <ul className="flex flex-1 gap-[2px]" aria-label={`${series.suite} by day`}>
              {series.days.map((day) => (
                <li
                  key={day.day}
                  title={
                    day.status === null
                      ? `${day.day} — did not run`
                      : `${day.day} — ${VERDICT_LABEL[day.status]}`
                  }
                  className={cn(
                    'h-4 flex-1 rounded-[2px]',
                    // A gap is an outline you can see through, never a fill.
                    day.status === null ? 'border border-dashed border-line' : CELL[day.status],
                  )}
                />
              ))}
            </ul>

            {/* Never colour alone. */}
            <span
              className={cn(
                'w-24 shrink-0 text-right text-[12px] tabular-nums',
                series.latest === null && 'text-muted',
                series.latest === 'pass' && 'text-ok',
                series.latest !== null && series.latest !== 'pass' && 'text-danger',
              )}
            >
              {series.latest === null
                ? 'never ran'
                : `${VERDICT_LABEL[series.latest]} · ${series.measuredDays}d`}
            </span>
          </li>
        ))}
      </ul>

      <p className="text-[12px] text-muted">{coverageNote(history)}</p>

      {measured.length > 0 && measured.every((series) => !series.enoughForTrend) ? (
        <p className="text-[12px] text-warn">
          No suite has five measured days yet — read these as individual runs, not a trend.
        </p>
      ) : null}
    </div>
  )
}
