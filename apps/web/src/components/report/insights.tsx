import Link from 'next/link'
import { Sparkles, Wallet } from 'lucide-react'

import { NotYet, Unmeasured, Unreadable } from '@/components/design-system/absence-row'
import { creditWord } from '@/lib/credit-words'
import type { BalanceRead } from '@/lib/wallet/read'

/**
 * THE INSIGHTS COLUMN — and the chart that is not in it.
 *
 * ── THE ONE THING IN THE BRIEF THAT COULD NOT BE BUILT ───────────────────────
 * The design asks card one to carry "a small minimalist orange line chart",
 * rising, with data points — directly above a status line reading "No
 * performance data yet". Those two things cannot both be on the screen. The
 * line is a picture of the reader's week going up, drawn from nothing, on a
 * page whose entire doctrine is that a figure appears only when something
 * measured it. It is the one rule this product may never break.
 *
 * So the card carries the four figures the page has ALREADY READ and no chart.
 * When there is a series to draw, `components/charts/bars.tsx` exists and this
 * is where it goes; there is no series today and there was none in the
 * screenshot the brief was drawn from, which is why its own caption said so.
 *
 * ── AND THE CREDIT CARD'S DENOMINATOR IS THE WEEK, NOT "600" ─────────────────
 * The brief asks for "448 of 600" and "74.7% remaining". `600` is not a figure
 * this product holds: `credit_balances` stores `balance_total` and
 * `balance_held`, so the only true reading of "448 of 600" would be "448
 * available of 600 owned, 152 held by actions in progress" — which is a
 * different sentence, and when nothing is held the bar is permanently full and
 * says nothing at all.
 *
 * There IS a real allowance on this page and the brief prints it two panels
 * away: the cycle's own weekly budget. `spent of budget` is a true ratio, it
 * moves week to week, and it is the number a person acts on. That is the bar.
 */

/** A figure the card can show, or the reason it cannot. */
export interface Figure {
  label: string
  /** The reading. `null` means nothing measured it, UNLESS `absent` says otherwise. */
  value: number | string | null
  /** Set small beside the figure. Part of the phrase, not a second line. */
  unit?: string
  /**
   * What a `null` here actually MEANS, when it is not "not measured yet".
   *
   * ── WHY A FIGURE HAS TO BE ABLE TO SAY THIS ─────────────────────────────────
   * Every null rendered as `Unmeasured`, which announces "<label> has not been
   * measured yet". That is the right sentence for Reach before anything has
   * published, and the wrong one for `Approved`: a null there means no spending
   * was ever put to the customer for approval, which is not a reading we failed
   * to take. Announcing a missing measurement for something that was never
   * measurable is the seventh-kind-of-nothing mistake `absence-row.tsx` exists
   * to prevent, made in the one place that file's own three states did not
   * reach.
   *
   * The visible mark is identical either way. Only the CLAIM differs.
   */
  absent?: string
}

/**
 * WHAT THIS WEEK ACTUALLY IS, on the inverse surface.
 *
 * `data-surface="inverse"` rather than a hand-written dark fill. The panel's
 * ground does not follow the theme, so its text tokens must not either —
 * without the scope, `text-ink` is #000000 here and the whole card is black on
 * near-black in light mode. This is the mechanism the rail documents and the
 * reason it has one.
 */
export function AtAGlanceCard({ figures, note }: { figures: readonly Figure[]; note: string }) {
  return (
    <section
      aria-labelledby="report-glance"
      data-surface="inverse"
      className="rounded-card bg-surface p-5 shadow-card"
    >
      <h2 id="report-glance" className="type-h3 text-ink">
        This week at a glance
      </h2>

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5">
        {figures.map((figure) => (
          <div key={figure.label} className="min-w-0">
            <dt className="type-meta text-muted">{figure.label}</dt>
            <dd className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
              {figure.value === null ? (
                // The absence mark, which is a UI token and not a zero in a
                // costume. WHICH nothing it is comes from the figure: most are
                // "not measured yet", and one is "there was never anything to
                // measure".
                figure.absent === undefined ? (
                  <Unmeasured what={figure.label} />
                ) : (
                  <NotYet what={figure.label} because={figure.absent} />
                )
              ) : (
                <>
                  <span className="type-h2 num text-ink">{figure.value}</span>
                  {figure.unit ? <span className="type-sm text-muted">{figure.unit}</span> : null}
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-5 flex items-center gap-2 border-t border-line-soft pt-4 type-meta text-muted">
        {note}
      </p>
    </section>
  )
}

/**
 * The balance, and this week against its budget.
 *
 * The bar is drawn ONLY when a budget exists. A progress bar with no
 * denominator is a picture of an allowance nobody set.
 */
export function CreditsCard({
  balance,
  spent,
  budget,
}: {
  balance: BalanceRead
  spent: number
  /** The cycle's own weekly budget, or null when none was set. */
  budget: number | null
}) {
  const readable = balance.status === 'ok'
  // Capped for the BAR only; the sentence beside it keeps the true figure, so
  // going over budget reads as a full bar and an honest number rather than as a
  // bar that has run off the end of its own track.
  const filled = budget && budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : null

  return (
    <section
      aria-labelledby="report-credits"
      className="surface-ring rounded-card bg-surface p-5 shadow-card"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid size-10 flex-none place-items-center rounded-full bg-tint-100 text-accent dark:bg-s2"
        >
          <Wallet size={18} strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="report-credits" className="type-meta text-muted">
            Credits left
          </h2>
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
            {readable ? (
              <span className="type-hero-num num text-ink">
                {balance.balance.available.toLocaleString('en-IN')}
              </span>
            ) : (
              <Unreadable what="Credits left" />
            )}
          </p>
        </div>
      </div>

      {readable && balance.balance.held > 0 ? (
        <p className="mt-2 type-meta text-muted">
          <span className="num">{balance.balance.held}</span> held by actions in progress.
        </p>
      ) : null}

      {filled !== null && budget !== null ? (
        <div className="mt-4">
          <div
            aria-hidden
            className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
            /* The bar is decoration for the sentence below it, which carries
               both figures in words. Nothing here is only knowable from a
               width. */
          >
            <span className="block h-full rounded-full bg-accent" style={{ width: `${filled}%` }} />
          </div>
          <p className="mt-2 type-meta text-muted">
            <span className="num">{spent}</span> of <span className="num">{budget}</span>{' '}
            {creditWord(budget)} spent on this week.
          </p>
        </div>
      ) : null}

      <p className="mt-4 type-meta">
        <Link href="/wallet" className="font-[550] text-accent underline underline-offset-2">
          See every charge in your wallet
        </Link>
      </p>
    </section>
  )
}

/**
 * A promise about Sahoda, which is allowed. A number in it would be a claim
 * about the reader's week, which is not — so there is not one.
 *
 * It renders only while the report genuinely has nothing in it. Once there are
 * learnings or observations, a card saying insights are coming sits beside the
 * insights that arrived, which reads as a product that has not noticed its own
 * output.
 */
export function InsightPromiseCard() {
  return (
    <section
      aria-labelledby="report-promise"
      className="surface-ring relative overflow-hidden rounded-card bg-brand-wash p-5"
    >
      <h2 id="report-promise" className="type-h3 flex items-center gap-2 text-ink">
        <Sparkles size={16} strokeWidth={1.9} aria-hidden className="text-accent" />
        Sahoda insight
      </h2>
      <p className="type-sm mt-2 max-w-[34ch] text-muted">
        Once your posts start rolling, you&rsquo;ll see clear insights here every Monday.
      </p>
    </section>
  )
}
