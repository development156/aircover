import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BillingDetailsForm } from './billing-details-form'

vi.mock('@/app/actions/billing', () => ({ saveBillingDetails: vi.fn() }))

/**
 * WHAT THIS CARD PROMISES ABOUT AN INVOICE, AND THE ONE FIELD IT CANNOT KEEP.
 *
 * ── THE DEFECT ───────────────────────────────────────────────────────────────
 * The card hint read "These go on every invoice Sahoda issues from now on",
 * covering all six fields. Five of them do. The Address does not, and it is not
 * a matter of pending wiring: `InvoiceDraft` and the `invoices` table carry no
 * recipient address at all, so there is no column to print it into and no future
 * work on the invoice pipeline makes the sentence true.
 *
 * `billing_profiles.address` got its column in migration 20260819213000 with no
 * destination, and the field's placeholder read "Optional", which on a card
 * about invoices reads as "optional ON your invoice" rather than "we keep it but
 * never print it".
 *
 * ── WHY THIS IS A COPY GUARD AND NOT A BEHAVIOUR ONE ─────────────────────────
 * Nothing about the form's behaviour is wrong. The claim is. So these assert the
 * CLAIM rather than the wording: the blanket promise must not cover every field,
 * and the address must carry its own honest sentence. Rewrite either sentence
 * freely and the guarantee survives.
 */
describe('the billing card promises only what an invoice can carry', () => {
  it('does not claim that every one of these fields reaches an invoice', () => {
    render(<BillingDetailsForm profile={null} />)

    // "These go on every invoice" was the blanket claim, and it covered the one
    // field that has nowhere to go.
    expect(document.body.textContent ?? '').not.toMatch(/these go on every invoice/i)
  })

  it('still says that the tax details do reach one, because they do', () => {
    render(<BillingDetailsForm profile={null} />)

    expect(document.body.textContent ?? '').toMatch(/on every invoice Sahoda issues/i)
  })

  it('says plainly what happens to the address', () => {
    render(<BillingDetailsForm profile={null} />)

    const said = document.body.textContent ?? ''
    expect(said).toMatch(/kept on your account/i)
    expect(said).toMatch(/not printed on invoices yet/i)
  })

  /**
   * "Optional" on a card headed "Billing details" invites the reading "optional
   * on your invoice", which is the opposite of true: it never appears on one.
   */
  it('no longer labels the address merely optional', () => {
    render(<BillingDetailsForm profile={null} />)

    const address = screen.getByLabelText(/address/i)
    expect(address).not.toHaveAttribute('placeholder', 'Optional')
  })

  it('carries no em dash, which is the standing ruling for prose', () => {
    render(<BillingDetailsForm profile={null} />)

    expect(document.body.textContent ?? '').not.toMatch(/[—–]/)
  })
})
