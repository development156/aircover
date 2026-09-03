import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CASHFREE_SDK_URL, CashfreeCheckout } from './cashfree-checkout'

/**
 * The bridge between a Cashfree order and the Cashfree JS SDK, with the SDK STUBBED.
 *
 * ── WHAT THIS PROVES AND WHAT IT DOES NOT ────────────────────────────────────
 * It proves the hand-over: the session id and the mode the page was given are the ones the
 * SDK receives, in the same tab, and that every way the hand-over can fail is a labelled
 * state with a working retry and no pretend success.
 *
 * It does NOT prove that Cashfree accepts the session. That needs a key pair Cashfree
 * honours, which this deployment does not have (both pairs answer 401 on both hosts, see
 * `cashfree.live.test.ts`). The seam between this component and a real payment page is the
 * part nothing has exercised end to end, and saying so is more useful than a test that
 * stubs both halves and proves the stub.
 */

type CheckoutOptions = { paymentSessionId: string; redirectTarget: string }

function stubSdk(checkout: (opts: CheckoutOptions) => Promise<unknown>) {
  const factory = vi.fn((_opts: { mode: string }) => ({ checkout }))
  ;(window as unknown as { Cashfree?: unknown }).Cashfree = factory
  return factory
}

function injectedScripts(): HTMLScriptElement[] {
  return Array.from(document.querySelectorAll('script')).filter((s) => s.src === CASHFREE_SDK_URL)
}

beforeEach(() => {
  delete (window as unknown as { Cashfree?: unknown }).Cashfree
})

afterEach(() => {
  for (const s of injectedScripts()) s.remove()
})

describe('with the SDK already on the page', () => {
  it('hands the session id and mode to Cashfree in the same tab when the customer presses pay', async () => {
    const checkout = vi.fn(async () => ({}))
    const factory = stubSdk(checkout)
    const user = userEvent.setup()

    render(
      <CashfreeCheckout paymentSessionId="session_abc123" mode="production" amountLabel="₹1,999" />,
    )

    await user.click(await screen.findByRole('button', { name: 'Pay ₹1,999 with Cashfree' }))

    expect(factory).toHaveBeenCalledWith({ mode: 'production' })
    expect(checkout).toHaveBeenCalledWith({
      paymentSessionId: 'session_abc123',
      redirectTarget: '_self',
    })
  })

  it('never invents an amount: without one the button is a verb, not a figure', async () => {
    stubSdk(async () => ({}))
    render(<CashfreeCheckout paymentSessionId="s" mode="sandbox" amountLabel={null} />)

    const button = await screen.findByRole('button', { name: 'Continue to payment' })
    expect(button).not.toHaveTextContent(/₹/)
  })

  it('says the payment page could not be opened, that nothing was charged, and offers to try again', async () => {
    const checkout = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue({})
    stubSdk(checkout)
    const user = userEvent.setup()
    render(<CashfreeCheckout paymentSessionId="s" mode="production" amountLabel="₹1,999" />)

    await user.click(await screen.findByRole('button', { name: 'Pay ₹1,999 with Cashfree' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/Sahoda could not open the Cashfree payment page/)
    expect(alert).toHaveTextContent(/Nothing was charged/)
    // The retry is a real second attempt, not a decorative button.
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(checkout).toHaveBeenCalledTimes(2))
  })
})

describe('when the SDK has to be loaded', () => {
  it('loads it from the Cashfree host, saying so meanwhile, and offers no pay button yet', () => {
    render(<CashfreeCheckout paymentSessionId="s" mode="production" amountLabel="₹1,999" />)

    expect(injectedScripts()).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent(/Loading the Cashfree payment page/)
    expect(screen.queryByRole('button', { name: /Pay/ })).not.toBeInTheDocument()
  })

  it('becomes payable once the script has loaded', async () => {
    render(<CashfreeCheckout paymentSessionId="s" mode="production" amountLabel="₹1,999" />)

    stubSdk(async () => ({}))
    injectedScripts()[0]?.dispatchEvent(new Event('load'))

    expect(await screen.findByRole('button', { name: 'Pay ₹1,999 with Cashfree' })).toBeEnabled()
  })

  it('names a failed load as one, with a retry that loads again, and never a fake success', async () => {
    const user = userEvent.setup()
    render(<CashfreeCheckout paymentSessionId="s" mode="production" amountLabel="₹1,999" />)

    injectedScripts()[0]?.dispatchEvent(new Event('error'))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/Sahoda could not load the Cashfree payment page/)
    expect(alert).toHaveTextContent(/Nothing was charged/)
    expect(screen.queryByRole('button', { name: /Pay/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    // The failed tag is gone and a fresh one is in flight: a retry that re-used the
    // failed element would never fire `load` again.
    await waitFor(() => expect(injectedScripts()).toHaveLength(1))
    expect(screen.getByRole('status')).toHaveTextContent(/Loading the Cashfree payment page/)
  })
})
