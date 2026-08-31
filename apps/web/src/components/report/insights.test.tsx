import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { AtAGlanceCard, CreditsCard } from './insights'
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
