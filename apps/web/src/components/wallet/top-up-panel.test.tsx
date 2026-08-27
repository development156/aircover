import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PLAN_CATALOG } from '@sahoda/shared'

vi.mock('@/app/actions/wallet', () => ({ startCheckout: vi.fn() }))

import { TopUpPanel } from './top-up-panel'

/**
 * The summary sentence is SPLIT by the `.num` span that makes the figure
 * tabular, so no single text node holds it. Read the paragraph's own text
 * instead: what matters is the sentence a person sees, not which element
 * happens to own which half of it.
 */
const summary = (): string =>
  screen
    .getAllByText(
      (_content, el) =>
        el?.tagName === 'P' &&
        /Nothing is charged and no credits are added/.test(el.textContent ?? ''),
    )
    .map((el) => el.textContent ?? '')
    .join(' ')

const rupees = (n: number): string => `₹${n.toLocaleString('en-IN')}`

/**
 * THE PLAN YOU PICKED IS THE PLAN YOU ARE ABOUT TO PAY FOR.
 *
 * The panel became three cards, and with them the radio went `sr-only` — the
 * visible selection is now a wash, a firmer ring and a tick, none of which the
 * checkout reads. What the checkout reads is `planId`, and the only thing on
 * screen that reports it is the summary line above the button.
 *
 * So the failure this guards is silent and expensive: the card you clicked looks
 * selected while `planId` still holds the previous plan, and the customer starts
 * a checkout for a plan they did not choose. Nothing about the styling would
 * look wrong. This asserts the CHAIN — click, then the money sentence — rather
 * than the classes, because the classes are what would still be right.
 *
 * The SEPARATOR between plan and price moved from a comma to a middot when the
 * footer became two columns. That is punctuation, not a claim, so these
 * assertions were retargeted rather than loosened: they still pin the plan NAME
 * and the plan's PRICE together in one sentence, which is the thing that must
 * never disagree with what the checkout is about to charge.
 *
 * Figures come from PLAN_CATALOG, never typed in: a test that hardcodes ₹1,499
 * stops testing the catalog the moment pricing moves, which is the exact defect
 * `channel-tile.test.tsx` recorded for a hardcoded ration.
 */
describe('the top-up plan cards', () => {
  it('starts on Starter and says so in the sentence the checkout acts on', () => {
    render(<TopUpPanel />)

    expect(screen.getByRole('radio', { name: /starter/i })).toBeChecked()
    expect(summary()).toContain(`Starter · ${rupees(PLAN_CATALOG.starter.priceInr)} per month`)
  })

  it('moves the checkout to the plan whose card was clicked', async () => {
    const user = userEvent.setup()
    render(<TopUpPanel />)

    // Click the NAME, the way a person clicks a card — not the input, which is
    // visually hidden and which clicking directly would prove nothing about
    // whether the card is wired to it.
    await user.click(screen.getByText('Growth'))

    expect(screen.getByRole('radio', { name: /growth/i })).toBeChecked()
    expect(screen.getByRole('radio', { name: /starter/i })).not.toBeChecked()
    expect(summary()).toContain(`Growth · ${rupees(PLAN_CATALOG.growth.priceInr)} per month`)
    // And the old plan is gone from that sentence, so a stale summary cannot sit
    // beside a fresh one.
    expect(summary()).not.toContain('Starter')
    expect(summary()).not.toContain(rupees(PLAN_CATALOG.starter.priceInr))
  })

  it('marks exactly one card selected, never two and never none', async () => {
    const user = userEvent.setup()
    render(<TopUpPanel />)

    expect(screen.getAllByText('Selected')).toHaveLength(1)
    // RETARGETED at the wt-core merge, not deleted. This clicked `Agency` and
    // looked for a radio named `/agency/i`; the reprice renamed that plan's
    // LABEL to "Studio" while keeping the id `agency`, because that id is the
    // `plan_id` on every live subscription row.
    //
    // So the click goes by the label a reader sees, and the assertion goes by
    // the VALUE the checkout will send — which is a stronger pair than the
    // original, because it is exactly where the two are meant to disagree.
    // `plans.test.ts` asserts that divergence at the catalog; this holds the
    // screen to it.
    await user.click(screen.getByText('Studio'))
    expect(screen.getAllByText('Selected')).toHaveLength(1)
    expect(screen.getByRole('radio', { checked: true })).toHaveAttribute('value', 'agency')
  })

  it('recommends exactly one plan, and it is Growth', () => {
    render(<TopUpPanel />)

    // ONE. A badge on two cards is not a recommendation, and a badge on none is
    // a constant that silently stopped matching a plan id.
    const chips = screen.getAllByText('Recommended')
    expect(chips).toHaveLength(1)

    // AND IT IS ON THE RIGHT CARD. Asserting only the count would pass with the
    // chip on Studio, which is the defect a reader would actually be misled by.
    const card = chips[0]!.closest('label')!
    expect(within(card).getByRole('radio')).toHaveAttribute('value', 'growth')
  })

  it('recommends one plan and pre-selects a DIFFERENT one, deliberately', () => {
    // Recommending and pre-selecting are separate acts: the second decides what
    // the checkout charges if someone presses the button without reading. If
    // these ever become the same plan it should be because somebody chose that,
    // so this pins the current, deliberate split.
    render(<TopUpPanel />)

    const recommended = screen.getByText('Recommended').closest('label')!
    expect(within(recommended).getByRole('radio')).not.toBeChecked()
    expect(screen.getByRole('radio', { name: /starter/i })).toBeChecked()
  })

  it('reads its feature lines off PLAN_CATALOG.limits rather than prose', () => {
    render(<TopUpPanel />)

    // Starter is 4 channels / 1 site / 1 seat. Singular and plural both matter:
    // "1 seats" is the tell that a list was written rather than derived.
    expect(screen.getByText(`${PLAN_CATALOG.starter.limits.seats} seat`)).toBeInTheDocument()
    expect(screen.getByText(`${PLAN_CATALOG.growth.limits.seats} seats`)).toBeInTheDocument()
    expect(
      screen.getByText(`${PLAN_CATALOG.agency.limits.sites} published sites`),
    ).toBeInTheDocument()
  })
})

/**
 * THE CARD CRAFT PORTED FROM THE REFERENCE PRICING COMPONENT, AS TESTS.
 *
 * These pin the two things about that port which are cheap to undo by accident
 * and expensive when undone, and neither is a matter of taste.
 *
 * Both assert a CLAIM through a mechanism, never a wording or a hex value: the
 * first asks "is the accent spent on a box the budget probe charges", the second
 * asks "is the name above the caption on the type scale". A later session may
 * restyle either freely and these stay right.
 */
describe('the ported card craft', () => {
  /** The `<label>` that is the whole card for one plan. */
  const cardFor = (name: RegExp): HTMLElement => {
    const radio = screen.getByRole('radio', { name })
    const label = radio.closest('label')
    if (label === null) throw new Error('the radio is not inside its card label')
    return label
  }

  it('circles each feature tick with a RING, never a border the accent budget charges', () => {
    render(<TopUpPanel />)

    // The selected card: the one whose ticks are drawn in the brand.
    const card = cardFor(/starter/i)
    const marks = card.querySelectorAll('[class*="rounded-pill"][class*="place-content-center"]')

    // Three feature lines come off PLAN_CATALOG.limits, so three marks.
    expect(marks.length).toBe(3)

    for (const mark of marks) {
      const classes = mark.className
      // ── THE CLAIM ────────────────────────────────────────────────────────
      // `accent-area-budget.spec.ts` charges a BORDER its whole box and does not
      // read box-shadow at all. MEASURED with that spec's own probe over the
      // rendered panel: the reference's `size-6` bordered tick costs 576px2
      // each, 5,184px2 across nine, taking the panel from 5,266 to 10,450
      // against a 6,000px2 ceiling. At this file's 18px that is 324px2 each and
      // 2,916 across nine — smaller, still nearly half the screen's entire
      // allowance, and still spent on a decoration. A border here is not a style
      // regression, it is a failing gate.
      expect(classes).toMatch(/shadow-\[inset_0_0_0_1px_var\(--brand-lift\)\]/)
      expect(classes).not.toMatch(/\bborder(-|\s|$)/)
      // The ground is --surface, not the card's wash: MEASURED, accent on
      // --brand-wash is 2.753:1 in light against 2.936:1 on --surface.
      expect(classes).toMatch(/\bbg-surface\b/)
    }
  })

  it('draws an unselected card its own ring, so selection survives colour blindness', () => {
    render(<TopUpPanel />)

    const growth = cardFor(/growth/i)
    const mark = growth.querySelector('[class*="rounded-pill"][class*="place-content-center"]')
    expect(mark).not.toBeNull()
    // Not the brand ring — an unselected card must not borrow the selected
    // card's mark, or the tick stops reporting state at all.
    expect(mark?.className).not.toMatch(/--brand-lift/)
    expect(mark?.className).toMatch(/var\(--line\)/)
  })

  it('sets the plan name above the caption that describes it, on the type scale', () => {
    render(<TopUpPanel />)

    const card = cardFor(/starter/i)
    const name = within(card).getByText(PLAN_CATALOG.starter.name)

    // ── THE CLAIM ──────────────────────────────────────────────────────────
    // The reference sets the plan name at its largest card rung. This shipped at
    // `type-sm` — 13px/400, the SECONDARY rung — which put the name below the
    // "granted each month" caption underneath it, so the card that exists to be
    // identified read as an unlabelled price. `type-h3` is this scale's
    // card-title rung.
    expect(name.className).toMatch(/\btype-h3\b/)
    expect(name.className).not.toMatch(/\btype-sm\b/)
  })

  it('lets every card arrive on the product entrance, with no hand-written delay', () => {
    const { container } = render(<TopUpPanel />)

    const steps = container.querySelectorAll('.enter-step')
    expect(steps.length).toBe(3)

    steps.forEach((step, i) => {
      // `--i` is the ONLY thing a call site sets. The cap and the duration live
      // in tokens.css, and `prefers-reduced-motion` there zeroes the DELAY as
      // well as the duration — which is the half a hand-written framer-motion
      // delay gets wrong, leaving a reduced-motion reader in front of a blank
      // panel and then snapping three cards in at once.
      expect((step as HTMLElement).style.getPropertyValue('--i')).toBe(String(i))
      expect((step as HTMLElement).style.animationDelay).toBe('')
      expect((step as HTMLElement).style.animationDuration).toBe('')
    })
  })
})

/**
 * THE HEADING NAMES WHAT THIS BOX SELLS, AND PROMISES NO RENEWAL.
 *
 * "Top up credits" was wrong in one direction: these are plans carrying channel,
 * site and seat entitlements, not a one-off purchase of credits.
 *
 * "Subscription" is wrong in the other, and that one costs money rather than
 * clarity. MEASURED: `subscriptions` exists as a table with `status`,
 * `current_period_end` and `cancel_at_period_end`, and NOTHING in production
 * code ever inserts or updates a row in it — only the integration tests do.
 * `startCheckout` opens a single Cashfree order and `applyPlanGrant` keys the
 * grant on `monthlyGrantKey` = (plan, period, workspace). One payment, one
 * period. A reader told this is a subscription expects a second charge that no
 * code will ever make.
 *
 * This asserts the CLAIM, not the wording: rename the box freely, and the day
 * something genuinely renews, delete this test in the commit that builds it.
 */
describe('the panel heading', () => {
  const heading = (): string => {
    render(<TopUpPanel />)
    const el = screen.getByText(/plans/i, { selector: 'div,span,p,h1,h2,h3,h4' })
    return el.textContent ?? ''
  }

  it('says what the box sells, which is plans and not a credit top-up', () => {
    expect(heading()).toMatch(/plan/i)
  })

  it('never promises a renewal, because nothing in this product performs one', () => {
    const { container } = render(<TopUpPanel />)
    const copy = container.textContent ?? ''
    // Each of these tells a reader their card will be charged again.
    expect(copy).not.toMatch(/\bsubscri/i)
    expect(copy).not.toMatch(/\brenew/i)
    expect(copy).not.toMatch(/\bauto-?renew/i)
    expect(copy).not.toMatch(/\bcancel any ?time\b/i)
  })
})
