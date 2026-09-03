'use client'

import { Info } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { CheckoutState } from '@/lib/wallet/checkout-state'

/**
 * THE THREE OUTCOMES OF STARTING A CHECKOUT, RENDERED ONCE.
 *
 * ── WHY IT IS ITS OWN FILE, AND THE MEASUREMENT THAT PUT IT HERE ─────────────
 * It lived inside `top-up-panel.tsx` and was exported from there when the plan
 * offer needed it. That import cost **236.5 kB on /home**: importing one
 * component from that module pulls the whole wallet panel behind it — the FX
 * conversion, the ledger words, the catalogue grid — and `scripts/perf/js-budget.mjs`
 * failed the build, `/(app)/home 907.2 kB > 670.8 kB`. The guard is the reason
 * that regression never reached anybody; the file split is the fix.
 *
 * The `simulated` discriminant is why this may not be copied instead.
 * `checkout-state.ts` says it is explicit "so a caller must not be able to
 * render a fixture or sandbox session as a completed purchase by forgetting a
 * check", and two components each holding their own opinion about that is
 * exactly how one of them eventually forgets. One module, two importers,
 * neither dragging the other's weight.
 *
 * The markup, the copy and the props are unchanged from the wallet panel, with
 * ONE exception, and it is a rule catching up with code that moved rather than a
 * redesign. `design-lint`'s font-size ratchet is per FILE: four `text-[13px]`
 * and `text-[12px]` literals were inside `top-up-panel.tsx`'s grandfathered
 * baseline and became NEW the moment they landed in a file of their own, which
 * is exactly what the ratchet is for. They are now `type-sm` and `type-meta`.
 *
 * MEASURED, so this is not a look change smuggled in as a lint fix:
 * `--t-sm: 400 13px/18px` and `--t-xs: 400 12px/16px` (tokens.css:255-256), the
 * same sizes the literals asked for. The line height and word spacing the steps
 * add are the scale's, which the literals were missing.
 */
export function CheckoutResult({
  result,
  onRetry,
}: {
  result: CheckoutState
  onRetry: () => void
}) {
  if (!result.ok) {
    return (
      <div
        role="alert"
        className="space-y-2 rounded-input border border-danger-bg bg-danger-bg px-3 py-2.5 type-sm text-danger"
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
        className="space-y-2 rounded-input bg-warn-bg px-3 py-2.5 type-sm text-warn"
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
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono type-meta">
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
    <div role="status" className="space-y-2 rounded-input bg-ok-bg px-3 py-2.5 type-sm text-ok">
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
