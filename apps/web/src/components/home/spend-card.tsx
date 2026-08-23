import Link from 'next/link'

import { Bars, type BarPoint } from '@/components/charts/bars'
import { ChartSparse, Panel, PanelHead } from '@/components/charts/panel'
import { CountUp } from '@/components/motion/count-up'
import { Unreadable } from '@/components/design-system/absence-row'
import type { SpendRead } from '@/lib/home/spend'

import { CoverageNote } from './chart-empty'
import { SpendBars } from './spend-bars'

/**
 * Credits spent, last 30 days.
 *
 * ── THE PANEL THAT APOLOGISED IN PROSE ───────────────────────────────────────
 * MEASURED on `page-dash-before__populated__home__full__1440__light`: a
 * 1030x130 full-width panel whose entire content was one centred sentence —
 * "Spend shows as a trend once a few days have activity. So far one day has." —
 * with the figure it was about set in 13px type in the top-right corner. The
 * founder's verdict names it exactly: a chart that has to apologise in prose
 * should be a number and a sentence.
 *
 * So the FIGURE leads, at `type-hero-num`, and the sentence is one line under
 * it. The number was always the thing worth reading; it was rendered smaller
 * than the apology.
 *
 * ── AND THE SPARSE STATE DRAWS THE AXIS IT IS WAITING TO FILL ────────────────
 * `ChartSparse` rather than a centred paragraph in an empty box. Nothing is
 * invented — no line, no bar, no number — but the reader gets the SHAPE of the
 * thing that is coming and the window's real ends, which is the difference
 * between "not yet" and "broken". See the component.
 *
 * ── THE THREE-DAY FLOOR IS GONE, AND THAT IS NOT A LOOSENING ────────────────
 * `SpendArea` refused to draw below three active days, and its reason was
 * exact: "two points are a straight line between them, which implies a rate of
 * change nothing supports", MEASURED as "29 points at an identical y and one
 * spike at the right edge — it reads as a rendering fault rather than as a
 * chart".
 *
 * Every word of that is an argument about a LINE. A line interpolates: it draws
 * ink where no reading exists, between the points, and with one active day in
 * thirty almost all of its ink is interpolation. Bars do not interpolate. Thirty
 * bars where one is tall and twenty-nine are baseline stubs is a completely
 * readable statement — "you spent on one day" — and it is exactly what the
 * reference's own hours-by-day chart looks like on a quiet fortnight.
 *
 * So the floor was never about how much data there is. It was about the shape
 * doing the drawing, and the shape changed. The CAPTION still says how many
 * days had activity, because "one day" is what stops a reader inferring a trend
 * from a single spike — the floor's real job, kept, now stated in words instead
 * of by withholding the chart.
 *
 * MEASURED before this: `page-dash-after__populated__home__full__1440__light`
 * showed the panel as a number, one sentence, ~90px of nothing, and a dotted
 * baseline — which is a designed apology and still an apology. It now shows the
 * one day that was spent on.
 *
 * ── BARS, NOT AN AREA ────────────────────────────────────────────────────────
 * Every one of the thirty days is MEASURED: the ledger was read for the whole
 * window, and a day with no rows genuinely had no spend. That is the one series
 * on either screen where a zero is knowledge rather than an absence, and `Bars`
 * is the chart that can say so — a measured zero draws a stub at the baseline,
 * where a line chart would draw the same flat run as a gap in the data.
 *
 * ── THE TOTAL: A REAL ZERO IS KNOWLEDGE, AN UNREADABLE ONE IS NOT ────────────
 * `spend.total` is 0 in BOTH the `empty` and the `unreadable` states, and this
 * card used to print it for both — so a read that THREW rendered "0", stating
 * that you spent nothing on the strength of a query that failed. Only
 * `unreadable` is an absence. `empty` is `rows.length === 0` after a SUCCESSFUL
 * read, which means the true answer is zero and we know it.
 */

/** The single category's own label, lower-cased to sit inside a sentence. */
function oneLabel(spend: SpendRead): string {
  const label = spend.byAction[0]?.label ?? 'one action'
  return label.charAt(0).toLowerCase() + label.slice(1)
}

/** "12 Aug" — the window's ends, from days we actually read. */
function dayLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
  }).format(date)
}

export function SpendCard({ spend }: { spend: SpendRead }) {
  const readable = spend.status !== 'unreadable'
  const activeDays = spend.days.filter((day) => day.credits > 0).length
  // Every day in the window was READ, so every day is a measured value. The
  // chart draws whenever there is a window; only a failed read has nothing.
  const hasChart = spend.status === 'ok' && spend.days.length > 0
  const from = spend.days[0] ? dayLabel(spend.days[0].date) : undefined
  const to = spend.days[spend.days.length - 1]
    ? dayLabel(spend.days[spend.days.length - 1]!.date)
    : undefined

  const points: BarPoint[] = spend.days.map((day) => ({
    label: dayLabel(day.date),
    // Never null: every day in this window was read, so every day is measured
    // and a 0 is a real reading of "nothing was charged".
    value: day.credits,
  }))

  return (
    <Panel className="space-y-4" data-guide="home.spend">
      <PanelHead
        title="Credits spent"
        sub="last 30 days"
        trailing={
          <Link
            href="/wallet"
            className="card-link rounded-sm type-meta font-[550] text-muted transition-micro hover:text-accent"
          >
            See activity
          </Link>
        }
      />

      {/* THE NUMBER, at the size the panel is about. */}
      <p className="flex min-h-[44px] flex-wrap items-baseline gap-x-2">
        {readable ? (
          <>
            <span className="type-hero-num num text-ink">
              {/* Settled and historical: a closed 30-day window that will not
                  move while you look at it (docs/26 §8.1). NOT the balance,
                  which is the live figure you act on and does not count. */}
              <CountUp value={spend.total} />
            </span>
            <span className="type-sm text-muted">credits</span>
          </>
        ) : (
          <Unreadable what="Credits spent in the last 30 days" />
        )}
      </p>

      {hasChart ? (
        <>
          <Bars points={points} unit="credits" />
          {/* THE FLOOR'S REAL JOB, IN WORDS. One tall bar in thirty is honest
              and it is not a trend, so the caption says how many days had
              activity rather than the chart withholding itself. Above three the
              shape speaks for itself and this line is not rendered. */}
          {activeDays > 0 && activeDays < 3 ? (
            <p className="type-meta text-muted">
              {activeDays === 1 ? 'One day' : `${activeDays} days`} with activity so far — not
              enough to read as a trend.
            </p>
          ) : null}
          {/* ── A TOTAL AND ITS ONLY CATEGORY ARE THE SAME NUMBER ───────────
              With one category the breakdown restates the figure already
              printed above it. So the single category is NAMED rather than
              tabulated, which says the extra thing the figure could not (what
              the spend was for) without saying the number again. */}
          {/* ── THE CAP, RESTORED ────────────────────────────────────────────
              The rewrite dropped this and nothing caught it: the note lived
              inside `SpendArea`, so replacing the chart took the sentence with
              it. `readSpend` truncates OLDEST-FIRST past its row limit, so a
              capped window silently begins later than the reader assumes and
              the total under-reports. It names the DATE, never a row count —
              "from 12 Jul" is something a person can reason about. */}
          <CoverageNote coveredFrom={spend.capped ? spend.coveredFrom : null} />
          {spend.byAction.length === 1 ? (
            <p className="type-meta text-muted">All of it on {oneLabel(spend)}.</p>
          ) : (
            <SpendBars spend={spend} />
          )}
        </>
      ) : (
        <ChartSparse from={from} to={to}>
          {readable
            ? 'Nothing spent yet. Your first AI action shows up here, broken down by what it was for.'
            : 'Sahoda could not read your spending just now. Nothing has been charged, and reloading will try again.'}
        </ChartSparse>
      )}
    </Panel>
  )
}
