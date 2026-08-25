'use client'

import { useState, useTransition } from 'react'
import { CreditCard, Info } from 'lucide-react'
import {
  PLAN_CATALOG,
  describeApproxPrice,
  type DisplayCurrency,
  type FxRates,
  type PlanCatalogEntry,
  type PlanId,
} from '@sahoda/shared'

import { startCheckout } from '@/app/actions/wallet'
import { Card, CardLabel } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { CheckoutState } from '@/lib/wallet/checkout-state'
import { cn } from '@/lib/utils'
import { creditWord } from '@/lib/credit-words'

/**
 * Only priced plans are offered. `free` is in `PlanIdSchema` but there is nothing
 * to check out for — listing it would be a button that cannot mean anything.
 */
const PAID_PLANS: readonly PlanCatalogEntry[] = Object.values(PLAN_CATALOG).filter(
  (plan) => plan.priceInr > 0,
)

const DEFAULT_PLAN: PlanId = 'starter'

const inr = (value: number): string => value.toLocaleString('en-IN')

export interface TopUpPanelProps {
  /**
   * The currency to approximate in, or null to show rupees alone. Resolved on
   * the server from the customer's declared billing country, falling back to the
   * edge's guess. Null is the ordinary case, not a failure.
   */
  currency?: DisplayCurrency | null
  /** Today's rates, or null when none could be fetched. Null shows rupees alone. */
  fx?: FxRates | null
}

/** The date a rate was read, for an "as of" line. Never a relative "today". */
const asOf = (iso: string): string =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(iso))

export function TopUpPanel({ currency = null, fx = null }: TopUpPanelProps) {
  const [planId, setPlanId] = useState<PlanId>(DEFAULT_PLAN)
  const [result, setResult] = useState<CheckoutState | null>(null)
  const [pending, startTransition] = useTransition()

  const plan = PLAN_CATALOG[planId]

  /**
   * The sentence that keeps the two figures apart, or null when only one is on
   * screen. Built here rather than in the markup so the "no approximation" case
   * renders NOTHING — an explanation of a number nobody can see is noise.
   */
  const selected = describeApproxPrice(plan.priceInr, currency, fx)
  const approxNote =
    selected.approx === null || selected.rateFetchedAt === null
      ? null
      : `Your card is charged in rupees. The ${currency} figure is an approximation at the rate published on ${asOf(selected.rateFetchedAt)}, and your bank will use its own rate and may add a foreign transaction fee.`

  function start() {
    setResult(null)
    startTransition(async () => {
      setResult(await startCheckout(planId))
    })
  }

  return (
    <Card data-guide="wallet.topup" className="space-y-4">
      <CardLabel>
        <CreditCard size={13} strokeWidth={2} aria-hidden />
        Top up credits
      </CardLabel>

      <fieldset disabled={pending} className="space-y-2">
        <legend className="sr-only">Choose a plan</legend>
        {PAID_PLANS.map((entry) => {
          const checked = entry.id === planId
          return (
            <label
              key={entry.id}
              /**
               * ── A SELECTED OPTION IS NOT AN URGENT ONE ────────────────────
               * This was `border-primary` when checked: a solid brand border
               * drawn all the way round a 1102x62 row. MEASURED at 1440 light
               * with the DOM accent probe, it was 72,864 of this screen's
               * 81,604 accent-bearing pixels — **89%** — which made a
               * pre-selected radio the loudest coloured object on the money
               * screen, louder than the balance the screen exists to report
               * and louder than its own Start checkout.
               *
               * docs/37 §2.3: the accent is spent on the one thing the screen
               * is for. Selection is carried by three signals that cost almost
               * nothing — a real fill step, a firmer ring, and the radio's own
               * dot, which keeps `accent-primary` because a 13px dot is where a
               * brand mark is unambiguous and cheap.
               *
               * Ring, not border, in BOTH states: §6 refuses the two together,
               * and an inset ring cannot reflow the row when the edge firms up.
               */
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-input px-3 py-2.5 transition-micro',
                checked ? 'surface-ring-firm bg-s2' : 'surface-ring hover:bg-s2',
                pending && 'cursor-not-allowed opacity-45',
              )}
            >
              <input
                type="radio"
                name="plan"
                value={entry.id}
                checked={checked}
                onChange={() => setPlanId(entry.id)}
                className="mt-1 accent-primary"
              />
              <span className="min-w-0">
                <span className="block type-body font-semibold">{entry.name}</span>
                {/* Cost before spend: price and what it grants, both from PLAN_CATALOG. */}
                <span className="block type-sm text-muted">
                  ₹<span className="tabular-nums">{inr(entry.priceInr)}</span> per month
                  {/*
                    The approximation, when there is an honest one to make. It is
                    rendered AFTER the rupee figure and marked "about" on purpose:
                    the charge settles in rupees, so this number is never what
                    reaches the card. The customer's own bank converts at its own
                    rate on the day and adds its own fee, and neither is visible
                    here — so presenting this as the price would be a figure no
                    query produced.
                  */}
                  {(() => {
                    const { approx } = describeApproxPrice(entry.priceInr, currency, fx)
                    return approx === null ? null : (
                      <>
                        {' '}
                        (about <span className="tabular-nums">{approx}</span>)
                      </>
                    )
                  })()}{' '}
                  · <span className="tabular-nums">{inr(entry.monthlyCredits)}</span>{' '}
                  {creditWord(entry.monthlyCredits)} granted each month
                </span>
              </span>
            </label>
          )
        })}
      </fieldset>

      <p className="text-[13px] text-muted">
        Starts a checkout session for {plan.name}, at ₹
        <span className="tabular-nums">{inr(plan.priceInr)}</span> per month. Nothing is charged and
        no credits are added until a payment completes.
      </p>

      {/*
        SAYS WHAT THE OTHER FIGURE IS, and only when one was shown.

        Without this the panel carries two numbers and no statement of which one
        is the charge. The approximation is the more legible of the two to a
        customer reading in their own currency, so silence here would let the
        wrong number read as the price.

        It names the rate's DATE rather than calling it current. A rate is a
        published daily figure, not a live quote, and an undated one is exactly
        the shape the old hardcoded 88 took while it drifted.
      */}
      {approxNote !== null ? <p className="type-sm text-muted">{approxNote}</p> : null}

      <Button
        type="button"
        onClick={start}
        loading={pending}
        data-guide="wallet.topup-start"
        className="w-full narrow:w-auto"
      >
        Start checkout
      </Button>

      {/* Pending is never a bare spinner — say what is happening. */}
      <p aria-live="polite" className="min-h-[18px] text-[13px] text-muted">
        {pending ? 'Starting a checkout session…' : ''}
      </p>

      {result !== null ? <CheckoutResult result={result} onRetry={start} /> : null}
    </Card>
  )
}

function CheckoutResult({ result, onRetry }: { result: CheckoutState; onRetry: () => void }) {
  if (!result.ok) {
    return (
      <div
        role="alert"
        className="space-y-2 rounded-input border border-danger-bg bg-danger-bg px-3 py-2.5 text-[13px] text-danger"
      >
        <p>{result.message} No payment was started and you were not charged.</p>
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
          Start checkout
        </Button>
      </div>
    )
  }

  if (result.simulated) {
    // A REAL Cashfree order now exists for this session — but in the sandbox, where no money
    // moves, and the page that would collect the payment (`/billing/checkout/{orderId}`,
    // which hands `payment_session_id` to `cashfree-js`) is not built yet. So this is
    // labelled and left inert: rendering it as a link, or as a completed purchase, would be
    // a fake success. The old copy claimed "no payment rail is connected", which stopped
    // being true the moment the fixture double was replaced.
    return (
      // role="status": the pending line goes silent when the transition ends, so
      // without this a screen-reader user is never told the action finished.
      <div
        role="status"
        className="space-y-2 rounded-input bg-warn-bg px-3 py-2.5 text-[13px] text-warn"
      >
        <p className="flex items-center gap-2 font-semibold">
          <Info size={14} strokeWidth={2} aria-hidden />
          {result.mode === 'sandbox'
            ? 'Sandbox order created. No real money moves'
            : 'Simulated checkout. No payment rail is connected'}
        </p>
        <p>
          {result.mode === 'sandbox'
            ? 'A real Cashfree order was opened in test mode. Nothing was charged and no credits were added. Credits arrive only after a completed payment is confirmed. The payment page is not reachable from the app yet.'
            : `No payment was taken and no credits were added. This is what a ${result.mode} session returns while billing is being wired.`}
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[12px]">
          <dt className="text-muted">mode</dt>
          <dd className="break-all">{result.mode}</dd>
          <dt className="text-muted">session</dt>
          <dd className="break-all">{result.sessionId}</dd>
          <dt className="text-muted">plan</dt>
          <dd className="break-all">{result.planId}</dd>
        </dl>
      </div>
    )
  }

  return (
    <div role="status" className="space-y-2 rounded-input bg-ok-bg px-3 py-2.5 text-[13px] text-ok">
      <p className="font-semibold">Checkout session ready</p>
      <p>
        Credits are added once the payment completes. Session{' '}
        <span className="font-mono break-all">{result.sessionId}</span>.
      </p>
      <a
        href={result.url}
        rel="noopener noreferrer"
        target="_blank"
        className="inline-block font-semibold underline underline-offset-2"
      >
        Open the payment page
      </a>
    </div>
  )
}
