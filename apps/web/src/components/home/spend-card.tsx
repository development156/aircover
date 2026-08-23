import Link from 'next/link'

import { Bars, type BarPoint } from '@/components/charts/bars'
import { ChartSparse, Panel, PanelHead } from '@/components/charts/panel'
import { CountUp } from '@/components/motion/count-up'
import { Unreadable } from '@/components/design-system/absence-row'
import type { SpendRead } from '@/lib/home/spend'

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
 * ── THE SPARSE FLOOR IS UNCHANGED, AND IT MOVED HOUSE ────────────────────────
 * Three active days, because two points are a straight line between them and
 * say nothing the number does not say better. That floor used to live inside
 * `SpendArea`, which meant the CARD could not know whether its chart had drawn
 * anything and rendered a header for a chart that had refused. It is decided
 * here now, once, by the thing that is empty — the same restructure this file's
 * previous note describes for the two-empty-states defect.
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

/** Below this there is no shape to read, only a number. */
const MIN_ACTIVE_DAYS = 3

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
  const hasShape = spend.status === 'ok' && activeDays >= MIN_ACTIVE_DAYS
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

      {hasShape ? (
        <>
          <Bars points={points} unit="credits" />
          {/* ── A TOTAL AND ITS ONLY CATEGORY ARE THE SAME NUMBER ───────────
              With one category the breakdown restates the figure already
              printed above it. So the single category is NAMED rather than
              tabulated, which says the extra thing the figure could not (what
              the spend was for) without saying the number again. */}
          {spend.byAction.length === 1 ? (
            <p className="type-meta text-muted">All of it on {oneLabel(spend)}.</p>
          ) : (
            <SpendBars spend={spend} />
          )}
        </>
      ) : (
        <ChartSparse from={from} to={to}>
          {!readable
            ? 'Sahoda could not read your spending just now. Nothing has been charged, and reloading will try again.'
            : activeDays === 0
              ? 'Nothing spent yet. Your first AI action shows up here, broken down by what it was for.'
              : `A shape needs a few days with activity. So far ${
                  activeDays === 1 ? 'one day has' : `${activeDays} days have`
                }${spend.byAction.length === 1 ? `, all of it on ${oneLabel(spend)}` : ''}.`}
        </ChartSparse>
      )}
    </Panel>
  )
}
