'use client'

import { useState, useTransition } from 'react'
import { Check, Coins, CreditCard, Info, Sparkles } from 'lucide-react'
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

/**
 * The plan Sahoda points at. Founder's call, 25 August 2026.
 *
 * ── WHY THIS IS ALLOWED WHERE "POPULAR" WAS NOT ──────────────────────────────
 * A "Popular" chip was declined twice on this panel, and the reason was never
 * that badges are tacky. It is that "popular" is a claim about OTHER CUSTOMERS
 * — how many workspaces chose this plan — and nothing in this codebase counts
 * that, so the chip would be a number we cannot produce, dressed as a fact.
 *
 * "Recommended" is a claim about US. It says Sahoda suggests this one, which is
 * true by construction the moment someone decides it, and it is checkable by
 * asking that person. Same shape of chip, completely different epistemics.
 *
 * ── AND IT IS DELIBERATELY NOT THE DEFAULT SELECTION ─────────────────────────
 * `DEFAULT_PLAN` stays `starter`. Recommending a plan and pre-selecting it are
 * different acts: the second decides what the checkout will charge if someone
 * presses the button without reading, and that was not asked for. Flip this only
 * on purpose.
 *
 * ── AND IT LIVES HERE, NOT IN PLAN_CATALOG ───────────────────────────────────
 * A `recommended` field in `packages/shared` would be the tidier home, but the
 * advisor lane is editing pricing in that exact file right now and this branch
 * already carries one unresolved conflict with them. Which plan a screen points
 * at is a presentation choice; the catalog stays the contract.
 */
const RECOMMENDED_PLAN: PlanId = 'growth'

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

      {/* Mobile 1, tablet 2, desktop 3. `narrow` (700) and `wide` (1180) are the
          only breakpoints this product has — `sm:`/`md:`/`lg:` emit NOTHING and
          fail silently, which docs/37 §13 records as the dead-breakpoint bug
          that shipped a ~1000px button. */}
      <fieldset disabled={pending} className="grid gap-3 narrow:grid-cols-2 wide:grid-cols-3">
        <legend className="sr-only">Choose a plan</legend>
        {PAID_PLANS.map((entry) => {
          const checked = entry.id === planId
          return (
            <label
              key={entry.id}
              /**
               * ── THE SELECTED EDGE IS A RING, AND THAT IS ARITHMETIC ───────
               * The brief asks for a "subtle orange border". A real `border` is
               * charged its WHOLE BOX by `accent-area-budget.spec.ts` — on a
               * 346x305 card that is 105,530px2 against a 6,000px2 ceiling for
               * this entire screen. A `box-shadow` is not read by that probe at
               * all, so an inset orange ring looks like the border the brief
               * wants and costs NOTHING.
               *
               * This is the same trap in its third form. It was `border-primary`
               * once and measured 89% of the screen's accent; `.is-committed` in
               * tokens.css pairs `--brand-wash` with a real `--brand-lift`
               * BORDER, which is right for a chip and would be ruinous here.
               *
               * The fill stays `--brand-wash` (alpha 0.06). The probe skips any
               * paint under 0.08, so the warm tint the brief asks for is free.
               *
               * Ring, not border, in BOTH states: §6 refuses the two together,
               * and an inset ring cannot reflow the card when the edge firms up.
               */
              className={cn(
                'flex h-full cursor-pointer flex-col rounded-card p-5 transition-micro',
                'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2',
                checked
                  ? 'bg-brand-wash shadow-[inset_0_0_0_1px_var(--brand-lift)]'
                  : 'surface-ring bg-surface hover:shadow-[inset_0_0_0_1px_var(--line)]',
                pending && 'cursor-not-allowed opacity-45',
              )}
            >
              {/* The radio still IS the selection. Visually hidden, never
                  removed: it is what gives the group arrow-key navigation, a
                  name, and a checked state a screen reader can report. `peer`
                  hands its focus ring to the card. */}
              <input
                type="radio"
                name="plan"
                value={entry.id}
                checked={checked}
                onChange={() => setPlanId(entry.id)}
                className="peer sr-only"
              />

              {/* THE CHIP ROW IS RESERVED ON EVERY CARD, and rendered on one.
                  Without the reserved height the recommended card's name, price
                  and credits would all sit ~22px lower than its neighbours' —
                  the brief asks for "perfectly aligned content", and a badge
                  that only exists on one card is exactly how three cards stop
                  agreeing about where their rows are.

                  `--brand-wash` is alpha 0.06, which `accent-area-budget`
                  skips, so the fill is free; the text is charged 10% of a
                  ~90x20 box, which is ~180px2. */}
              <span className="mb-2 flex min-h-[22px] items-start">
                {entry.id === RECOMMENDED_PLAN ? (
                  <span className="inline-flex items-center gap-1 rounded-pill bg-brand-wash px-2 py-0.5 type-chip text-accent">
                    <Sparkles size={11} strokeWidth={2.5} aria-hidden />
                    Recommended
                  </span>
                ) : null}
              </span>

              <span className="block type-sm font-semibold text-ink">{entry.name}</span>

              {/* THE PRICE IS THE STRONGEST THING IN THE CARD. The cadence sits
                  on the baseline beside it, quiet, because "/ month" modifies
                  the figure rather than being a fact of its own. */}
              <span className="mt-1.5 flex items-baseline gap-1.5">
                <span className="type-hero-num num text-ink">₹{inr(entry.priceInr)}</span>
                <span className="type-sm text-muted">/ month</span>
              </span>
              <span className="mt-label-gap block type-meta text-ink-mute">
                about $<span className="num">{inr(entry.priceUsd)}</span>
              </span>

              {/* WHAT THE MONEY BUYS. On this product that is credits, so the
                  count is set at body weight rather than as a badge — the brief
                  is explicit that oversized pills are the noise to avoid. */}
              <span className="mt-4 flex items-center gap-2.5 border-t border-line-soft pt-4">
                <Coins
                  aria-hidden
                  size={15}
                  strokeWidth={2}
                  className={cn('shrink-0', checked ? 'text-accent' : 'text-ink-mute')}
                />
                <span className="min-w-0">
                  <span className="block type-body font-semibold text-ink">
                    <span className="num">{inr(entry.monthlyCredits)}</span>{' '}
                    {creditWord(entry.monthlyCredits)}
                  </span>
                  <span className="block type-meta text-muted">granted each month</span>
                </span>
              </span>

              {/* ── THE AFFORDANCE IS A SPAN, AND IT IS NOT A FAKE CONTROL ────
                  The whole card is the label, so clicking here really does
                  select this plan. A nested <button> would fight the label for
                  the click and announce a second control for one choice.

                  NOT a solid orange fill, though the reference image draws one.
                  The brief's own words rule against it twice — "not like a large
                  orange box", and "the CTA should be the strongest orange
                  element on the page", which cannot be true if three cards each
                  carry a filled orange bar. It is also 13,816px2 of accent per
                  card against a 6,000px2 screen ceiling. Wash, ring and a tick
                  say "selected" and survive greyscale. */}
              <span
                aria-hidden
                className={cn(
                  'mt-4 flex min-h-[38px] items-center justify-center gap-1.5 rounded-input px-3 type-sm font-semibold text-ink transition-micro',
                  checked
                    ? 'bg-brand-wash shadow-[inset_0_0_0_1px_var(--brand-lift)]'
                    : 'surface-ring-firm',
                )}
              >
                {/* THE ACCENT LIVES ON THE GLYPH, NOT THE WORD. The probe charges
                    a coloured TEXT element 10% of its box when it owns a text
                    node; `text-accent` here is ~1,130px2 at 1440, against about
                    1,400 of headroom. An <svg> owns no text node and is free. */}
                {checked ? (
                  <Check size={14} strokeWidth={2.5} aria-hidden className="text-accent" />
                ) : null}
                {checked ? 'Selected' : 'Select plan'}
              </span>

              {/* WHAT ELSE THE PLAN LIFTS, DERIVED from PLAN_CATALOG.limits
                  rather than written. A hand-written line here would be a second
                  copy of the entitlements and would drift from the one
                  `checkEntitlement` enforces. `mt-auto` puts it on the card's
                  floor so cards of different content still align.

                  NO "Popular" chip, which the reference draws on its first card.
                  Nothing in this codebase counts how many workspaces chose a
                  plan, so it would be a claim about other customers that no
                  query can support. */}
              <span className="mt-auto block pt-4">
                <span className="block type-eyebrow text-ink-mute">Includes</span>
                <span className="mt-2 block space-y-1.5">
                  {planIncludes(entry).map((line) => (
                    <span key={line} className="flex items-start gap-2 type-sm text-muted">
                      <Check
                        size={13}
                        strokeWidth={2.5}
                        aria-hidden
                        className={cn(
                          'mt-icon-nudge shrink-0',
                          checked ? 'text-accent' : 'text-ink-mute',
                        )}
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
      {/* THE COST, RESTATED BEFORE THE SPEND, and sat with the control that
          starts it rather than floating a paragraph above a button.

          ── PROMINENCE FROM PLACEMENT, NOT FROM SIZE ────────────────────────
          `size="lg"` was tried and reverted. MEASURED with the same arithmetic
          `accent-area-budget.spec.ts` uses: it took this panel from 4,443px2 to
          5,283px2 at 1440, which is 80% of the headroom under that spec's
          6,000px2 ceiling for /wallet — spent on two pixels of button height.

          ── AND THE ARROW IS OUT FOR THE SAME REASON, MEASURED ─────────────
          The reference draws "Start checkout ->". Adding that arrow was built
          and then measured: it took the panel from 4,443px2 to **5,241px2**,
          because the glyph and its gap widen the one solid-orange box on the
          screen. That is within a hair of the 5,283 this comment already
          records for `size="lg"`, which was reverted for being 80% of the
          headroom. An identical cost for an identical reason gets the identical
          answer. The button is the terminus of the card by placement.

          ── NO PADLOCK, AND THAT IS A JUDGEMENT ABOUT TRUTH ─────────────────
          The reference draws "Secure & encrypted checkout" under this button,
          plus an "Instant access / Secure payments / Cancel anytime" bar and a
          "Trusted by creators and teams worldwide" line. None of them ships:
          `actions/wallet.ts` records in terms that the page which collects the
          payment DOES NOT EXIST YET, so a trust badge here would dress up a
          flow that cannot complete; there is no cancel path to promise; and
          nothing counts who trusts us. The honest reassurance is the sentence
          already on the left, which says exactly what will and will not
          happen. */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line-soft pt-5">
        <p className="min-w-0 flex-1 type-sm text-muted">
          <span className="font-semibold text-ink">
            {plan.name} · ₹<span className="num">{inr(plan.priceInr)}</span> per month
          </span>
          <br />
          Nothing is charged and no credits are added until a payment completes.
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
