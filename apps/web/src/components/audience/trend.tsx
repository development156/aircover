import type { FollowerDay } from '@/lib/audience/page-data'

/**
 * The follower record Sahoda has kept, drawn with its gaps intact.
 *
 * ── WHY THIS EXISTS WHEN INSTAGRAM ALSO ANSWERS IT ───────────────────────────
 * Instagram will hand back thirty days of follower counts on request. It will not
 * hand back the thirty-first, and it will never hand back who those followers
 * were on any past day. This chart is drawn from `audience_snapshots` rather than
 * from the live call because the stored record is the one that keeps growing, and
 * because a chart drawn from a live call would quietly reset its own history every
 * month.
 *
 * ── A MISSING DAY IS A GAP, NOT A ZERO, AND NOT A STRAIGHT LINE ──────────────
 * Two wrong answers were available and both are refused. Drawing a zero would say
 * the account lost every follower that day. Joining across the gap would draw a
 * smooth line through a day nobody measured, which is a claim about the customer's
 * business that no query can produce.
 *
 * So the series is drawn as SEGMENTS between consecutive days only, and a day with
 * no measurement leaves a visible break. Every point is a day a platform actually
 * answered on.
 */

/** One pixel grid. Fixed viewBox, scaled by CSS — an SVG has no layout of its own. */
const W = 600
const H = 96
const PAD = 4

function isNextDay(a: string, b: string): boolean {
  const one = Date.parse(`${a}T00:00:00Z`)
  const two = Date.parse(`${b}T00:00:00Z`)
  if (!Number.isFinite(one) || !Number.isFinite(two)) return false
  return two - one === 86_400_000
}

export function FollowerTrend({ days }: { days: FollowerDay[] }) {
  if (days.length === 0) return null

  const values = days.map((d) => d.followers)
  const max = Math.max(...values)
  const min = Math.min(...values)
  // A flat series has no range to scale against. Drawing it against its own
  // single value would put the line at the top or the bottom of the box and imply
  // a maximum or a collapse; it sits in the middle instead, which is what "it has
  // not changed" looks like.
  const span = max - min || 1

  const x = (i: number): number =>
    days.length === 1 ? W / 2 : PAD + (i * (W - PAD * 2)) / (days.length - 1)
  const y = (v: number): number =>
    max === min ? H / 2 : H - PAD - ((v - min) / span) * (H - PAD * 2)

  /** Only consecutive days are joined. A break in the record is a break in the line. */
  const segments: string[] = []
  for (let i = 1; i < days.length; i += 1) {
    const prev = days[i - 1]
    const here = days[i]
    if (prev === undefined || here === undefined) continue
    if (!isNextDay(prev.day, here.day)) continue
    segments.push(`M ${x(i - 1)} ${y(prev.followers)} L ${x(i)} ${y(here.followers)}`)
  }

  const first = days[0]
  const last = days[days.length - 1]
  const change = last && first ? last.followers - first.followers : 0

  return (
    <div className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={
          `Followers on each day Sahoda collected: ` +
          days.map((d) => `${d.day}, ${d.followers}`).join('; ')
        }
        className="h-24 w-full"
      >
        {segments.map((d) => (
          <path
            key={d}
            d={d}
            fill="none"
            stroke="var(--brand)"
            strokeWidth={2}
            strokeLinecap="round"
          />
        ))}
        {days.map((day, i) => (
          <circle
            key={day.day}
            cx={x(i)}
            cy={y(day.followers)}
            r={2.5}
            fill="var(--brand)"
            // Every dot is a day a platform answered on. A day with no answer has
            // no dot, which is the honest record of what was collected.
          />
        ))}
      </svg>

      {/* Two rows, never `justify-between` on three items. At 390 that wrapped the
          end date onto its own line under the start date and read as a broken
          list — the dates belong to the axis, the change belongs to the reader,
          and only the first pair is a range. */}
      <div className="type-sm flex flex-col gap-0.5 text-muted">
        <div className="flex items-baseline justify-between gap-3">
          <span className="num">{first?.day}</span>
          <span className="num">{last?.day}</span>
        </div>
        <p>
          {change === 0
            ? 'No change across the days kept'
            : `${change > 0 ? '+' : ''}${change.toLocaleString()} across the days kept`}
        </p>
      </div>
    </div>
  )
}
