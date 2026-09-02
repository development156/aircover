'use client'

import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'

/**
 * The payment step: hands a Cashfree order's `payment_session_id` to the Cashfree JS SDK.
 *
 * ── WHY A SCRIPT TAG AND NOT A PACKAGE ───────────────────────────────────────
 * Cashfree publishes no hosted-checkout URL. Create Order returns a session id for its
 * browser SDK, which the app has to load itself. The SDK is loaded from Cashfree's own host
 * on this page only, not bundled: `@cashfreepayments/cashfree-js` is a thin loader for the
 * same URL, and a dependency for one page is weight on every page (`scripts/perf/js-budget`
 * is the guard that would have said so). `lib/security/csp.ts` sets no `script-src`, so the
 * tag is allowed.
 *
 * ── EVERY WAY IT CAN FAIL IS A LABELLED STATE ────────────────────────────────
 * The script may not load (blocked network, an extension, Cashfree down); the SDK may refuse
 * the session (expired, already paid, wrong mode). Each is named as itself with a retry that
 * does the same thing again, and none of them renders anything that reads as a payment
 * having happened. Credits are written by the webhook alone, so no state here may claim them.
 *
 * `redirectTarget: '_self'` keeps the customer in this tab: Cashfree returns them to the
 * `return_url` the order was opened with, and a second tab left on this page would keep
 * offering to pay an order that is already paid.
 */

export const CASHFREE_SDK_URL = 'https://sdk.cashfree.com/js/v3/cashfree.js'

/** The SDK's own mode vocabulary. Not the env name: Cashfree says `production`, not `live`. */
export type CashfreeSdkMode = 'sandbox' | 'production'

interface CashfreeSdk {
  checkout(options: {
    paymentSessionId: string
    redirectTarget: '_self' | '_blank' | '_modal'
  }): Promise<unknown>
}

type CashfreeFactory = (options: { mode: CashfreeSdkMode }) => CashfreeSdk

function sdkFactory(): CashfreeFactory | null {
  const candidate = (window as unknown as { Cashfree?: unknown }).Cashfree
  return typeof candidate === 'function' ? (candidate as CashfreeFactory) : null
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'opening' }
  /** The script tag fired `error`: the SDK never arrived. */
  | { kind: 'unavailable' }
  /** The SDK arrived and threw when asked to open the session. */
  | { kind: 'refused' }

export interface CashfreeCheckoutProps {
  paymentSessionId: string
  mode: CashfreeSdkMode
  /**
   * The amount already formatted by the server (`rupees`), or `null` when the order stated
   * none. Never computed here: this component does no money arithmetic, so it cannot
   * disagree with what the card is charged.
   */
  amountLabel: string | null
}

export function CashfreeCheckout({ paymentSessionId, mode, amountLabel }: CashfreeCheckoutProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  // Bumped by "Try again" after a failed load so the effect runs once more with a fresh tag.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (sdkFactory()) {
      setPhase({ kind: 'ready' })
      return
    }

    setPhase({ kind: 'loading' })
    const script = document.createElement('script')
    script.src = CASHFREE_SDK_URL
    script.async = true
    const onLoad = () => setPhase(sdkFactory() ? { kind: 'ready' } : { kind: 'unavailable' })
    const onError = () => setPhase({ kind: 'unavailable' })
    script.addEventListener('load', onLoad)
    script.addEventListener('error', onError)
    document.head.appendChild(script)

    // A failed tag is removed on retry: re-appending the same element never fires again.
    return () => script.remove()
  }, [attempt])

  async function pay() {
    const factory = sdkFactory()
    if (!factory) {
      setPhase({ kind: 'unavailable' })
      return
    }
    setPhase({ kind: 'opening' })
    try {
      await factory({ mode }).checkout({ paymentSessionId, redirectTarget: '_self' })
      // With `_self` the SDK navigates away; if it resolved and did not, the customer is
      // still here and may press again.
      setPhase({ kind: 'ready' })
    } catch {
      setPhase({ kind: 'refused' })
    }
  }

  if (phase.kind === 'loading') {
    return (
      <p role="status" className="type-sm mt-4 text-muted">
        Loading the Cashfree payment page…
      </p>
    )
  }

  if (phase.kind === 'unavailable') {
    return (
      <div
        role="alert"
        className="mt-4 space-y-2 rounded-input bg-danger-bg px-3 py-2.5 type-sm text-danger"
      >
        <p>
          Sahoda could not load the Cashfree payment page. Nothing was charged. Check your
          connection, or an extension that blocks scripts, and try again.
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setAttempt((n) => n + 1)}
        >
          Try again
        </Button>
      </div>
    )
  }

  const label = amountLabel ? `Pay ${amountLabel} with Cashfree` : 'Continue to payment'

  return (
    <div className="mt-4 space-y-2">
      {phase.kind === 'refused' ? (
        <div role="alert" className="rounded-input bg-danger-bg px-3 py-2.5 type-sm text-danger">
          Sahoda could not open the Cashfree payment page for this order. Nothing was charged. If it
          keeps happening, start a new order from the wallet.
        </div>
      ) : null}
      <Button
        type="button"
        onClick={pay}
        loading={phase.kind === 'opening'}
        className="w-full narrow:w-auto"
      >
        {phase.kind === 'refused' ? 'Try again' : label}
      </Button>
      <p className="type-sm text-muted">
        Cashfree takes the payment on its own page and brings you back to Sahoda when it is done.
        Credits land once Cashfree confirms the payment to Sahoda, usually within a minute.
      </p>
    </div>
  )
}
