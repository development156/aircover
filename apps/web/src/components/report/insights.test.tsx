import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { AtAGlanceCard, CreditsCard, InsightPromiseCard } from './insights'
import { ReportModule } from './module'
import { Coins } from 'lucide-react'
import type { BalanceRead } from '@/lib/wallet/read'

/**
 * THE INSIGHTS COLUMN MAKES CLAIMS ABOUT THE READER'S WEEK, SO ITS ABSENCES
 * ARE THE PART WORTH GUARDING.
 *
 * The design this was built from asks for a rising line chart directly above a
 * caption reading "No performance data yet", and for a balance printed as "448
 * of 600, 74.7% remaining" against a denominator this product does not hold.
 * Both are the same defect: a figure about somebody's business that no query
 * produced. What is pinned here is that the code refuses them.
 *
 * ── WHAT THIS CANNOT SEE ─────────────────────────────────────────────────────
 *  · whether the figures are the RIGHT ones. It checks that an unmeasured slot
 *    renders the absence mark rather than a zero; whether `postsMeasured` is
 *    the right thing to put in that slot is a product judgement no test makes.
 *  · layout, spacing and the sticky column. jsdom computes none of it; those
 *    were checked by rendering in Chromium at 1440, 1024 and 420.
 *  · the dark card's contrast. `data-surface="inverse"` is a CSS scope and
 *    jsdom resolves no custom properties, so the token swap is invisible here.
 */

const OK: BalanceRead = {
  status: 'ok',
  balance: { total: 600, held: 0, available: 448, hasHold: false, heldNote: null },
} as BalanceRead

describe('what the glance card will and will not say', () => {
  it('draws no chart, because there is no series behind one', () => {
    const { container } = render(
      <AtAGlanceCard
        figures={[{ label: 'Posts measured', value: null }]}
        note="No performance data yet."
      />,
    )
    /**
     * THE MUTATION THIS EXISTS FOR: an `<svg>` or a `<canvas>` sparkline added
     * to this card to match the reference image.
     *
     * There is no measured series on this page — the card's own caption says
     * so in the same breath — so any line drawn here is a picture of the
     * reader's week that nothing measured. That is the one rule this product
     * may never break, and it is the likeliest thing for a later reader to
     * "restore" from the design.
     */
    expect(container.querySelector('svg')).toBeNull()
    expect(container.querySelector('canvas')).toBeNull()
  })

  it('marks an unmeasured figure rather than printing a zero', () => {
    render(
      <AtAGlanceCard figures={[{ label: 'Posts measured', value: null }]} note="No data yet." />,
    )
    // A zero is a measurement of nothing, which is a claim. The mark is not.
    expect(screen.queryByText('0')).toBeNull()
    expect(screen.getByText(/Posts measured has not been measured yet/)).toBeTruthy()
  })

  it('says WHICH nothing it is, when the figure knows', () => {
    // ── THE SEVENTH KIND OF NOTHING, IN THE ONE PLACE IT WAS MISSED ─────────
    // Every null announced "<label> has not been measured yet". That is right
    // for Reach before anything has published and wrong for `Approved`: a null
    // there means no spending was ever put to the customer, which is not a
    // reading anybody failed to take.
    render(
      <AtAGlanceCard
        figures={[
          {
            label: 'Approved',
            value: null,
            unit: 'cr',
            absent: 'Nothing has been put to you for approval in this cycle',
          },
        ]}
        note="n"
      />,
    )

    expect(screen.getByText(/Nothing has been put to you for approval/)).toBeTruthy()
    // The wrong claim must be gone, not merely joined by a right one.
    expect(screen.queryByText(/Approved has not been measured yet/)).toBeNull()
    // And it is still an absence, never a zero in a costume.
    expect(screen.queryByText('0')).toBeNull()
  })

  it('still prints a real zero, because a measured nothing is knowledge', () => {
    render(<AtAGlanceCard figures={[{ label: 'Written this week', value: 0 }]} note="n" />)
    expect(screen.getByText('0')).toBeTruthy()
  })
})

describe('the credits card and the denominator it refuses', () => {
  it('shows the balance without inventing an allowance', () => {
    render(<CreditsCard balance={OK} spent={20} budget={null} />)
    expect(screen.getByText('448')).toBeTruthy()
    /**
     * THE MUTATION THIS EXISTS FOR: "of 600" and a percentage bar restored from
     * the reference. `balance_total` is credits OWNED, not an allowance, so
     * "448 of 600" would silently mean "152 held" — a different sentence — and
     * with nothing held the bar is permanently full and states nothing.
     */
    expect(screen.queryByText(/of 600/)).toBeNull()
    expect(screen.queryByText(/% remaining/)).toBeNull()
  })

  it('draws the bar only against a budget somebody actually set', () => {
    const { container, unmount } = render(<CreditsCard balance={OK} spent={20} budget={null} />)
    expect(container.querySelector('[style*="width"]')).toBeNull()
    unmount()

    render(<CreditsCard balance={OK} spent={20} budget={150} />)
    const bar = document.querySelector('[style*="width"]') as HTMLElement
    expect(bar.style.width).toBe('13%')
    // Both figures survive in words. Nothing is only knowable from a width.
    expect(screen.getByText(/of/)).toBeTruthy()
    expect(screen.getByText('150')).toBeTruthy()
  })

  it('does not pluralise a budget of one', () => {
    // A figure that can be 1 sitting next to a hard-coded "credits" is the
    // defect `credit-words.test.ts` scans the whole tree for. It caught this
    // sentence on the first run.
    render(<CreditsCard balance={OK} spent={1} budget={1} />)
    expect(screen.getByText(/credit spent on this week/)).toBeTruthy()
    expect(screen.queryByText(/credits spent on this week/)).toBeNull()
  })

  it('caps the bar but never the sentence, when a week goes over budget', () => {
    render(<CreditsCard balance={OK} spent={300} budget={150} />)
    const bar = document.querySelector('[style*="width"]') as HTMLElement
    // A bar past 100% runs off its own track and reads as a rendering fault.
    expect(bar.style.width).toBe('100%')
    // …but the true figure is still stated, so nobody is told they are inside
    // a budget they have doubled.
    expect(screen.getByText('300')).toBeTruthy()
  })

  it('says the balance could not be read rather than showing a zero', () => {
    render(<CreditsCard balance={{ status: 'unreadable' }} spent={0} budget={null} />)
    expect(screen.getByText(/Credits left could not be read/)).toBeTruthy()
    expect(screen.queryByText('0')).toBeNull()
  })
})

describe('the report module', () => {
  it('keeps the ordinal away from assistive tech, and the heading real', () => {
    render(
      <ReportModule n={5} eyebrow="And what it cost" title="Credits used" icon={Coins} accent>
        <p>body</p>
      </ReportModule>,
    )
    // The heading carries the meaning; the numeral is decoration and fails
    // contrast by design, so it must not be the only carrier of anything.
    expect(screen.getByRole('heading', { name: 'Credits used' })).toBeTruthy()
    const numeral = screen.getByText('05')
    expect(numeral.getAttribute('aria-hidden')).toBe('true')
  })

  it('swaps the tinted surface in dark, where accent-on-tint is unreadable', () => {
    const { container } = render(
      <ReportModule n={1} eyebrow="e" title="t" icon={Coins} accent>
        <p>body</p>
      </ReportModule>,
    )
    /**
     * `--t100` stays warm-light in dark while `--acc` flips to Orange300 — the
     * pair measures ~1.7:1. The surface swap is the documented fix and every
     * `text-accent on bg-tint-*` in this app must carry it.
     */
    const tinted = container.querySelector('.bg-tint-100')!
    expect(tinted.className).toMatch(/dark:bg-s2/)
  })
})

describe('the three animations the founder allowed, and none of them costs bytes', () => {
  /**
   * TWO OF THE THREE ROLLED UNTIL 2026-09-07, AND THE MEASUREMENT ENDED THAT.
   * `CountUp` is a client component and /report had none, so two rolling
   * numbers made the route carry 28.6 kB of client runtime — the founder's
   * ruling, given the figure: lightweight CSS instead. These pin the new claim.
   */
  it('reveals the figure in CSS, with no client component behind it', () => {
    /**
     * THE MUTATION THIS EXISTS FOR: `CountUp` put back. It reads better and it
     * costs 28.6 kB on a route whose only interactive element it would be. The
     * marker it renders is what this looks for, so restoring it goes red here
     * rather than silently on the next deployment's budget check.
     */
    const { container } = render(
      <AtAGlanceCard figures={[{ label: 'Posts measured', value: 7 }]} note="n" />,
    )
    expect(container.querySelector('[data-countup]')).toBeNull()
    expect(container.querySelector('.enter')).not.toBeNull()
    // The number is in the markup, not animated toward: a reader with no
    // JavaScript sees the same figure.
    expect(screen.getByText('7')).toBeTruthy()
  })

  it('prints a text figure unchanged', () => {
    render(<AtAGlanceCard figures={[{ label: 'Best day', value: 'Tuesday' }]} note="n" />)
    expect(screen.getByText('Tuesday')).toBeTruthy()
  })

  it('groups the balance the way this product writes numbers', () => {
    // `CountUp` did the grouping; without it the component has to. 448 is not
    // enough digits to show a separator, so this pins a figure that is.
    render(
      <CreditsCard
        balance={
          {
            status: 'ok',
            balance: { total: 0, held: 0, available: 12400, hasHold: false, heldNote: null },
          } as never
        }
        spent={0}
        budget={null}
      />,
    )
    expect(screen.getByText('12,400')).toBeTruthy()
  })

  it('keeps the drifting mark away from assistive tech', () => {
    /**
     * THE MUTATION THIS EXISTS FOR: the drift moved onto something that carries
     * meaning. docs/37 §12 allows `transform` and `opacity` only, and an
     * animation on a value is a value that is moving while you read it.
     */
    const { container } = render(<InsightPromiseCard />)
    const drifting = container.querySelectorAll('.sl-drift')
    expect(drifting).toHaveLength(1)
    expect(drifting[0]!.getAttribute('aria-hidden')).toBe('true')
  })
})
