import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
 * Figures come from PLAN_CATALOG, never typed in: a test that hardcodes ₹1,499
 * stops testing the catalog the moment pricing moves, which is the exact defect
 * `channel-tile.test.tsx` recorded for a hardcoded ration.
 */
describe('the top-up plan cards', () => {
  it('starts on Starter and says so in the sentence the checkout acts on', () => {
    render(<TopUpPanel />)

    expect(screen.getByRole('radio', { name: /starter/i })).toBeChecked()
    expect(summary()).toContain(`Starter, ${rupees(PLAN_CATALOG.starter.priceInr)} per month`)
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
    expect(summary()).toContain(`Growth, ${rupees(PLAN_CATALOG.growth.priceInr)} per month`)
    // And the old plan is gone from that sentence, so a stale summary cannot sit
    // beside a fresh one.
    expect(summary()).not.toContain('Starter')
    expect(summary()).not.toContain(rupees(PLAN_CATALOG.starter.priceInr))
  })

  it('marks exactly one card selected, never two and never none', async () => {
    const user = userEvent.setup()
    render(<TopUpPanel />)

    expect(screen.getAllByText('Selected')).toHaveLength(1)
    await user.click(screen.getByText('Agency'))
    expect(screen.getAllByText('Selected')).toHaveLength(1)
    expect(screen.getByRole('radio', { name: /agency/i })).toBeChecked()
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
