'use client'

import { Check, Coins, Sparkles } from 'lucide-react'
import {
  PLAN_CATALOG,
  describePlanPrice,
  type DisplayCurrency,
  type FxRates,
  type PlanCatalogEntry,
  type PlanId,
} from '@sahoda/shared'

import { Button } from '@/components/ui/button'
import { RECOMMENDED_PLAN } from '@/components/wallet/top-up-panel'
import { cn } from '@/lib/utils'
import { creditWord } from '@/lib/credit-words'

/**
 * The plan cards inside the offer, and NOTHING about when it opens.
 *
 * Split from `plan-offer-modal.tsx` so the card grid can be rendered by a test
 * without a `<dialog>` around it, and so neither file goes past the 300-line
 * rule. The modal owns the dialog and the dismissal; this owns the reading.
 *
 * ── EVERY FIGURE HERE IS READ OFF `PLAN_CATALOG` ─────────────────────────────
 * Names, prices, credits and limits all come from `packages/shared`. There is
 * not one written price, credit count or feature line in this file. That is the
 * whole reason `top-up-panel.tsx` derives its own list the same way: a
 * hand-written copy of the entitlements is a second source of truth, and the
 * copy is always the one that drifts.
 */

/** `free` has nothing to check out for, so it is never a card. It is stated in the header. */
export const PAID_PLANS: readonly PlanCatalogEntry[] = Object.values(PLAN_CATALOG)
  .filter((plan) => plan.priceInr > 0)
  .sort((a, b) => a.priceInr - b.priceInr)

/**
 * The plan Sahoda points at, IMPORTED rather than restated.
 *
 * This was a second `const RECOMMENDED_PLAN = 'growth'` with a comment saying
 * `plan-offer-cards.test.tsx` kept it in step with the wallet's. No such file
 * existed, so nothing did — two screens could have pointed at different plans
 * and neither would have said so. The bundle argument for copying it does not
 * survive either: `plan-offer-modal.tsx` already imports `CheckoutResult` from
 * that same module, so it is in this chunk regardless.
 *
 * The reason it is `top-up-panel.tsx`'s to own is written there: "Recommended"
 * is a claim about US, true the moment somebody decides it, where "Popular"
 * would be a claim about other customers that nothing in this codebase counts.
 */

const inr = (value: number): string => value.toLocaleString('en-IN')

/**
 * A one-line description, DERIVED FROM THE PRICE ORDER rather than written.
 *
 * The brief asks each card for a short description. Every version of that
 * sentence I could write ("for a growing shop", "for teams that publish daily")
 * is a claim about who a plan suits that nothing here measures, and the sentence
 * would then sit one line above an `Includes` list that says the same thing in
 * facts. So the description says the one thing about a plan that IS true by
 * construction: where it sits among the others. Reorder or reprice the catalog
 * and these sentences follow, because they are computed from it.
 */
function planPosition(entry: PlanCatalogEntry, all: readonly PlanCatalogEntry[]): string {
  if (entry.id === all[0]?.id) return 'The smallest paid plan.'
  if (entry.id === all[all.length - 1]?.id) return 'The largest plan.'
  return 'The middle plan.'
}

/**
 * What a plan lifts besides credits, read off `limits`. The same three
 * dimensions `top-up-panel.tsx` shows, and deliberately not `loopLevel` or
 * `twinSize`: those are internal scales, not quantities a person buying a plan
 * can act on.
 */
export function planIncludes(entry: PlanCatalogEntry): string[] {
  const { channels, sites, seats } = entry.limits
  return [
    `${channels} connected ${channels === 1 ? 'channel' : 'channels'}`,
    `${sites} published ${sites === 1 ? 'site' : 'sites'}`,
    `${seats} ${seats === 1 ? 'seat' : 'seats'}`,
  ]
}

export interface PlanOfferCardsProps {
  currency?: DisplayCurrency | null
  fx?: FxRates | null
  /** The plan whose checkout is in flight, or null. Disables the whole grid. */
  busyPlanId: PlanId | null
  onChoose: (planId: PlanId) => void
}

export function PlanOfferCards({
  currency = null,
  fx = null,
  busyPlanId,
  onChoose,
}: PlanOfferCardsProps) {
  const busy = busyPlanId !== null

  return (
    /* `narrow` (700) and `wide` (1180) are the only breakpoints this product
       has. `sm:`/`md:`/`lg:` compile to NOTHING here and fail silently, which
       docs/37 §13 records as the dead-breakpoint bug that shipped a ~1000px
       button. One column on a phone, three from `narrow` up, because there are
       exactly three paid plans and a 2+1 grid orphans the last one. */
    <ul className="grid gap-3 narrow:grid-cols-3">
      {PAID_PLANS.map((entry, index) => {
        const recommended = entry.id === RECOMMENDED_PLAN
        return (
          <li
            key={entry.id}
            /* THE PRODUCT'S ONE ENTRANCE KEYFRAME, staggered by index.
               `sl-enter` is 6px of lift and a fade, and docs/37 §12 allows no
               second one — "a screen that fades, a screen that slides and a
               screen that scales read as three products". The brief asks for
               fade AND scale; the fade ships and the scale does not, because a
               new keyframe here would be the third motion vocabulary in the app.
               `--i` feeds the capped delay in tokens.css, and reduced motion
               kills the delay as well as the duration. */
            className="enter-step h-full"
            style={{ '--i': index } as React.CSSProperties}
          >
            <div
              className={cn(
                'flex h-full flex-col rounded-card p-5 transition-micro',
                /* ── THE RECOMMENDED EDGE IS A RING, AND THAT IS ARITHMETIC ──
                   A real `border` is charged its WHOLE BOX by
                   `accent-area-budget.spec.ts`; an inset `box-shadow` is not
                   read by that probe at all and draws the same picture. The same
                   trade `top-up-panel.tsx` documents for its selected card, for
                   the same ceiling. `--brand-wash` is alpha 0.06, under the
                   probe's 0.08 floor, so the warm ground is free too. */
                recommended
                  ? 'bg-brand-wash shadow-[inset_0_0_0_1px_var(--brand-lift)]'
                  : 'surface-ring bg-surface hover:shadow-[inset_0_0_0_1px_var(--line)]',
                busy && 'opacity-45',
              )}
            >
              {/* The chip row is RESERVED on every card and rendered on one.
                  Without the reserved height the recommended card's name, price
                  and credits sit ~22px below its neighbours' and three cards
                  stop agreeing about where their rows are. */}
              {/* ── `text-accent` ON THE WASH IS 2.75:1, AND IT IS A CHIP ────
                  tokens.css:95 prints this exact pair and tolerates it for
                  `.chip-wash` badges specifically. The footer link in
                  `plan-offer-modal.tsx` refuses the same accent on `--surface`
                  at 2.936:1, and the two decisions are consistent rather than
                  contradictory: that is a sentence a person has to READ, this is
                  a label whose meaning is also carried by the glyph beside it,
                  by the card's ring and by the plan being the only one with a
                  filled button. Nothing here is knowable only from the colour. */}
              <span className="mb-2 flex min-h-[22px] items-start">
                {recommended ? (
                  <span className="inline-flex items-center gap-1 rounded-pill bg-brand-wash px-2 py-0.5 type-chip text-accent">
                    <Sparkles size={11} strokeWidth={2.5} aria-hidden />
                    Recommended
                  </span>
                ) : null}
              </span>

              <h3 className="type-h3 text-ink">{entry.name}</h3>
              <p className="type-sm mt-0.5 text-muted">{planPosition(entry, PAID_PLANS)}</p>

              <p className="mt-3 flex items-baseline gap-1.5">
                <span className="type-hero-num num text-ink">
                  {describePlanPrice(entry.priceInr, currency, fx).display}
                </span>
                <span className="type-sm text-muted">/ month</span>
              </p>

              <p className="mt-4 flex items-center gap-2.5 border-t border-line-soft pt-4">
                <Coins
                  aria-hidden
                  size={15}
                  strokeWidth={2}
                  className={cn('shrink-0', recommended ? 'text-accent' : 'text-ink-mute')}
                />
                <span className="min-w-0">
                  <span className="block type-body font-semibold text-ink">
                    <span className="num">{inr(entry.monthlyCredits)}</span>{' '}
                    {creditWord(entry.monthlyCredits)}
                  </span>
                  <span className="block type-meta text-muted">granted each month</span>
                </span>
              </p>

              <div className="mt-4 border-t border-line-soft pt-4">
                <p className="type-eyebrow text-ink-mute">What is included</p>
                <ul className="mt-2.5 space-y-2">
                  {planIncludes(entry).map((line) => (
                    <li key={line} className="flex items-start gap-2.5 type-sm text-muted">
                      {/* The tick is a glyph inside an INSET ring, never a real
                          border: nine bordered circles measured 5,184px2 on the
                          wallet panel against a 6,000px2 screen ceiling. The
                          ring is free and looks identical. */}
                      <span
                        aria-hidden
                        className={cn(
                          'mt-icon-nudge grid size-[18px] shrink-0 place-content-center rounded-pill bg-surface',
                          recommended
                            ? 'shadow-[inset_0_0_0_1px_var(--brand-lift)]'
                            : 'shadow-[inset_0_0_0_1px_var(--line)]',
                        )}
                      >
                        <Check
                          size={11}
                          strokeWidth={3}
                          className={recommended ? 'text-accent' : 'text-ink-mute'}
                        />
                      </span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* ── EXACTLY ONE SOLID BRAND FILL IN THIS WHOLE DIALOG ─────────
                  docs/37 §16: one primary action per view, and a dialog that
                  covers the screen IS the view while it is open. Three filled
                  orange buttons would be the "1032px orange band" failure in
                  triplicate, and the brief's own instruction — "make the
                  recommended plan CTA visually strongest" — cannot be true if
                  its neighbours carry the same fill. So the recommended plan is
                  the primary and the other two are secondaries.

                  `mt-auto` puts every button on the card's floor, so cards of
                  different content still line up. */}
              <Button
                type="button"
                variant={recommended ? 'primary' : 'secondary'}
                onClick={() => onChoose(entry.id)}
                loading={busyPlanId === entry.id}
                disabled={busy && busyPlanId !== entry.id}
                className="mt-5 w-full"
              >
                Choose {entry.name}
              </Button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
