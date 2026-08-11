import type { SeriesPoint } from '@/lib/analytics/account-insights'

/**
 * Follower count over the window.
 *
 * Follows `SpendArea`'s idiom — hand-rolled SVG painting with `var(--brand)`, so it
 * re-themes with the Brand Skin and has no per-theme branch to keep in sync.
 *
 * ── WHAT IT REFUSES TO DRAW ──────────────────────────────────────────────────
 * A trend. Specifically: a single point is not a trend, and the Home version of this
 * chart says "No change over 1 day" beneath one — a sentence with three claims in it
 * (that there were two readings, that they were equal, and that a day separated
 * them) when the data supports none. Instagram's follower history is a daily
 * snapshotter (`dataDelay`: "Up to 24 hours old"), so a new account genuinely has
 * one point for its first day.
 *
 * A one-point window therefore renders the READING and says so, with no line, no
 * change figure and no axis. There is nothing dishonest about one number; the
 * dishonesty was the vocabulary of change wrapped around it.
 */

/** Internal coordinate space. Rendered size comes from CSS. */
const W = 300
const H = 96

export function FollowerChart({ points }: { points: readonly SeriesPoint[] }) {
  const values = points.map((p) => p.value)
  const last = values[values.length - 1]

  if (last === undefined) return null

  // One reading is a reading, not a trend. See the note above.
  if (values.length === 1) {
    return (
      <div className="space-y-1">
        <p className="text-[28px] leading-8 font-bold tabular-nums text-ink">
          {last.toLocaleString('en-IN')}
        </p>
        <p className="text-[12px] text-muted">
          One day of history so far — not enough to show a trend.
        </p>
      </div>
    )
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  // A flat window is real data, not a divide-by-zero. Render it flat, centred.
  const span = max - min || 1
  const step = W / (values.length - 1)

  const coords = values.map((value, index) => {
    const x = index * step
    const y = max === min ? H / 2 : H - ((value - min) / span) * H
    return `${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`
  })

  const first = values[0] ?? 0
  const change = last - first
  const days = points.length

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[28px] leading-8 font-bold tabular-nums text-ink">
          {last.toLocaleString('en-IN')}
        </span>
        <span className="text-[13px] tabular-nums text-muted">
          {change === 0 ? 'No change' : `${change > 0 ? '+' : ''}${change.toLocaleString('en-IN')}`}{' '}
          across {days} days
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Followers across ${days} days, from ${first.toLocaleString('en-IN')} on ${points[0]?.date} to ${last.toLocaleString('en-IN')} on ${points[days - 1]?.date}.`}
        className="h-[96px] w-full"
      >
        <path
          d={`M${coords.join('L')}`}
          fill="none"
          stroke="var(--brand)"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* The y-axis is scaled to the window's own min and max, not to zero —
          follower counts do not start at zero and a zero baseline flattens every
          real movement. An unlabelled zoomed axis is its own lie, so both ends
          are printed, and so are both dates. */}
      <div className="flex justify-between text-[11px] tabular-nums text-muted">
        <span>
          {points[0]?.date} · {min.toLocaleString('en-IN')}
        </span>
        <span>
          {points[days - 1]?.date} · {max.toLocaleString('en-IN')}
        </span>
      </div>
    </div>
  )
}

/**
 * Gains and losses over the same window.
 *
 * Rendered as two totals rather than a second chart, and NEVER derived by
 * differencing the follower count: `seriesFrom` drops any point it cannot narrow,
 * and a difference taken across a dropped day reports a change that never happened.
 * These are Instagram's own `followers_gained` / `followers_lost` series or nothing.
 *
 * Their window can be SHORTER than the count's — three days against four in the
 * 2026-08-11 recording — so the day count is stated here rather than inherited from
 * the chart above it.
 */
export function FollowerFlow({
  gained,
  lost,
}: {
  gained: readonly SeriesPoint[]
  lost: readonly SeriesPoint[]
}) {
  if (gained.length === 0 && lost.length === 0) return null

  const sum = (points: readonly SeriesPoint[]) => points.reduce((total, p) => total + p.value, 0)
  const days = Math.max(gained.length, lost.length)

  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-1">
      {gained.length > 0 ? (
        <div>
          <dt className="text-[12px] text-muted">Gained</dt>
          <dd className="text-[15px] font-semibold tabular-nums text-ink">
            +{sum(gained).toLocaleString('en-IN')}
          </dd>
        </div>
      ) : null}
      {lost.length > 0 ? (
        <div>
          <dt className="text-[12px] text-muted">Lost</dt>
          <dd className="text-[15px] font-semibold tabular-nums text-ink">
            −{sum(lost).toLocaleString('en-IN')}
          </dd>
        </div>
      ) : null}
      <div>
        <dt className="text-[12px] text-muted">Over</dt>
        <dd className="text-[15px] font-semibold tabular-nums text-ink">
          {days} {days === 1 ? 'day' : 'days'}
        </dd>
      </div>
    </dl>
  )
}
