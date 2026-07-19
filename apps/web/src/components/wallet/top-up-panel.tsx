'use client'

import { useState, useTransition } from 'react'
import { CreditCard, Info } from 'lucide-react'
import { PLAN_CATALOG, type PlanCatalogEntry, type PlanId } from '@sahoda/shared'

import { startCheckout } from '@/app/actions/wallet'
import { Card, CardLabel } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { CheckoutState } from '@/lib/wallet/checkout-state'
import { cn } from '@/lib/utils'

/**
 * Only priced plans are offered. `free` is in `PlanIdSchema` but there is nothing
 * to check out for — listing it would be a button that cannot mean anything.
 */
const PAID_PLANS: readonly PlanCatalogEntry[] = Object.values(PLAN_CATALOG).filter(
  (plan) => plan.priceInr > 0,
)

const DEFAULT_PLAN: PlanId = 'starter'

const inr = (value: number): string => value.toLocaleString('en-IN')

export function TopUpPanel() {
  const [planId, setPlanId] = useState<PlanId>(DEFAULT_PLAN)
  const [result, setResult] = useState<CheckoutState | null>(null)
  const [pending, startTransition] = useTransition()

  const plan = PLAN_CATALOG[planId]

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
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-input border px-3 py-2.5 transition-micro',
                checked ? 'border-primary bg-s2' : 'border-line hover:bg-s2',
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
                <span className="block text-[14px] font-semibold">{entry.name}</span>
                {/* Cost before spend: price and what it grants, both from PLAN_CATALOG. */}
                <span className="block text-[13px] text-muted">
                  ₹<span className="tabular-nums">{inr(entry.priceInr)}</span> per month (about $
                  <span className="tabular-nums">{inr(entry.priceUsd)}</span>) ·{' '}
                  <span className="tabular-nums">{inr(entry.monthlyCredits)}</span> credits granted
                  each month
                </span>
              </span>
            </label>
          )
        })}
      </fieldset>

      <p className="text-[13px] text-muted">
        Starts a checkout session for {plan.name} — ₹
        <span className="tabular-nums">{inr(plan.priceInr)}</span> per month. Nothing is charged and
        no credits are added until a payment completes.
      </p>

      <Button
        type="button"
        onClick={start}
        loading={pending}
        data-guide="wallet.topup-start"
        className="w-full sm:w-auto"
      >
        Start checkout
      </Button>

      {/* Pending is never a bare spinner — say what is happening. */}
      <p aria-live="polite" className="min-h-[18px] text-[13px] text-faint">
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
    // The only provider wired today is the fixture double, whose checkout host
    // does not resolve. Rendering it as a link — or as a completed purchase —
    // would be a fake success, so it is labelled and left inert.
    return (
      // role="status": the pending line goes silent when the transition ends, so
      // without this a screen-reader user is never told the action finished.
      <div
        role="status"
        className="space-y-2 rounded-input bg-warn-bg px-3 py-2.5 text-[13px] text-warn"
      >
        <p className="flex items-center gap-2 font-semibold">
          <Info size={14} strokeWidth={2} aria-hidden />
          Simulated checkout — no payment rail is connected
        </p>
        <p>
          No payment was taken and no credits were added. This is what a {result.mode} session
          returns while billing is being wired.
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[12px]">
          <dt className="text-faint">mode</dt>
          <dd className="break-all">{result.mode}</dd>
          <dt className="text-faint">session</dt>
          <dd className="break-all">{result.sessionId}</dd>
          <dt className="text-faint">plan</dt>
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
