import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PLAN_CATALOG } from '@sahoda/shared'

import { planOfferRows } from '@/lib/billing/plan-offer-rows'
import { PlanOfferModal } from './plan-offer-modal'

/**
 * THE OFFER, AS A PERSON MEETS IT.
 *
 * `plan-offer.test.ts` decides WHETHER an account is offered a plan. This file
 * is the other half: given that it is mounted, does it open, does it stay shut
 * once closed, does it come back after a new sign-in, and does it show the real
 * catalog rather than a written copy of it.
 *
 * The plan rows come from the REAL `planOfferRows()`, the same builder the page
 * calls, so the prices these assertions read are the catalog's and not a fixture
 * agreeing with itself.
 *
 * ── THE CHECKOUT ACTION IS MOCKED, AND NOTHING ELSE IS ───────────────────────
 * `startCheckout` is a `'use server'` export that opens a real Cashfree order.
 * A component test may not do that. The cards, the dialog, the storage and the
 * catalog reads are all the real ones.
 */
const startCheckout = vi.fn()
vi.mock('@/app/actions/wallet', () => ({
  startCheckout: (planId: unknown) => startCheckout(planId),
}))

const KEY = 'sahoda.plan-offer-dismissed'
const SESSION = 'sess_alpha'

beforeEach(() => {
  startCheckout.mockReset()
  window.localStorage.clear()
  // `<dialog>` is not implemented in jsdom; the primitive only calls these two.
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false
  })
})

/**
 * The dialog is UNMOUNTED when shut (see the component: a closed `<dialog>` is
 * still in the DOM and every node-counting guard on /home still sees it). So
 * "shut" is asserted as absence, not as `open === false`.
 */
const dialog = (): HTMLDialogElement =>
  screen.getByRole('dialog', { hidden: true }) as HTMLDialogElement
const noDialog = (): boolean => screen.queryByRole('dialog', { hidden: true }) === null

describe('when it opens', () => {
  it('opens by itself for a session that has not closed it', async () => {
    render(<PlanOfferModal sessionKey={SESSION} plans={planOfferRows()} />)
    await waitFor(() => expect(dialog().open).toBe(true))
    expect(screen.getByRole('heading', { name: 'Choose the right plan for you' })).toBeVisible()
  })

  it('stays shut for the session that already closed it', async () => {
    window.localStorage.setItem(KEY, SESSION)
    render(<PlanOfferModal sessionKey={SESSION} plans={planOfferRows()} />)
    // Give the mount effect every chance to open it before concluding it did not.
    await Promise.resolve()
    expect(noDialog()).toBe(true)
  })

  it('comes back after a new sign-in, which is a new session id', async () => {
    // THE REGRESSION THIS PINS. A plain boolean "dismissed" flag, or a session
    // cookie, would both silence the offer here — and the brief asks for the
    // opposite: somebody who signs out and back in without buying anything
    // should meet it again. Only a key scoped to the sign-in can tell these two
    // apart.
    window.localStorage.setItem(KEY, 'sess_yesterday')
    render(<PlanOfferModal sessionKey={SESSION} plans={planOfferRows()} />)
    await waitFor(() => expect(dialog().open).toBe(true))
  })

  it('opens when localStorage throws, rather than staying silent', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    render(<PlanOfferModal sessionKey={SESSION} plans={planOfferRows()} />)
    await waitFor(() => expect(dialog().open).toBe(true))
    getItem.mockRestore()
  })
})

describe('when it closes', () => {
  it('closes on the X and records the dismissal against this session', async () => {
    const user = userEvent.setup()
    render(<PlanOfferModal sessionKey={SESSION} plans={planOfferRows()} />)
    await waitFor(() => expect(dialog().open).toBe(true))

    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(noDialog()).toBe(true)
    expect(window.localStorage.getItem(KEY)).toBe(SESSION)
  })

  it('records the dismissal when the dialog closes on Escape, not only on the X', async () => {
    // `Modal` funnels Escape through the element's own `close` event. If that
    // path did not record, a person who pressed Escape would meet the dialog
    // again on the next visit to the dashboard in the same sign-in.
    render(<PlanOfferModal sessionKey={SESSION} plans={planOfferRows()} />)
    await waitFor(() => expect(dialog().open).toBe(true))

    dialog().dispatchEvent(new Event('close'))

    await waitFor(() => expect(window.localStorage.getItem(KEY)).toBe(SESSION))
  })
})

describe('what it shows', () => {
  beforeEach(async () => {
    render(<PlanOfferModal sessionKey={SESSION} plans={planOfferRows()} />)
    await waitFor(() => expect(dialog().open).toBe(true))
  })

  it('shows the three paid plans from the catalog, and never Free as a card', () => {
    for (const id of ['starter', 'growth', 'agency'] as const) {
      expect(screen.getByRole('button', { name: `Choose ${PLAN_CATALOG[id].name}` })).toBeVisible()
    }
    expect(screen.queryByRole('button', { name: 'Choose Free' })).toBeNull()
  })

  it('prices every plan at the catalog figure, with no second copy to drift', () => {
    // Read off PLAN_CATALOG rather than written here: if this test carried the
    // numerals, a reprice would make the product and the guard wrong together.
    for (const id of ['starter', 'growth', 'agency'] as const) {
      const entry = PLAN_CATALOG[id]
      expect(dialog()).toHaveTextContent(`₹${entry.priceInr.toLocaleString('en-IN')}`)
      expect(dialog()).toHaveTextContent(entry.monthlyCredits.toLocaleString('en-IN'))
    }
  })

  it('marks exactly one plan as recommended', () => {
    expect(screen.getAllByText('Recommended')).toHaveLength(1)
  })

  it('carries exactly one solid brand fill, on the recommended plan', () => {
    /**
     * docs/37 §16: one primary action per view, and a dialog covering the screen
     * IS the view while it is open.
     *
     * An earlier version of this comment said `e2e/accent-budget.spec.ts` "cannot
     * see this dialog at all, because the offer is closed there by the time it
     * measures". That was false, and being false is what nearly shipped a red
     * @smoke guard: that spec bootstraps a workspace, visits /home twelve ways
     * and had no dismissal at all, so it would have measured the dialog's
     * primary as a second fill on the page. It dismisses the offer now, and this
     * assertion covers what it then cannot see: what is inside the dialog.
     *
     * `bg-primary` is that fill — it is what `buttonVariants`' primary applies
     * and nothing else in this dialog uses it. Reading a class is coarser than
     * reading a painted pixel and it is the strongest thing jsdom can offer,
     * which is why the browser guard is not retired.
     */
    const filled = dialog().querySelectorAll('button.bg-primary, a.bg-primary')
    expect(filled).toHaveLength(1)
    expect(filled[0]).toHaveAccessibleName('Choose Growth')
  })

  it('promises no renewal anywhere in the dialog', () => {
    // `top-up-panel.tsx` refused the word "Subscription" in its own heading
    // because nothing in production writes a `subscriptions` row or takes a
    // second payment. A dialog that reinstated that promise one screen over
    // would make the refusal decorative, so the same claim is barred here.
    const text = dialog().textContent ?? ''
    expect(text).not.toMatch(/\brenew/i)
    expect(text).not.toMatch(/\bevery month you\b/i)
    // "Billed monthly" says the card is charged again. Nothing does that.
    expect(text).not.toMatch(/billed monthly/i)
    expect(text).toMatch(/Nothing is charged until a payment completes/i)
  })

  it('offers no billing toggle, because there is no annual price to toggle to', () => {
    // The brief asks for Monthly/Annual "if already supported". It is not:
    // PLAN_CATALOG carries one `priceInr` per plan. A toggle would need a second
    // price and a "Save XX%" figure, and both would have to be invented.
    const text = dialog().textContent ?? ''
    expect(text).not.toMatch(/annual/i)
    expect(text).not.toMatch(/\bsave \d+%/i)
    // The period is STATED. "per month" is the plan's rate, which is what the
    // catalog carries; "billed monthly" would be the recurring-charge claim the
    // renewal test above bars, and it stood here until a review caught it.
    expect(text).toMatch(/per month/i)
  })
})

describe('choosing a plan', () => {
  it('starts a checkout for the plan that was pressed, through the existing action', async () => {
    const user = userEvent.setup()
    startCheckout.mockResolvedValue({ ok: false, message: 'Checkout is not connected here.' })
    render(<PlanOfferModal sessionKey={SESSION} plans={planOfferRows()} />)
    await waitFor(() => expect(dialog().open).toBe(true))

    await user.click(screen.getByRole('button', { name: 'Choose Growth' }))

    await waitFor(() => expect(startCheckout).toHaveBeenCalledWith('growth'))
  })

  it('says what happened when checkout refuses, and says nothing was charged', async () => {
    const user = userEvent.setup()
    startCheckout.mockResolvedValue({ ok: false, message: 'Checkout is not connected here.' })
    render(<PlanOfferModal sessionKey={SESSION} plans={planOfferRows()} />)
    await waitFor(() => expect(dialog().open).toBe(true))

    await user.click(screen.getByRole('button', { name: 'Choose Starter' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Checkout is not connected here.')
    expect(alert).toHaveTextContent('you were not charged')
  })

  it('does not close the dialog when a checkout fails', async () => {
    // A dialog that vanished on a failed attempt would leave somebody who tried
    // to pay looking at a dashboard with no explanation and no way back.
    const user = userEvent.setup()
    startCheckout.mockResolvedValue({ ok: false, message: 'No.' })
    render(<PlanOfferModal sessionKey={SESSION} plans={planOfferRows()} />)
    await waitFor(() => expect(dialog().open).toBe(true))

    await user.click(screen.getByRole('button', { name: 'Choose Studio' }))
    await screen.findByRole('alert')

    expect(dialog().open).toBe(true)
  })

  it('renders a sandbox order as a sandbox order, never as a purchase', async () => {
    const user = userEvent.setup()
    startCheckout.mockResolvedValue({
      ok: true,
      simulated: true,
      mode: 'sandbox',
      sessionId: 'order_1',
      planId: 'growth',
    })
    render(<PlanOfferModal sessionKey={SESSION} plans={planOfferRows()} />)
    await waitFor(() => expect(dialog().open).toBe(true))

    await user.click(screen.getByRole('button', { name: 'Choose Growth' }))

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('No real money moves')
    expect(status).toHaveTextContent('Nothing was charged and no credits were added')
  })
})
