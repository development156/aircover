'use client'

import { useState, useTransition } from 'react'
import { Check, CreditCard, Info } from 'lucide-react'
import { PLAN_CATALOG, type PlanCatalogEntry, type PlanId } from '@sahoda/shared'

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

/**
 * What a plan lifts besides credits, READ OFF `limits` rather than written.
 *
 * A hand-written feature list here would be a second copy of the entitlements,
 * and the one that drifts is always the copy — `cheapestPlanWithAtLeast` exists
 * in `packages/shared` for exactly this reason, and its own comment records a
 * hand-written upgrade sentence that named a plan three times the price of the
 * one the customer needed. Derived lines cannot make that mistake.
 *
 * `loopLevel` and `twinSize` are deliberately absent: they are internal scales,
 * not quantities a person buying credits can act on.
 */
function planIncludes(entry: PlanCatalogEntry): string[] {
  const { channels, sites, seats } = entry.limits
  return [
    `${channels} connected ${channels === 1 ? 'channel' : 'channels'}`,
    `${sites} published ${sites === 1 ? 'site' : 'sites'}`,
    `${seats} ${seats === 1 ? 'seat' : 'seats'}`,
  ]
}

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
      <div className="space-y-1">
        <CardLabel>
          <CreditCard size={13} strokeWidth={2} aria-hidden />
          Top up credits
        </CardLabel>
        <p className="type-sm text-muted">
          A plan grants its credits every month. Pick one, then start a checkout.
        </p>
      </div>

      <fieldset disabled={pending} className="grid gap-3 wide:grid-cols-3">
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
               * is for. Selection is carried by signals that cost almost
               * nothing — a real fill step and a firmer ring.
               *
               * ── THE WASH IS FREE, AND THAT IS WHY IT IS THE ONE ORANGE ────
               * `--brand-wash` is `rgba(255,102,0,0.06)`, and
               * `accent-area-budget.spec.ts` skips any paint under alpha 0.08.
               * So the selected card reads unmistakably orange and charges the
               * budget NOTHING. `--brand-lift` (0.4) as a border would be
               * charged its whole box, which on a card this size is the 89%
               * failure above, rediscovered. THE SAME RULE BINDS THE CARD
               * LAYOUT: three cards are three times the area, so a charged
               * border here would be three times as bad as the row it replaced.
               *
               * Ring, not border, in BOTH states: §6 refuses the two together,
               * and an inset ring cannot reflow the card when the edge firms up.
               */
              className={cn(
                'flex cursor-pointer flex-col rounded-card p-4 transition-micro',
                'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2',
                checked ? 'surface-ring-firm bg-brand-wash' : 'surface-ring bg-surface hover:bg-s2',
                pending && 'cursor-not-allowed opacity-45',
              )}
            >
              {/* THE RADIO IS THE SELECTION, still. It is visually hidden rather
                  than removed: the native control is what gives this group
                  arrow-key navigation, a name, and a checked state a screen
                  reader can report. `peer` hands its focus ring to the card, so
                  keyboard focus stays visible with no control drawn. */}
              <input
                type="radio"
                name="plan"
                value={entry.id}
                checked={checked}
                onChange={() => setPlanId(entry.id)}
                className="peer sr-only"
              />

              <span className="block type-h3">{entry.name}</span>

              {/* THE PRICE IS THE OBJECT. `.num` is tabular so the three line up
                  down the row; the cadence sits on the baseline beside it
                  rather than under it, because "per month" modifies the figure
                  and a stacked label reads as a separate fact. */}
              <span className="mt-3 flex items-baseline gap-1.5">
                <span className="type-hero-num num text-ink">₹{inr(entry.priceInr)}</span>
                <span className="type-sm text-muted">per month</span>
              </span>
              <span className="mt-label-gap block type-meta text-muted">
                about $<span className="num">{inr(entry.priceUsd)}</span>
              </span>

              {/* WHAT THE MONEY BUYS, which on this product is credits and not
                  seats. Stated before the control, never after. */}
              <span className="mt-3 block type-sm text-muted">
                <span className="num font-semibold text-ink">{inr(entry.monthlyCredits)}</span>{' '}
                {creditWord(entry.monthlyCredits)} granted each month
              </span>

              {/* ── THE AFFORDANCE IS A SPAN, AND IT IS NOT A FAKE CONTROL ────
                  The whole card is the label, so clicking here really does
                  select this plan. A nested <button> would fight the label for
                  the click and announce a second control for one choice, which
                  is the "two vocabularies for one slot" shape this codebase
                  keeps ruling against. The radio above carries the semantics.

                  It is `text-accent` on the card's own wash, never a
                  `--brand-lift` border: colour on TEXT is a few hundred px2,
                  a border is the whole box. */}
              <span
                aria-hidden
                className={cn(
                  'mt-4 flex min-h-[36px] items-center justify-center gap-1.5 rounded-input px-3 type-sm font-semibold transition-micro',
                  'text-ink',
                  checked ? 'surface-ring-firm' : 'surface-ring',
                )}
              >
                {/* THE ACCENT LIVES ON THE GLYPH, NOT THE WORD, and that is
                    arithmetic rather than taste. `accent-area-budget.spec.ts`
                    charges a coloured TEXT element 10% of its own box, and only
                    when it owns a text node directly. `text-accent` on this span
                    is ~314x36x0.1 = 1,130px2 at 1440 — against roughly 1,400px2
                    of headroom under /wallet's 6,000 ceiling, which is the same
                    80%-of-headroom trap `size="lg"` was reverted for above. An
                    <svg> owns no text node, so the tick is charged NOTHING and
                    reads just as orange. */}
                {checked ? (
                  <Check size={14} strokeWidth={2.5} aria-hidden className="text-accent" />
                ) : null}
                {checked ? 'Selected' : 'Select plan'}
              </span>

              {/* WHAT ELSE THE PLAN LIFTS, DERIVED from PLAN_CATALOG.limits
                  rather than written. A hand-written line here would be a
                  second copy of the entitlements and would drift from the one
                  `checkEntitlement` actually enforces. `mt-auto` puts it on the
                  card's floor so three cards of different content still align.

                  NO "Popular" or "Best value" chip, which the reference carries
                  on its middle card. Nothing in this codebase counts how many
                  workspaces chose a plan, so the chip would be a claim about
                  other customers that no query can support. */}
              <span className="mt-auto block border-t border-line-soft pt-3">
                <span className="block type-eyebrow text-ink-mute">Includes</span>
                <span className="mt-1.5 block space-y-1">
                  {planIncludes(entry).map((line) => (
                    <span key={line} className="flex items-start gap-1.5 type-sm text-muted">
                      <Check
                        size={13}
                        strokeWidth={2.5}
                        aria-hidden
                        className="mt-icon-nudge shrink-0 text-ink-mute"
                      />
                      <span>{line}</span>
                    </span>
                  ))}
                </span>
              </span>
            </label>
          )
        })}
      </fieldset>

      {/* THE COST, RESTATED BEFORE THE SPEND, and sat with the control that
          starts it rather than floating a paragraph above a button. The claim
          is unchanged: nothing is charged until a payment completes.

          ── PROMINENCE FROM PLACEMENT, NOT FROM SIZE ────────────────────────
          `size="lg"` was tried and reverted. MEASURED with the same arithmetic
          `accent-area-budget.spec.ts` uses: it took this panel from 4,443px2 to
          5,283px2 at 1440, which is 80% of the headroom under that spec's
          6,000px2 ceiling for /wallet — spent on two pixels of button height,
          and unverifiable here because Playwright cannot run in this sandbox.
          A divider, a footer row and the right edge make it the terminus of the
          card for free. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-4">
        <p className="min-w-0 flex-1 type-meta text-muted">
          {plan.name}, ₹<span className="num">{inr(plan.priceInr)}</span> per month. Nothing is
          charged and no credits are added until a payment completes.
        </p>
        <Button
          type="button"
          onClick={start}
          loading={pending}
          data-guide="wallet.topup-start"
          /* NOT `sm:w-auto`. docs/37 §13 records this exact line as the dead
             breakpoint that rendered the loudest object in the product as a
             ~1000px bar at 1440. `narrow` is a real breakpoint here. */
          className="w-full narrow:w-auto"
        >
          Start checkout
        </Button>
      </div>

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
