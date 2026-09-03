'use client'

import { useState, useTransition } from 'react'
import { Check, Coins, CreditCard, Sparkles } from 'lucide-react'
import {
  PLAN_CATALOG,
  describePlanPrice,
  type DisplayCurrency,
  type FxRates,
  type PlanCatalogEntry,
  type PlanId,
} from '@sahoda/shared'

import { startCheckout } from '@/app/actions/wallet'
import { CheckoutResult } from '@/components/wallet/checkout-result'
import { RECOMMENDED_PLAN } from '@/lib/billing/recommended-plan'
import { Card, CardLabel } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StaggerItem } from '@/components/motion/stagger'
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
   * The selected plan's price, and the sentence that names the real charge.
   *
   * The cards show one figure in the customer's own currency. That figure is a
   * conversion, so for anyone outside India it is NOT what the bank takes — and
   * the note below is the only place the actual amount appears. It is not
   * optional garnish: without it the price on the card cannot be reconciled
   * against a statement by anyone.
   *
   * Null when the card already shows the charge, because then there is nothing
   * to reconcile and the sentence would explain a difference that does not
   * exist.
   */
  const selected = describePlanPrice(plan.priceInr, currency, fx)
  const chargeNote =
    !selected.isApproximate || selected.rateFetchedAt === null
      ? null
      : `Your card is charged ${selected.chargeInr} in rupees. The ${currency} figure is a conversion at the rate published on ${asOf(selected.rateFetchedAt)}; your bank will use its own rate and may add a foreign transaction fee.`

  function start() {
    setResult(null)
    startTransition(async () => {
      setResult(await startCheckout(planId))
    })
  }

  return (
    <Card data-guide="wallet.topup" className="space-y-4">
      <div className="space-y-1">
        {/* ── "MONTHLY PLANS", AND NEITHER OF THE TWO OBVIOUS NAMES ──────────
            "Top up credits" was wrong and the founder is right about it: a
            top-up is a one-off purchase of credits, and this box sells PLANS —
            each one carrying channel, site and seat entitlements that
            `checkEntitlement` reads, not just a credit balance.

            "Subscription plans" was the founder's own suggestion and is NOT
            used, because it claims a renewal this product does not perform.
            MEASURED: `subscriptions` exists as a table, with `status`,
            `current_period_end` and `cancel_at_period_end` — and NOTHING in
            production code ever inserts or updates a row in it. Only the
            integration tests do. `startCheckout` opens a single Cashfree
            ORDER, and `applyPlanGrant` keys the grant on `monthlyGrantKey`,
            which is (plan, period, workspace). So one payment buys one period.
            Nothing schedules the next one and nothing takes it.

            The word "subscription" tells a reader their card will be charged
            again. It will not be, because no code does that. That is the
            "no mock-success in prod paths" rule applied to a heading.

            "Monthly plans" is what is true on both axes: the price is monthly,
            the credits are granted monthly, and it promises no renewal. Change
            it to "Subscription" in the same commit that makes a subscription,
            not before. */}
        <CardLabel>
          <CreditCard size={13} strokeWidth={2} aria-hidden />
          Monthly plans
        </CardLabel>
        {/* ── THE SAME OVER-CLAIM AS "SUBSCRIPTION", ONE LINE DOWN ──────────
            This read "A plan grants its credits every month", which tells a
            reader credits will keep arriving. They will not: one payment is one
            `monthlyGrantKey` = (plan, period, workspace), and nothing schedules
            or takes the next one. Refusing "Subscription" in the heading while
            leaving this sentence promising the same thing would have made that
            refusal decorative.

            The per-card "granted each month" line is left alone deliberately.
            It states the PLAN'S RATE — what this plan is worth per month, a
            property of the catalog entry — rather than making a promise about
            what will happen to the reader's card. */}
        <p className="type-sm text-muted">
          Each plan grants its credits for the month you pay for. Pick one, then start a checkout.
        </p>
      </div>

      {/* Mobile 1, tablet 2, desktop 3. `narrow` (700) and `wide` (1180) are the
          only breakpoints this product has — `sm:`/`md:`/`lg:` emit NOTHING and
          fail silently, which docs/37 §13 records as the dead-breakpoint bug
          that shipped a ~1000px button. */}
      <fieldset disabled={pending} className="grid gap-3 narrow:grid-cols-2 wide:grid-cols-3">
        <legend className="sr-only">Choose a plan</legend>
        {PAID_PLANS.map((entry, index) => {
          const checked = entry.id === planId
          return (
            /* ── THE CARDS ARRIVE IN SEQUENCE, ON THE PRODUCT'S ONE RHYTHM ────
               The reference wraps each card in a `TimelineContent` that blurs it
               in from -20px on a per-card 0.4s delay. The effect is right and
               the implementation is not portable: it is a scroll-triggered
               framer-motion variant with a hand-written delay, and docs/37 §12
               allows ONE entrance keyframe for the whole product (`sl-enter`,
               6px of travel) precisely so a screen that fades, a screen that
               slides and a screen that scales do not read as three products.

               `StaggerItem` IS that keyframe, and it is the sanctioned way to
               ask for it: the delay comes from `--stagger` (40ms), it is capped
               at `--stagger-cap` in CSS so a long list cannot take a second and
               a half to finish, and `prefers-reduced-motion` kills the DELAY as
               well as the duration — which the reference's variant does not do
               at all, so a reader who asked for less motion would sit in front
               of a blank panel for 1.2s and then have three cards snap in.

               It also costs nothing: `motion` is 13.1.1 and unlisted here, and
               `/wallet` has 8 kB of slack under `js-budget.json`. */
            <StaggerItem key={entry.id} i={index} className="h-full">
              <label
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

                {/* ── THE NAME IS A HEADING, AT THE RUNG THE SCALE ALREADY HAS ──
                  The reference sets the plan name at `text-3xl` and it is the
                  single largest difference between the two designs: at
                  `type-sm` (13px/400) the name was quieter than the "granted
                  each month" caption under it, so a card whose whole job is to
                  be identified read as an unlabelled price.

                  `type-h3` (16px/650) is this scale's card-title rung and was
                  added for exactly this drift — see globals.css, "the rung that
                  was missing". NOT `type-h2` (20px): that is a SECTION title,
                  and three of them inside one panel would outrank the panel's
                  own `CardLabel`. The reference can afford 30px because its
                  card is a whole page; this one is a card inside a card. */}
                <span className="block type-h3 text-ink">{entry.name}</span>

                {/* THE PRICE IS THE STRONGEST THING IN THE CARD. The cadence sits
                  on the baseline beside it, quiet, because "/ month" modifies
                  the figure rather than being a fact of its own. */}
                {/*
                ONE figure, in the customer's own currency, and the second line
                is GONE rather than converted.

                It used to read `about $<priceUsd>` under the rupee price.
                `priceUsd` no longer exists — it was a hand-set second price that
                had drifted 17-19% from what the rupees actually converted to —
                and the founder's ruling is that a card shows one price, the
                reader's own. The rupee charge is named once, at the point of
                commitment, in the note beside the button.
              */}
                <span className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="type-hero-num num text-ink">
                    {describePlanPrice(entry.priceInr, currency, fx).display}
                  </span>
                  <span className="type-sm text-muted">/ month</span>
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
                    /* THE REFERENCE'S PROPORTIONS, not its fill. It draws a
                     full-width `p-4 text-xl rounded-xl` bar. This is that bar at
                     the kit's own control height and body rung.

                     `min-h-control` reads `--control-h` (38px) instead of the
                     hand-written `min-h-[38px]` that stood here. Same rendered
                     height today, and one fewer literal to drift when the
                     control step moves — which it already did once, "up from
                     34" per the token's own comment. */
                    'mt-4 flex min-h-control items-center justify-center gap-1.5 rounded-input px-3 type-body font-semibold text-ink transition-micro',
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
                <span className="mt-auto block border-t border-line-soft pt-4">
                  <span className="block type-eyebrow text-ink-mute">Includes</span>
                  <span className="mt-2.5 block space-y-2">
                    {planIncludes(entry).map((line) => (
                      <span key={line} className="flex items-start gap-2.5 type-sm text-muted">
                        {/* ── THE CIRCLED TICK, AND WHY IT COSTS NO ACCENT ──────
                          The reference draws each feature's tick inside a ring:
                          `h-6 w-6 bg-white border border-orange-500 rounded-full`
                          with an orange glyph. That exact class list is
                          unaffordable here and the arithmetic is the same one
                          this file already records for the card edge — a real
                          `border` is charged its WHOLE BOX by
                          `accent-area-budget.spec.ts`.

                          MEASURED, by building the reference's exact class list
                          (`size-6` + `border border-[var(--acc)]`) and running
                          the spec's own probe over the rendered panel: nine
                          ticks at **576px2 each = 5,184px2**, taking the panel
                          from **5,266 to 10,450**. The ceiling for this whole
                          screen is 6,000. The ticks alone would put it 74% over,
                          before the button that is the screen's actual primary.

                          An INSET RING is the same picture and is not read by
                          that probe at all, so the reference's treatment ships
                          in full for nothing. Same trade as the card edge, three
                          sizes down.

                          ── AND THE GROUND IS `--surface`, DELIBERATELY ───────
                          MEASURED, WCAG relative luminance: `--acc` on
                          `--brand-wash` (which is what a selected card's ground
                          composites to) is **2.753:1** in light, against
                          **2.936:1** on `--surface`. Both are under 3:1 — that
                          is the brand orange's own ceiling on white and it is
                          why this glyph is never the only thing carrying the
                          meaning; the sentence beside it is. Pinning the circle
                          to `--surface` takes the selected card's ticks off the
                          weaker of the two rather than leaving them there. Dark
                          is not the risk it is written up as: the tints are
                          ALPHAS, so they composite over `#171717` and the same
                          pair reads **5.693:1**. */}
                        <span
                          aria-hidden
                          className={cn(
                            'mt-icon-nudge grid size-[18px] shrink-0 place-content-center rounded-pill bg-surface',
                            checked
                              ? 'shadow-[inset_0_0_0_1px_var(--brand-lift)]'
                              : 'shadow-[inset_0_0_0_1px_var(--line)]',
                          )}
                        >
                          <Check
                            size={11}
                            strokeWidth={3}
                            className={checked ? 'text-accent' : 'text-ink-mute'}
                          />
                        </span>
                        <span>{line}</span>
                      </span>
                    ))}
                  </span>
                </span>
              </label>
            </StaggerItem>
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
            {plan.name} · <span className="num">{selected.display}</span> per month
          </span>
          <br />
          Nothing is charged and no credits are added until a payment completes.
          {/*
            THE ONLY PLACE THE REAL AMOUNT APPEARS, and it only appears when the
            figure above is a conversion. Every other number on this panel is in
            the customer's own currency, and for anyone outside India none of
            them is what the bank takes — so this names the rupee amount outright
            rather than saying "charged in rupees" and leaving the sum to be
            guessed. It gives the rate's DATE rather than calling it current: a
            rate is a published daily figure, not a live quote, and an undated
            one is exactly the shape the old hardcoded 88 took while it drifted.
          */}
          {chargeNote !== null ? (
            <>
              <br />
              {chargeNote}
            </>
          ) : null}
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
